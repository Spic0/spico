import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { listOrganizationsForCurrentUser } from "@/lib/data";

export default async function HomePage() {
  const user = await requireUser();
  const organizations = await listOrganizationsForCurrentUser();

  return (
    <div className="main-center-content-m-left center-content pt--40">
      <div className="container-30">
        <h4 className="title">Welcome, {user.fullName ?? user.email}</h4>

        {user.platformRole && (
          <p className="mt--20">
            <Link href="/admin" className="rts-btn btn-primary">
              Platform Administration
            </Link>
          </p>
        )}

        <h5 className="title mt--30">Your organizations</h5>
        {organizations.length === 0 ? (
          <p>You are not part of any organization yet.</p>
        ) : (
          <ul className="spico-plain-list">
            {organizations.map((org) => (
              <li key={org.id}>
                <Link href={`/o/${org.slug}`}>{org.name}</Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt--20">
          <Link href="/organizations/new" className="rts-btn btn-primary">
            Create organization
          </Link>
        </p>
      </div>
    </div>
  );
}
