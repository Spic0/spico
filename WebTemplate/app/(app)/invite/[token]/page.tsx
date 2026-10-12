import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AcceptInvitationForm } from "./AcceptInvitationForm";

// Deliberately outside /o/[orgSlug]/... — the accepting user is not yet a
// member of that org, so getOrganizationBySlugOrNotFound's RLS-backed lookup
// would 404 for them. get_invitation_preview() is a read-only SECURITY
// DEFINER RPC that reveals just enough (org/hotel name, role, status) to
// render this page without loosening organizations'/invitations' RLS.
export default async function AcceptInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_invitation_preview", { p_token: token });
  const invitation = data?.[0];

  if (error || !invitation) {
    return (
      <div className="main-center-content-m-left center-content pt--40">
        <div className="rts-register-area">
          <div className="single-form-s-wrapper">
            <div className="body">
              <p className="spico-form-error">This invitation link is invalid.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const expired = new Date(invitation.expires_at) <= new Date();
  const canAccept = invitation.status === "pending" && !expired;

  return (
    <div className="main-center-content-m-left center-content pt--40">
      <div className="rts-register-area">
        <div className="single-form-s-wrapper">
          <div className="head">
            <span>You&apos;re invited</span>
            <h5 className="title">
              Join {invitation.organization_name}
              {invitation.hotel_name ? ` — ${invitation.hotel_name}` : ""}
            </h5>
          </div>
          <div className="body">
            <p className="spico-muted">
              Role: <strong>{invitation.role_label}</strong>
            </p>
            {invitation.status !== "pending" ? (
              <p className="spico-form-error">This invitation is no longer pending (status: {invitation.status}).</p>
            ) : expired ? (
              <p className="spico-form-error">This invitation has expired. Ask an admin to send a new one.</p>
            ) : null}
            {canAccept && <AcceptInvitationForm token={token} />}
          </div>
        </div>
      </div>
    </div>
  );
}
