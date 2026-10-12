import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="main-center-content-m-left center-content pt--40">
      <div className="container-30">
        <h4 className="title">Access denied</h4>
        <p>You don&apos;t have permission to view this page.</p>
        <p className="mt--20">
          <Link href="/" className="rts-btn btn-primary">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
