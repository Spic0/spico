import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest, ApiAuthError } from "@/lib/apiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, claimIdempotencyKey, rateLimitHeaders } from "@/lib/rateLimit";
import { generateConfirmationCode, nightsBetween, OCCUPYING_STATUSES } from "@/lib/pms";
import { emitWebhookEvent } from "@/lib/webhooks";
import { writeAuditLog } from "@/lib/audit";

// POST /api/v1/reservations — requires the "write:reservations" scope.
// Creates a real guest + a `pending` reservation (same status/lifecycle as
// M6's internal flow and M7's public booking engine — a human still confirms
// it). Supports an optional `Idempotency-Key` header (backed by Upstash when
// configured; a no-op otherwise, see lib/rateLimit.ts) so a retried request
// after a network timeout doesn't create a duplicate reservation.

const schema = z.object({
  guestFirstName: z.string().min(1).max(120),
  guestLastName: z.string().min(1).max(120),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().max(60).optional(),
  roomTypeId: z.string().min(1),
  ratePlanId: z.string().optional(),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(20).default(1),
  children: z.number().int().min(0).max(20).default(0),
  source: z.string().max(60).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await authenticateApiRequest(request, "write:reservations");

    const rl = await checkRateLimit(`api:${auth.apiKeyId}`, 30, 60);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const idempotencyKeyHeader = request.headers.get("idempotency-key");
    if (idempotencyKeyHeader) {
      const claim = await claimIdempotencyKey(`${auth.apiKeyId}:${idempotencyKeyHeader}`, 86400);
      if (!claim.isNew) {
        return NextResponse.json(
          { error: "Duplicate request: this Idempotency-Key was already used within the last 24 hours" },
          { status: 409, headers: rateLimitHeaders(rl) },
        );
      }
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" }, { status: 400 });
    }
    const p = parsed.data;

    const nights = nightsBetween(p.checkInDate, p.checkOutDate);
    if (nights < 1) {
      return NextResponse.json({ error: "checkOutDate must be after checkInDate" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: hotel } = await admin
      .from("hotels")
      .select("id, organization_id, default_currency, status")
      .eq("id", auth.hotelId)
      .single();
    if (!hotel || hotel.status !== "active") {
      return NextResponse.json({ error: "Hotel not found or inactive" }, { status: 404 });
    }

    const { data: roomType } = await admin
      .from("room_types")
      .select("id, base_rate, max_occupancy")
      .eq("id", p.roomTypeId)
      .eq("hotel_id", auth.hotelId)
      .eq("status", "active")
      .single();
    if (!roomType) {
      return NextResponse.json({ error: "Room type not found" }, { status: 404 });
    }
    if (p.adults + p.children > roomType.max_occupancy) {
      return NextResponse.json({ error: "Too many guests for this room type" }, { status: 422 });
    }

    let nightly = Number(roomType.base_rate);
    if (p.ratePlanId) {
      const { data: plan } = await admin
        .from("rate_plans")
        .select("id, nightly_amount, room_type_id")
        .eq("id", p.ratePlanId)
        .eq("hotel_id", auth.hotelId)
        .eq("status", "active")
        .single();
      if (!plan || plan.room_type_id !== p.roomTypeId) {
        return NextResponse.json({ error: "Rate plan not found or does not match the room type" }, { status: 404 });
      }
      nightly = Number(plan.nightly_amount);
    }

    // Authoritative availability re-check at write time, same pattern as
    // M6's internal action and M7's booking_create RPC.
    const [{ count: roomCount }, { count: occupied }] = await Promise.all([
      admin
        .from("rooms")
        .select("id", { count: "exact", head: true })
        .eq("hotel_id", auth.hotelId)
        .eq("room_type_id", p.roomTypeId)
        .eq("status", "active")
        .neq("housekeeping_status", "out_of_service"),
      admin
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("hotel_id", auth.hotelId)
        .eq("room_type_id", p.roomTypeId)
        .in("status", OCCUPYING_STATUSES)
        .lt("check_in_date", p.checkOutDate)
        .gt("check_out_date", p.checkInDate),
    ]);
    if ((roomCount ?? 0) - (occupied ?? 0) <= 0) {
      return NextResponse.json({ error: "No availability for the selected dates" }, { status: 409 });
    }

    const { data: guest, error: guestError } = await admin
      .from("guests")
      .insert({
        organization_id: hotel.organization_id,
        hotel_id: auth.hotelId,
        first_name: p.guestFirstName,
        last_name: p.guestLastName,
        email: p.guestEmail ?? null,
        phone: p.guestPhone ?? null,
      })
      .select("id")
      .single();
    if (guestError || !guest) {
      return NextResponse.json({ error: "Failed to create guest record" }, { status: 500 });
    }

    // M11: per-night total, honoring rate_plan_seasons overrides — same
    // shared function M6's internal action and M7's booking_create use.
    const { data: nightlyTotal, error: pricingError } = await admin.rpc("reservation_nightly_total", {
      p_rate_plan_id: p.ratePlanId ?? null,
      p_fallback_nightly: nightly,
      p_check_in: p.checkInDate,
      p_check_out: p.checkOutDate,
    });
    if (pricingError) {
      return NextResponse.json({ error: "Failed to compute pricing" }, { status: 500 });
    }
    const totalAmount = Math.round(Number(nightlyTotal) * 100) / 100;
    let reservationId: string | null = null;
    let confirmationCode = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      confirmationCode = generateConfirmationCode();
      const { data: reservation, error: resError } = await admin
        .from("reservations")
        .insert({
          organization_id: hotel.organization_id,
          hotel_id: auth.hotelId,
          confirmation_code: confirmationCode,
          guest_id: guest.id,
          room_type_id: p.roomTypeId,
          rate_plan_id: p.ratePlanId ?? null,
          check_in_date: p.checkInDate,
          check_out_date: p.checkOutDate,
          adults: p.adults,
          children: p.children,
          total_amount: totalAmount,
          currency: hotel.default_currency,
          source: p.source ?? "api",
        })
        .select("id")
        .single();
      if (!resError && reservation) {
        reservationId = reservation.id;
        break;
      }
      if (resError?.code !== "23505") {
        return NextResponse.json({ error: resError?.message ?? "Failed to create reservation" }, { status: 500 });
      }
    }
    if (!reservationId) {
      return NextResponse.json({ error: "Failed to allocate a confirmation code" }, { status: 500 });
    }

    // M11: real folio with per-night room-charge line items. Best-effort —
    // a folio hiccup must not fail an already-created, real reservation.
    const { error: folioError } = await admin.rpc("create_reservation_folio", { p_reservation_id: reservationId });
    if (folioError) {
      console.error(`Failed to create folio for reservation ${reservationId}:`, folioError.message);
    }

    await writeAuditLog(
      {
        actorType: "system",
        action: "reservation.created",
        targetType: "reservation",
        targetId: reservationId,
        organizationId: hotel.organization_id,
        hotelId: auth.hotelId,
        after: { via: "api", api_key_id: auth.apiKeyId, confirmation_code: confirmationCode },
      },
      admin,
    );

    await emitWebhookEvent({
      hotelId: auth.hotelId,
      eventType: "reservation.created",
      eventId: reservationId,
      data: {
        reservationId,
        confirmationCode,
        roomTypeId: p.roomTypeId,
        checkInDate: p.checkInDate,
        checkOutDate: p.checkOutDate,
        totalAmount,
        currency: hotel.default_currency,
      },
    });

    return NextResponse.json(
      { reservationId, confirmationCode, totalAmount, currency: hotel.default_currency, status: "pending" },
      { status: 201, headers: rateLimitHeaders(rl) },
    );
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/v1/reservations failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
