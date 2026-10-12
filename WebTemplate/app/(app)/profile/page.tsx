import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { signOutAction } from "@/lib/actions/sign-out";

// Account page reached from the top-bar avatar menu. Read-only account details
// (editing is not yet implemented — see docs/roadmap.md). Previously this route
// did not exist, so the "Profile" menu item 404'd — docs/ui-bug-audit.md (BUG-03).
export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <div className="main-center-content-m-left center-content pt--40">
      <div className="container-30">
        <h4 className="title">Your account</h4>

        <div className="spico-panel" style={{ maxWidth: 640 }}>
          <div className="input-wrapper">
            <span className="spico-muted">Name</span>
            <p className="title" style={{ marginBottom: 0 }}>
              {user.fullName ?? "—"}
            </p>
          </div>
          <div className="input-wrapper mt--20">
            <span className="spico-muted">Email</span>
            <p style={{ marginBottom: 0 }}>{user.email ?? "—"}</p>
          </div>
          {user.platformRole && (
            <div className="input-wrapper mt--20">
              <span className="spico-muted">Platform role</span>
              <p style={{ marginBottom: 0, textTransform: "capitalize" }}>
                {user.platformRole.replace(/_/g, " ")}
              </p>
            </div>
          )}
        </div>

        <p className="spico-muted mt--10">
          Account details are managed by your administrator. Contact them to update your name or email.
        </p>

        <div className="spico-inline-form mt--20">
          <Link href="/" className="rts-btn btn-border">
            Back to home
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="rts-btn btn-primary">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
