// Hand-written to mirror supabase/migrations/*.sql. Regenerate with
// `supabase gen types typescript` once a real Supabase project exists, and
// replace this file — keep it in sync with the migrations until then.

export type PlatformRole = "moderator" | "admin" | "superadmin";
export type RoleKey =
  | "receptionist"
  | "reception_manager"
  | "reception_managers_manager"
  | "hotel_general_manager"
  | "hotel_owner";
export type MembershipStatus = "active" | "invited" | "revoked";
export type OrganizationStatus = "active" | "suspended";
export type HotelStatus = "active" | "onboarding" | "suspended";
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";
export type PermissionKey =
  | "dashboard.view"
  | "team.view"
  | "team.manage"
  | "hotel.settings.manage"
  | "audit_log.view"
  | "platform.admin"
  | "departments.read"
  | "departments.manage"
  | "schedules.read"
  | "schedules.manage"
  | "holidays.read"
  | "holidays.manage"
  | "team.departments.assign"
  | "ai_agents.read"
  | "ai_agents.create"
  | "ai_agents.update"
  | "ai_agents.activate"
  | "ai_agents.archive"
  | "ai_agents.test"
  | "ai_agents.manage_languages"
  | "ai_agents.manage_capabilities"
  | "ai_agents.manage_schedules"
  | "ai_agents.manage_handoff"
  | "ai_agents.manage_policies"
  | "ai_agents.manage_prompts"
  | "ai_agents.restore_prompt_version"
  | "ai_agents.manage_knowledge"
  | "kb.read"
  | "kb.categories.manage"
  | "kb.articles.manage"
  | "kb.documents.manage"
  | "inbox.view"
  | "inbox.send"
  | "inbox.manage"
  | "channels.manage"
  | "pms.read"
  | "pms.manage"
  | "guests.read"
  | "guests.manage"
  | "reservations.read"
  | "reservations.manage"
  | "booking.manage"
  | "voice.manage"
  | "calls.read"
  | "calls.manage"
  | "integrations.read"
  | "api_keys.manage"
  | "webhooks.manage"
  | "integrations.manage"
  | "billing.read"
  | "billing.manage"
  | "folio.read"
  | "folio.manage"
  | "housekeeping.read"
  | "housekeeping.manage"
  | "hotel.activate"
  | "demo_data.manage";
export type AuditActorType = "user" | "ai" | "system";
export type HotelType = "hotel" | "resort" | "boutique" | "hostel" | "apartment" | "guesthouse" | "other";
export type DepartmentStatus = "active" | "inactive";
export type HolidayStatus = "closed" | "modified_hours" | "special_operations";
export type AgentType =
  | "receptionist"
  | "reservations"
  | "concierge"
  | "night"
  | "restaurant"
  | "spa"
  | "general_information";
export type AgentStatus = "draft" | "active" | "inactive" | "archived";
export type AgentOperatingMode = "manual_assist" | "semi_automatic" | "automatic";
export type AgentHolidayBehavior = "follow_hotel" | "operate_normally" | "custom_rule";
export type AgentOutsideHoursBehavior =
  | "transfer_reception"
  | "transfer_oncall"
  | "create_message_request"
  | "fallback_message"
  | "disable_agent";
