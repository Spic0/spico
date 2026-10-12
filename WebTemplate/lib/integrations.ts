// External connector registry (Milestone 9). Same "provider is always stub"
// pattern as lib/inboxChannels.ts (M5). No live PMS/CRM/calendar/channel-
// manager connection exists — testConnection() always returns a canned note,
// never makes a network call.

export type IntegrationType = "pms" | "crm" | "calendar" | "channel_manager";
export type IntegrationStatus = "not_connected" | "configured";

export interface IntegrationTypeDef {
  type: IntegrationType;
  label: string;
  icon: string;
  description: string;
}

export const INTEGRATION_TYPES: IntegrationTypeDef[] = [
  { type: "pms", label: "PMS", icon: "fa-hotel", description: "External property management system." },
  { type: "crm", label: "CRM", icon: "fa-address-book", description: "Guest relationship / marketing platform." },
  { type: "calendar", label: "Calendar", icon: "fa-calendar", description: "Calendar sync for staff scheduling or events." },
  { type: "channel_manager", label: "Channel manager", icon: "fa-share-nodes", description: "OTA / channel manager for rates and availability." },
];

export function integrationTypeLabel(type: string): string {
  return INTEGRATION_TYPES.find((t) => t.type === type)?.label ?? type;
}

export function integrationTypeIcon(type: string): string {
  return INTEGRATION_TYPES.find((t) => t.type === type)?.icon ?? "fa-plug";
}

export interface ConnectorTestResult {
  ok: boolean;
  note: string;
}

// Stub connector adapter — every integration_type resolves to this. Swapping
// in a real vendor SDK/API call is future work per integration_type.
export async function testConnectorConnection(type: IntegrationType): Promise<ConnectorTestResult> {
  return {
    ok: false,
    note: `stub: no live ${integrationTypeLabel(type)} connector implemented yet — this always reports "not connected"`,
  };
}
