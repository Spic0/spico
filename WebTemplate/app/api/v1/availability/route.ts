import { NextResponse } from "next/server";
import { authenticateApiRequest, ApiAuthError } from "@/lib/apiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { OCCUPYING_STATUSES } from "@/lib/pms";

// GET /api/v1/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&guests=2
// Requires an API key with the "read:availability" scope (Authorization:
// Bearer <key>). Always scoped to the authenticated key's own hotel — a key
// cannot query any other hotel's data, there is no hotelId/hotelSlug
// parameter. Availability is computed live from rooms/reservations, same
// method as the internal M6 flow and the M7 public booking RPCs — never
// invented.
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await authenticateApiRequest(request, "read:availability");

    const rl = await checkRateLimit(`api:${auth.apiKeyId}`, 60, 60);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const url = new URL(request.url);
    const checkIn = url.searchParams.get("checkIn") ?? "";
    const checkOut = url.searchParams.get("checkOut") ?? "";
    const guests = Math.max(1, Number(url.searchParams.get("guests") ?? "1") || 1);

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(checkIn) || !dateRe.test(checkOut)) {
      return NextResponse.json({ error: "checkIn and checkOut query params are required (YYYY-MM-DD)" }, { status: 400 });
    }
    if (checkIn >= checkOut) {
      return NextResponse.json({ error: "checkOut must be after checkIn" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: roomTypes, error } = await admin
      .from("room_types")
      .select("id, name, description, max_occupancy, base_rate")
      .eq("hotel_id", auth.hotelId)
      .eq("status", "active")
      .gte("max_occupancy", guests);
    if (error) {
      return NextResponse.json({ error: "Failed to load room types" }, { status: 500 });
    }

    const offers = await Promise.all(
      (roomTypes ?? []).map(async (rt) => {
        const [{ count: roomCount }, { count: occupied }] = await Promise.all([
          admin
            .from("rooms")
            .select("id", { count: "exact", head: true })
            .eq("hotel_id", auth.hotelId)
            .eq("room_type_id", rt.id)
            .eq("status", "active")
            .neq("housekeeping_status", "out_of_service"),
          admin
            .from("reservations")
            .select("id", { count: "exact", head: true })
            .eq("hotel_id", auth.hotelId)
            .eq("room_type_id", rt.id)
            .in("status", OCCUPYING_STATUSES)
            .lt("check_in_date", checkOut)
            .gt("check_out_date", checkIn),
        ]);
        return {
          roomTypeId: rt.id,
          name: rt.name,
          description: rt.description,
          maxOccupancy: rt.max_occupancy,
          nightlyRate: rt.base_rate,
          available: (roomCount ?? 0) - (occupied ?? 0),
        };
      }),
    );

    return NextResponse.json(
      { checkIn, checkOut, guests, offers: offers.filter((o) => o.available > 0) },
      { headers: rateLimitHeaders(rl) },
    );
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/v1/availability failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