export type AgentHandoffFallback = "create_message_request" | "fallback_message" | "keep_trying_backup";
export type AgentApprovalFallback = "escalate_to_human" | "auto_deny" | "send_fallback_message";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          platform_role: PlatformRole | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          platform_role?: PlatformRole | null;
          created_at?: string;
        };
        Update: Partial<{
          full_name: string | null;
          platform_role: PlatformRole | null;
        }>;
        Relationships: [];
      };
      roles: {
        Row: { key: RoleKey; label: string; rank: number };
        Insert: { key: RoleKey; label: string; rank: number };
        Update: Partial<{ label: string; rank: number }>;
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          status: OrganizationStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          status?: OrganizationStatus;
          created_at?: string;
        };
        Update: Partial<{ name: string; slug: string; status: OrganizationStatus }>;
        Relationships: [];
      };
      hotels: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          slug: string;
          timezone: string;
          status: HotelStatus;
          languages: string[];
          created_at: string;
          updated_at: string;
          description: string | null;
          hotel_type: HotelType | null;
          star_rating: number | null;
          logo_url: string | null;
          cover_image_url: string | null;
          address_line1: string | null;
          city: string | null;
          country_code: string | null;
          postal_code: string | null;
          default_currency: string;
          default_locale: string;
          contact_email: string | null;
          contact_phone: string | null;
          website_url: string | null;
          check_in_time: string;
          check_out_time: string;
          default_guest_language: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          slug: string;
          timezone?: string;
          status?: HotelStatus;
          languages?: string[];
          created_at?: string;
          updated_at?: string;
          description?: string | null;
          hotel_type?: HotelType | null;
          star_rating?: number | null;
          logo_url?: string | null;
          cover_image_url?: string | null;
          address_line1?: string | null;
          city?: string | null;
          country_code?: string | null;
          postal_code?: string | null;
          default_currency?: string;
          default_locale?: string;
          contact_email?: string | null;
          contact_phone?: string | null;
          website_url?: string | null;
          check_in_time?: string;
          check_out_time?: string;
          default_guest_language?: string | null;
        };
        Update: Partial<{
          name: string;
          slug: string;
          timezone: string;
          status: HotelStatus;
          languages: string[];
          description: string | null;
          hotel_type: HotelType | null;
          star_rating: number | null;
          logo_url: string | null;
          cover_image_url: string | null;
          address_line1: string | null;
          city: string | null;
          country_code: string | null;
          postal_code: string | null;
          default_currency: string;
          default_locale: string;
          contact_email: string | null;
          contact_phone: string | null;
          website_url: string | null;
          check_in_time: string;
          check_out_time: string;
          default_guest_language: string | null;
        }>;
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          profile_id: string;
          organization_id: string;
          hotel_id: string | null;
          role_key: RoleKey;
          status: MembershipStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          organization_id: string;
          hotel_id?: string | null;
          role_key: RoleKey;
          status?: MembershipStatus;
          created_at?: string;
        };
        Update: Partial<{ role_key: RoleKey; status: MembershipStatus }>;
        Relationships: [];
      };
      permissions: {
        Row: {
          key: PermissionKey;
          module: string;
          description: string;
          platform_moderator_can_read: boolean;
        };
        Insert: {
          key: PermissionKey;
          module: string;
          description: string;
          platform_moderator_can_read?: boolean;
        };
        Update: Partial<{ module: string; description: string; platform_moderator_can_read: boolean }>;
        Relationships: [];
      };
      role_permissions: {
        Row: { role_key: RoleKey; permission_key: PermissionKey };
        Insert: { role_key: RoleKey; permission_key: PermissionKey };
        Update: Partial<{ role_key: RoleKey; permission_key: PermissionKey }>;
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string | null;
          email: string;
          role_key: RoleKey;
          token: string;
          status: InvitationStatus;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id?: string | null;
          email: string;
          role_key: RoleKey;
          token?: string;
          status?: InvitationStatus;
          expires_at?: string;
          created_at?: string;
        };
        Update: Partial<{ status: InvitationStatus }>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          actor_profile_id: string | null;
          actor_type: AuditActorType;
          ai_session_id: string | null;
          organization_id: string | null;
          hotel_id: string | null;
          action: string;
          target_type: string;
          target_id: string | null;
          before: unknown;
          after: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_profile_id?: string | null;
          actor_type: AuditActorType;
          ai_session_id?: string | null;
          organization_id?: string | null;
          hotel_id?: string | null;
          action: string;
          target_type: string;
          target_id?: string | null;
          before?: unknown;
          after?: unknown;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      departments: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          code: string;
          description: string | null;
          status: DepartmentStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          code: string;
          description?: string | null;
          status?: DepartmentStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          name: string;
          code: string;
          description: string | null;
          status: DepartmentStatus;
        }>;
        Relationships: [];
      };
      membership_departments: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          membership_id: string;
          department_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          // organization_id/hotel_id are derived server-side by trigger — omit them.
          membership_id: string;
          department_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      hotel_business_hours: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          day_of_week: number;
          shift_index: number;
          is_closed: boolean;
          open_time: string | null;
          close_time: string | null;
          effective_from: string | null;
          effective_to: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          day_of_week: number;
          shift_index?: number;
          is_closed?: boolean;
          open_time?: string | null;
          close_time?: string | null;
          effective_from?: string | null;
          effective_to?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          is_closed: boolean;
          open_time: string | null;
          close_time: string | null;
          effective_from: string | null;
          effective_to: string | null;
        }>;
        Relationships: [];
      };
      hotel_holidays: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          date_start: string;
          date_end: string;
          status: HolidayStatus;
          open_time: string | null;
          close_time: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          date_start: string;
          date_end: string;
          status?: HolidayStatus;
          open_time?: string | null;
          close_time?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          name: string;
          date_start: string;
          date_end: string;
          status: HolidayStatus;
          open_time: string | null;
          close_time: string | null;
          notes: string | null;
        }>;
        Relationships: [];
      };
      ai_agents: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          slug: string;
          description: string | null;
          agent_type: AgentType;
          status: AgentStatus;
          operating_mode: AgentOperatingMode;
          default_language: string;
          personality_tone: string | null;
          greeting_message: string | null;
          fallback_message: string | null;
          handoff_message: string | null;
          current_prompt_version: number;
          knowledge_base_enabled: boolean;
          test_mode_enabled: boolean;
          use_hotel_business_hours: boolean;
          holiday_behavior: AgentHolidayBehavior;
          outside_hours_behavior: AgentOutsideHoursBehavior;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          is_test_data: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          slug: string;
          description?: string | null;
          agent_type: AgentType;
          status?: AgentStatus;
          operating_mode?: AgentOperatingMode;
          default_language: string;
          personality_tone?: string | null;
          greeting_message?: string | null;
          fallback_message?: string | null;
          handoff_message?: string | null;
          current_prompt_version?: number;
          knowledge_base_enabled?: boolean;
          test_mode_enabled?: boolean;
          use_hotel_business_hours?: boolean;
          holiday_behavior?: AgentHolidayBehavior;
          outside_hours_behavior?: AgentOutsideHoursBehavior;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          is_test_data?: boolean;
        };
        Update: Partial<{
          name: string;
          slug: string;
          description: string | null;
          agent_type: AgentType;
          status: AgentStatus;
          operating_mode: AgentOperatingMode;
          default_language: string;
          personality_tone: string | null;
          greeting_message: string | null;
          fallback_message: string | null;
          handoff_message: string | null;
          current_prompt_version: number;
          knowledge_base_enabled: boolean;
          test_mode_enabled: boolean;
          use_hotel_business_hours: boolean;
          holiday_behavior: AgentHolidayBehavior;
          outside_hours_behavior: AgentOutsideHoursBehavior;
          updated_by: string | null;
          is_test_data: boolean;
        }>;
        Relationships: [];
      };
      ai_agent_languages: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          agent_id: string;
          language_code: string;
          enabled: boolean;
          is_default: boolean;
          localized_greeting: string | null;
          localized_fallback: string | null;
          voice_preference: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          // organization_id/hotel_id are derived server-side by trigger — omit them.
          agent_id: string;
          language_code: string;
          enabled?: boolean;
          is_default?: boolean;
          localized_greeting?: string | null;
          localized_fallback?: string | null;
          voice_preference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          enabled: boolean;
          is_default: boolean;
          localized_greeting: string | null;
          localized_fallback: string | null;
          voice_preference: string | null;
        }>;
        Relationships: [];
      };
      ai_agent_capabilities: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          agent_id: string;
          capability_key: string;
          enabled: boolean;
          approval_required: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          capability_key: string;
          enabled?: boolean;
          approval_required?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          enabled: boolean;
          approval_required: boolean | null;
        }>;
        Relationships: [];
      };
      ai_agent_schedules: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          agent_id: string;
          day_of_week: number;
          shift_index: number;
          is_closed: boolean;
          open_time: string | null;
          close_time: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          day_of_week: number;
          shift_index?: number;
          is_closed?: boolean;
          open_time?: string | null;
          close_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          is_closed: boolean;
          open_time: string | null;
          close_time: string | null;
        }>;
        Relationships: [];
      };
      ai_agent_handoff_rules: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          agent_id: string;
          handoff_enabled: boolean;
          primary_department_id: string | null;
          primary_phone_placeholder: string | null;
          backup_phone_placeholder: string | null;
          condition_guest_requests_human: boolean;
          condition_low_confidence: boolean;
          condition_unsupported_language: boolean;
          condition_emergency: boolean;
          condition_outside_hours: boolean;
          condition_capability_disabled: boolean;
          condition_high_risk: boolean;
          handoff_message: string | null;
          fallback_when_unavailable: AgentHandoffFallback;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          handoff_enabled?: boolean;
          primary_department_id?: string | null;
          primary_phone_placeholder?: string | null;
          backup_phone_placeholder?: string | null;
          condition_guest_requests_human?: boolean;
          condition_low_confidence?: boolean;
          condition_unsupported_language?: boolean;
          condition_emergency?: boolean;
          condition_outside_hours?: boolean;
          condition_capability_disabled?: boolean;
          condition_high_risk?: boolean;
          handoff_message?: string | null;
          fallback_when_unavailable?: AgentHandoffFallback;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          handoff_enabled: boolean;
          primary_department_id: string | null;
          primary_phone_placeholder: string | null;
          backup_phone_placeholder: string | null;
          condition_guest_requests_human: boolean;
          condition_low_confidence: boolean;
          condition_unsupported_language: boolean;
          condition_emergency: boolean;
          condition_outside_hours: boolean;
          condition_capability_disabled: boolean;
          condition_high_risk: boolean;
          handoff_message: string | null;
          fallback_when_unavailable: AgentHandoffFallback;
        }>;
        Relationships: [];
      };
      ai_agent_approval_policies: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          agent_id: string;
          approver_roles: RoleKey[];
          approval_expiry_minutes: number;
          default_fallback: AgentApprovalFallback;
          allow_automatic_low_risk_replies: boolean;
          guest_visible_messages_require_approval: boolean;
          reservation_requests_always_require_approval: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          approver_roles?: RoleKey[];
          approval_expiry_minutes?: number;
          default_fallback?: AgentApprovalFallback;
          allow_automatic_low_risk_replies?: boolean;
          guest_visible_messages_require_approval?: boolean;
          reservation_requests_always_require_approval?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          approver_roles: RoleKey[];
          approval_expiry_minutes: number;
          default_fallback: AgentApprovalFallback;
          allow_automatic_low_risk_replies: boolean;
          guest_visible_messages_require_approval: boolean;
          reservation_requests_always_require_approval: boolean;
        }>;
        Relationships: [];
      };
      ai_agent_prompt_versions: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          agent_id: string;
          version_number: number;
          purpose: string | null;
          hotel_identity: string | null;
          tone_of_voice: string | null;
          greeting_style: string | null;
          communication_rules: string | null;
          language_behavior: string | null;
          escalation_rules: string | null;
          safety_rules: string | null;
          policy_references: string | null;
          additional_instructions: string | null;
          is_active: boolean;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          agent_id: string;
          version_number: number;
          purpose?: string | null;
          hotel_identity?: string | null;
          tone_of_voice?: string | null;
          greeting_style?: string | null;
          communication_rules?: string | null;
          language_behavior?: string | null;
          escalation_rules?: string | null;
          safety_rules?: string | null;
          policy_references?: string | null;
          additional_instructions?: string | null;
          is_active?: boolean;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<{
          is_active: boolean;
        }>;
        Relationships: [];
      };
      ai_agent_test_sessions: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          agent_id: string;
          tested_by: string | null;
          sample_message: string;
          test_language: string;
          simulated_result: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          tested_by?: string | null;
          sample_message: string;
          test_language: string;
          simulated_result: unknown;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      kb_categories: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          slug: string;
          description: string | null;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          is_test_data: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          slug: string;
          description?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          is_test_data?: boolean;
        };
        Update: Partial<{
          name: string;
          slug: string;
          description: string | null;
          status: string;
          is_test_data: boolean;
        }>;
        Relationships: [];
      };
      kb_articles: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          category_id: string | null;
          article_type: string;
          title: string;
          summary: string | null;
          body: string;
          language_code: string;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          is_test_data: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          category_id?: string | null;
          article_type?: string;
          title: string;
          summary?: string | null;
          body: string;
          language_code: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          is_test_data?: boolean;
        };
        Update: Partial<{
          category_id: string | null;
          article_type: string;
          title: string;
          summary: string | null;
          body: string;
          language_code: string;
          status: string;
          updated_by: string | null;
          is_test_data: boolean;
        }>;
        Relationships: [];
      };
      kb_documents: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          category_id: string | null;
          title: string;
          description: string | null;
          source_type: string;
          storage_path: string | null;
          file_name: string | null;
          file_mime_type: string | null;
          file_size_bytes: number | null;
          source_url: string | null;
          language_code: string;
          processing_status: string;
          processing_error: string | null;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          category_id?: string | null;
          title: string;
          description?: string | null;
          source_type: string;
          storage_path?: string | null;
          file_name?: string | null;
          file_mime_type?: string | null;
          file_size_bytes?: number | null;
          source_url?: string | null;
          language_code: string;
          processing_status?: string;
          processing_error?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<{
          category_id: string | null;
          title: string;
          description: string | null;
          storage_path: string | null;
          file_name: string | null;
          file_mime_type: string | null;
          file_size_bytes: number | null;
          source_url: string | null;
          language_code: string;
          processing_status: string;
          processing_error: string | null;
          status: string;
          updated_by: string | null;
        }>;
        Relationships: [];
      };
      ai_agent_knowledge_sources: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          agent_id: string;
          source_kind: string;
          category_id: string | null;
          document_id: string | null;
          article_id: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          // organization_id/hotel_id are derived server-side by trigger — omit them.
          agent_id: string;
          source_kind: string;
          category_id?: string | null;
          document_id?: string | null;
          article_id?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      channels: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          channel_type: string;
          name: string;
          identifier: string | null;
          provider: string;
          direction: string;
          status: string;
          config: unknown;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          is_test_data: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          channel_type: string;
          name: string;
          identifier?: string | null;
          provider?: string;
          direction?: string;
          status?: string;
          config?: unknown;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          is_test_data?: boolean;
        };
        Update: Partial<{
          channel_type: string;
          name: string;
          identifier: string | null;
          provider: string;
          direction: string;
          status: string;
          config: unknown;
          is_test_data: boolean;
        }>;
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          channel_id: string;
          subject: string | null;
          guest_display_name: string | null;
          guest_identifier: string | null;
          status: string;
          priority: string;
          assignee_membership_id: string | null;
          assigned_department_id: string | null;
          ai_agent_id: string | null;
          last_message_at: string | null;
          last_message_preview: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          is_test_data: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          channel_id: string;
          subject?: string | null;
          guest_display_name?: string | null;
          guest_identifier?: string | null;
          status?: string;
          priority?: string;
          assignee_membership_id?: string | null;
          assigned_department_id?: string | null;
          ai_agent_id?: string | null;
          last_message_at?: string | null;
          last_message_preview?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          is_test_data?: boolean;
        };
        Update: Partial<{
          subject: string | null;
          guest_display_name: string | null;
          guest_identifier: string | null;
          status: string;
          priority: string;
          assignee_membership_id: string | null;
          assigned_department_id: string | null;
          ai_agent_id: string | null;
          last_message_at: string | null;
          last_message_preview: string | null;
          is_test_data: boolean;
        }>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          conversation_id: string;
          direction: string;
          sender_type: string;
          sender_membership_id: string | null;
          sender_ai_agent_id: string | null;
          body: string;
          delivery_status: string;
          external_message_id: string | null;
          created_at: string;
          is_test_data: boolean;
        };
        Insert: {
          id?: string;
          // organization_id/hotel_id are derived server-side by trigger — omit them.
          conversation_id: string;
          direction: string;
          sender_type: string;
          sender_membership_id?: string | null;
          sender_ai_agent_id?: string | null;
          body: string;
          delivery_status?: string;
          external_message_id?: string | null;
          created_at?: string;
          is_test_data?: boolean;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      room_types: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          code: string;
          description: string | null;
          max_occupancy: number;
          base_rate: number;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          is_test_data: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          code: string;
          description?: string | null;
          max_occupancy?: number;
          base_rate?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          is_test_data?: boolean;
        };
        Update: Partial<{
          name: string;
          code: string;
          description: string | null;
          max_occupancy: number;
          base_rate: number;
          status: string;
          is_test_data: boolean;
        }>;
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          room_type_id: string;
          room_number: string;
          floor: string | null;
          housekeeping_status: string;
          status: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          is_test_data: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          room_type_id: string;
          room_number: string;
          floor?: string | null;
          housekeeping_status?: string;
          status?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          is_test_data?: boolean;
        };
        Update: Partial<{
          room_type_id: string;
          room_number: string;
          floor: string | null;
          housekeeping_status: string;
          status: string;
          notes: string | null;
          is_test_data: boolean;
        }>;
        Relationships: [];
      };
      rate_plans: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          room_type_id: string;
          name: string;
          code: string;
          nightly_amount: number;
          refundable: boolean;
          includes_breakfast: boolean;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          is_test_data: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          room_type_id: string;
          name: string;
          code: string;
          nightly_amount?: number;
          refundable?: boolean;
          includes_breakfast?: boolean;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          is_test_data?: boolean;
        };
        Update: Partial<{
          name: string;
          code: string;
          nightly_amount: number;
          refundable: boolean;
          includes_breakfast: boolean;
          status: string;
          is_test_data: boolean;
        }>;
        Relationships: [];
      };
      guests: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          country_code: string | null;
          vip: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          is_test_data: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          first_name: string;
          last_name: string;
          email?: string | null;
          phone?: string | null;
          country_code?: string | null;
          vip?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          is_test_data?: boolean;
        };
        Update: Partial<{
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          country_code: string | null;
          vip: boolean;
          notes: string | null;
          is_test_data: boolean;
        }>;
        Relationships: [];
      };
      reservations: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          confirmation_code: string;
          guest_id: string;
          room_type_id: string;
          room_id: string | null;
          rate_plan_id: string | null;
          check_in_date: string;
          check_out_date: string;
          adults: number;
          children: number;
          status: string;
          total_amount: number;
          currency: string;
          source: string;
          conversation_id: string | null;
          call_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          is_test_data: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          confirmation_code: string;
          guest_id: string;
          room_type_id: string;
          room_id?: string | null;
          rate_plan_id?: string | null;
          check_in_date: string;
          check_out_date: string;
          adults?: number;
          children?: number;
          status?: string;
          total_amount?: number;
          currency?: string;
          source?: string;
          conversation_id?: string | null;
          call_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          is_test_data?: boolean;
        };
        Update: Partial<{
          confirmation_code: string;
          guest_id: string;
          room_type_id: string;
          room_id: string | null;
          rate_plan_id: string | null;
          check_in_date: string;
          check_out_date: string;
          adults: number;
          children: number;
          status: string;
          total_amount: number;
          currency: string;
          source: string;
          conversation_id: string | null;
          call_id: string | null;
          notes: string | null;
          is_test_data: boolean;
        }>;
        Relationships: [];
      };
      booking_settings: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          enabled: boolean;
          min_nights: number;
          max_nights: number;
          terms: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          is_test_data: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          enabled?: boolean;
          min_nights?: number;
          max_nights?: number;
          terms?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          is_test_data?: boolean;
        };
        Update: Partial<{
          enabled: boolean;
          min_nights: number;
          max_nights: number;
          terms: string | null;
          is_test_data: boolean;
        }>;
        Relationships: [];
      };
      hotel_voice_settings: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          enabled: boolean;
          phone_number: string | null;
          default_agent_id: string | null;
          greeting_note: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          enabled?: boolean;
          phone_number?: string | null;
          default_agent_id?: string | null;
          greeting_note?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: Partial<{
          enabled: boolean;
          phone_number: string | null;
          default_agent_id: string | null;
          greeting_note: string | null;
        }>;
        Relationships: [];
      };
      calls: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          ai_agent_id: string | null;
          conversation_id: string | null;
          direction: string;
          from_number: string | null;
          to_number: string | null;
          provider: string;
          status: string;
          disposition: string | null;
          handoff_reason: string | null;
          notes: string | null;
          started_at: string;
          answered_at: string | null;
          ended_at: string | null;
          duration_seconds: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          is_test_data: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          ai_agent_id?: string | null;
          conversation_id?: string | null;
          direction: string;
          from_number?: string | null;
          to_number?: string | null;
          provider?: string;
          status?: string;
          disposition?: string | null;
          handoff_reason?: string | null;
          notes?: string | null;
          started_at?: string;
          answered_at?: string | null;
          ended_at?: string | null;
          duration_seconds?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          is_test_data?: boolean;
        };
        Update: Partial<{
          disposition: string | null;
          handoff_reason: string | null;
          notes: string | null;
          status: string;
          answered_at: string | null;
          ended_at: string | null;
          duration_seconds: number;
          is_test_data: boolean;
        }>;
        Relationships: [];
      };
      call_events: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          call_id: string;
          event_type: string;
          payload: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          // organization_id/hotel_id are derived server-side by trigger — omit them.
          call_id: string;
          event_type: string;
          payload?: unknown;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      call_recordings: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          call_id: string;
          storage_path: string | null;
          duration_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          call_id: string;
          storage_path?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      api_keys: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          key_prefix: string;
          key_hash: string;
          scopes: unknown;
          status: string;
          expires_at: string | null;
          last_used_at: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          key_prefix: string;
          key_hash: string;
          scopes?: unknown;
          status?: string;
          expires_at?: string | null;
          last_used_at?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<{
          status: string;
          last_used_at: string | null;
        }>;
        Relationships: [];
      };
      webhooks: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          url: string;
          secret: string;
          event_types: unknown;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          name: string;
          url: string;
          secret: string;
          event_types?: unknown;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: Partial<{
          name: string;
          url: string;
          event_types: unknown;
          status: string;
        }>;
        Relationships: [];
      };
      webhook_deliveries: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          webhook_id: string;
          event_type: string;
          idempotency_key: string;
          payload: unknown;
          status: string;
          attempt_count: number;
          last_attempt_at: string | null;
          response_status: number | null;
          response_excerpt: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          // organization_id/hotel_id are derived server-side by trigger — omit them.
          webhook_id: string;
          event_type: string;
          idempotency_key: string;
          payload: unknown;
          status?: string;
          attempt_count?: number;
          last_attempt_at?: string | null;
          response_status?: number | null;
          response_excerpt?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          status: string;
          attempt_count: number;
          last_attempt_at: string | null;
          response_status: number | null;
          response_excerpt: string | null;
        }>;
        Relationships: [];
      };
      integrations: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          integration_type: string;
          name: string;
          provider: string;
          status: string;
          config: unknown;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          integration_type: string;
          name: string;
          provider?: string;
          status?: string;
          config?: unknown;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: Partial<{
          name: string;
          status: string;
          config: unknown;
        }>;
        Relationships: [];
      };
      plans: {
        Row: {
          id: string;
          key: string;
          name: string;
          description: string | null;
          monthly_price: number;
          currency: string;
          max_hotels: number | null;
          max_users: number | null;
          features: unknown;
          status: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          description?: string | null;
          monthly_price?: number;
          currency?: string;
          max_hotels?: number | null;
          max_users?: number | null;
          features?: unknown;
          status?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          name: string;
          description: string | null;
          monthly_price: number;
          currency: string;
          max_hotels: number | null;
          max_users: number | null;
          features: unknown;
          status: string;
          sort_order: number;
        }>;
        Relationships: [];
      };
      organization_subscriptions: {
        Row: {
          id: string;
          organization_id: string;
          plan_id: string;
          status: string;
          provider: string;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          plan_id: string;
          status?: string;
          provider?: string;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<{
          plan_id: string;
          status: string;
          current_period_end: string | null;
          updated_by: string | null;
        }>;
        Relationships: [];
      };
      platform_settings: {
        Row: {
          id: string;
          platform_name: string;
          support_email: string | null;
          default_currency: string;
          maintenance_mode: boolean;
          announcement_message: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          platform_name?: string;
          support_email?: string | null;
          default_currency?: string;
          maintenance_mode?: boolean;
          announcement_message?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<{
          platform_name: string;
          support_email: string | null;
          default_currency: string;
          maintenance_mode: boolean;
          announcement_message: string | null;
          updated_by: string | null;
        }>;
        Relationships: [];
      };
      platform_moderation_flags: {
        Row: {
          id: string;
          target_type: string;
          target_id: string;
          reason: string;
          status: string;
          raised_by: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          resolution_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          target_type: string;
          target_id: string;
          reason: string;
          status?: string;
          raised_by?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          resolution_note?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          status: string;
          resolved_by: string | null;
          resolved_at: string | null;
          resolution_note: string | null;
        }>;
        Relationships: [];
      };
      rate_plan_seasons: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          rate_plan_id: string;
          name: string;
          date_start: string;
          date_end: string;
          nightly_amount: number;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          rate_plan_id: string;
          name: string;
          date_start: string;
          date_end: string;
          nightly_amount: number;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<{
          name: string;
          date_start: string;
          date_end: string;
          nightly_amount: number;
        }>;
        Relationships: [];
      };
      folios: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          reservation_id: string;
          status: string;
          currency: string;
          created_at: string;
          updated_at: string;
          closed_at: string | null;
          closed_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          reservation_id: string;
          status?: string;
          currency: string;
          created_at?: string;
          updated_at?: string;
          closed_at?: string | null;
          closed_by?: string | null;
        };
        Update: Partial<{
          status: string;
          closed_at: string | null;
          closed_by: string | null;
        }>;
        Relationships: [];
      };
      folio_line_items: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          folio_id: string;
          category: string;
          description: string;
          service_date: string | null;
          quantity: number;
          unit_amount: number;
          amount: number;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          // organization_id/hotel_id are derived server-side by trigger — omit them.
          folio_id: string;
          category: string;
          description: string;
          service_date?: string | null;
          quantity?: number;
          unit_amount: number;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      folio_payments: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          folio_id: string;
          amount: number;
          method: string;
          provider: string;
          status: string;
          reference: string | null;
          notes: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          folio_id: string;
          amount: number;
          method: string;
          provider?: string;
          status?: string;
          reference?: string | null;
          notes?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<{
          status: string;
          notes: string | null;
        }>;
        Relationships: [];
      };
      housekeeping_tasks: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          room_id: string;
          task_type: string;
          status: string;
          priority: string;
          assigned_to: string | null;
          notes: string | null;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
          verified_by: string | null;
          verified_at: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          hotel_id: string;
          room_id: string;
          task_type: string;
          status?: string;
          priority?: string;
          assigned_to?: string | null;
          notes?: string | null;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          created_by?: string | null;
        };
        Update: Partial<{
          status: string;
          priority: string;
          assigned_to: string | null;
          notes: string | null;
          started_at: string | null;
          completed_at: string | null;
          verified_by: string | null;
          verified_at: string | null;
        }>;
        Relationships: [];
      };
      channel_manager_sync_logs: {
        Row: {
          id: string;
          organization_id: string;
          hotel_id: string;
          integration_id: string;
          direction: string;
          status: string;
          summary: unknown;
          started_at: string;
          completed_at: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          // organization_id/hotel_id are derived server-side by trigger — omit them.
          integration_id: string;
          direction: string;
          status?: string;
          summary?: unknown;
          started_at?: string;
          completed_at?: string | null;
          created_by?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      has_permission: {
        Args: {
          p_user_id: string;
          p_permission: PermissionKey;
          p_hotel_id?: string | null;
          p_organization_id?: string | null;
        };
        Returns: boolean;
      };
      can_manage_membership: {
        Args: {
          p_user_id: string;
          p_target_role_key: RoleKey;
          p_hotel_id: string | null;
          p_organization_id: string;
        };
        Returns: boolean;
      };
      is_platform_user: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      booking_hotel_public: {
        Args: { p_hotel_slug: string };
        Returns: {
          hotel_id: string;
          name: string;
          currency: string;
          timezone: string;
          enabled: boolean;
          terms: string | null;
          min_nights: number;
          max_nights: number;
        }[];
      };
      booking_room_type_offers: {
        Args: { p_hotel_id: string; p_check_in: string; p_check_out: string; p_guests: number };
        Returns: {
          room_type_id: string;
          name: string;
          description: string | null;
          max_occupancy: number;
          nightly_from: number;
          available: number;
        }[];
      };
      booking_rate_plans_public: {
        Args: { p_hotel_id: string; p_room_type_id: string };
        Returns: {
          rate_plan_id: string;
          name: string;
          nightly_amount: number;
          refundable: boolean;
          includes_breakfast: boolean;
        }[];
      };
      booking_create: {
        Args: {
          p_hotel_id: string;
          p_room_type_id: string;
          p_rate_plan_id: string | null;
          p_check_in: string;
          p_check_out: string;
          p_adults: number;
          p_children: number;
          p_first_name: string;
          p_last_name: string;
          p_email: string | null;
          p_phone: string | null;
        };
        Returns: { confirmation_code: string; total_amount: number; currency: string }[];
      };
      rate_plan_nightly_rate: {
        Args: { p_rate_plan_id: string | null; p_night: string; p_fallback: number };
        Returns: number;
      };
      reservation_nightly_total: {
        Args: { p_rate_plan_id: string | null; p_fallback_nightly: number; p_check_in: string; p_check_out: string };
        Returns: number;
      };
      create_reservation_folio: {
        Args: { p_reservation_id: string };
        Returns: string;
      };
      get_invitation_preview: {
        Args: { p_token: string };
        Returns: {
          email: string;
          role_key: RoleKey;
          role_label: string;
          organization_name: string;
          hotel_name: string | null;
          status: InvitationStatus;
          expires_at: string;
        }[];
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: { organization_id: string; organization_slug: string; hotel_id: string | null; role_key: RoleKey }[];
      };
      seed_hotel_test_data: {
        Args: { p_hotel_id: string };
        Returns: undefined;
      };
      remove_hotel_test_data: {
        Args: { p_hotel_id: string };
        Returns: undefined;
      };
    };
  };
}
