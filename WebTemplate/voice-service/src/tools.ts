import { supabaseAdmin } from "./supabaseAdmin.js";
import type { AgentCallContext } from "./agentContext.js";

// AI agent tool execution. Tools are exposed to the OpenAI Realtime model per
// the agent's ENABLED capabilities (ai_agent_capabilities), and executed here
// against the live database with the service-role client, always scoped by
// hotel_id. Read-only + control tools only in this MVP — booking creation /
// reservation modification (which the capability set also allows) are
// deliberately NOT auto-executed on a call yet; the model transfers to a human
// for those. That keeps a voice caller from mutating reservations without the
// approval workflow the dashboard enforces.

export interface RealtimeToolDef {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ToolResult =
  | { kind: "data"; output: Record<string, unknown> }
  | { kind: "transfer"; reason: string; output: Record<string, unknown> }
  | { kind: "hangup"; output: Record<string, unknown> };

// Map an enabled capability_key → the tool(s) it unlocks. Only capabilities we
// can execute safely on a live call are mapped; others simply don't appear as
// tools (the model then transfers to a human when asked to do them).
export function toolsForContext(ctx: AgentCallContext): RealtimeToolDef[] {
  const caps = new Set(ctx.enabledCapabilityKeys);
  const tools: RealtimeToolDef[] = [];

  if (caps.has("availability_inquiry")) {
    tools.push({
      type: "function",
      name: "check_availability",
      description:
        "Check real room availability and nightly starting prices for a date range. Use before quoting any availability or price.",
      parameters: {
        type: "object",
        properties: {
          check_in: { type: "string", description: "Check-in date, YYYY-MM-DD" },
          check_out: { type: "string", description: "Check-out date, YYYY-MM-DD" },
          guests: { type: "integer", description: "Number of guests", minimum: 1, maximum: 20 },
        },
        required: ["check_in", "check_out"],
      },
    });
  }

  if (caps.has("reservation_lookup_request")) {
    tools.push({
      type: "function",
      name: "lookup_reservation",
      description:
        "Look up an existing reservation by confirmation code. The caller must also provide the guest's last name; details are only returned when it matches (guest-data verification).",
      parameters: {
        type: "object",
        properties: {
          confirmation_code: { type: "string", description: "Reservation confirmation code" },
          last_name: { type: "string", description: "Guest last name, for verification" },
        },
        required: ["confirmation_code", "last_name"],
      },
    });
  }

  // human_handoff is always enabled (DB constraint) — transfer is always offered.
  tools.push({
    type: "function",
    name: "transfer_to_human",
    description:
      "Transfer the call to a human at the hotel. Use when the caller asks for a person, for anything you cannot handle, or for any emergency.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", description: "Short reason for the transfer" } },
      required: ["reason"],
    },
  });

  tools.push({
    type: "function",
    name: "end_call",
    description: "Politely end the call once the caller's need is fully resolved and they have nothing else.",
    parameters: { type: "object", properties: {} },
  });

  return tools;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentCallContext,
): Promise<ToolResult> {
  switch (name) {
    case "check_availability":
      return checkAvailability(args, ctx);
    case "lookup_reservation":
      return lookupReservation(args, ctx);
    case "transfer_to_human":
      return {
        kind: "transfer",
        reason: typeof args.reason === "string" && args.reason ? args.reason : "Caller requested a human.",
        output: { transferring: true },
      };
    case "end_call":
      return { kind: "hangup", output: { ending: true } };
    default:
      return { kind: "data", output: { error: `Unknown tool: ${name}` } };
  }
}

async function checkAvailability(args: Record<string, unknown>, ctx: AgentCallContext): Promise<ToolResult> {
  const checkIn = String(args.check_in ?? "");
  const checkOut = String(args.check_out ?? "");
  const guests = Math.max(1, Math.min(20, Number(args.guests ?? 2) || 2));
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut) || checkIn >= checkOut) {
    return { kind: "data", output: { error: "Invalid dates. Need check_in < check_out as YYYY-MM-DD." } };
  }

  const { data, error } = await supabaseAdmin.rpc("booking_room_type_offers", {
    p_hotel_id: ctx.hotel.id,
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_guests: guests,
  });
  if (error) return { kind: "data", output: { error: `Availability lookup failed: ${error.message}` } };

  const offers = (data ?? [])
    .filter((o: { available: number }) => o.available > 0)
    .map((o: { name: string; nightly_from: number; available: number; max_occupancy: number }) => ({
      room_type: o.name,
      nightly_from: Number(o.nightly_from),
      rooms_left: o.available,
      sleeps: o.max_occupancy,
    }));

  return {
    kind: "data",
    output: {
      check_in: checkIn,
      check_out: checkOut,
      guests,
      available: offers.length > 0,
      offers,
    },
  };
}

async function lookupReservation(args: Record<string, unknown>, ctx: AgentCallContext): Promise<ToolResult> {
  const code = String(args.confirmation_code ?? "").trim();
  const lastName = String(args.last_name ?? "").trim();
  if (!code || !lastName) {
    return { kind: "data", output: { error: "Both confirmation_code and last_name are required." } };
  }

  const { data: reservation, error } = await supabaseAdmin
    .from("reservations")
    .select("id, guest_id, check_in_date, check_out_date, status, room_type_id, adults, children")
    .eq("hotel_id", ctx.hotel.id)
    .ilike("confirmation_code", code)
    .maybeSingle();
  if (error) return { kind: "data", output: { error: `Lookup failed: ${error.message}` } };
  if (!reservation) return { kind: "data", output: { found: false } };

  // Verify last name before disclosing any details (platform safety rule).
  const { data: guest } = await supabaseAdmin
    .from("guests")
    .select("last_name")
    .eq("id", reservation.guest_id)
    .maybeSingle();
  const verified =
    Boolean(guest?.last_name) && guest!.last_name.trim().toLowerCase() === lastName.toLowerCase();
  if (!verified) {
    return { kind: "data", output: { found: true, verified: false, note: "Last name did not match — do not disclose details." } };
  }

  const { data: roomType } = await supabaseAdmin
    .from("room_types")
    .select("name")
    .eq("id", reservation.room_type_id)
    .maybeSingle();

  return {
    kind: "data",
    output: {
      found: true,
      verified: true,
      status: reservation.status,
      check_in: reservation.check_in_date,
      check_out: reservation.check_out_date,
      room_type: roomType?.name ?? null,
      guests: reservation.adults + reservation.children,
    },
  };
}
