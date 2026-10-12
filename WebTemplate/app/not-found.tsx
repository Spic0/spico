import Link from "next/link";

// Global 404. Rendered with only the root layout (no dashboard shell), so it is
// deliberately self-contained. Previously the app fell back to Next's unstyled
// default 404 — see docs/ui-bug-audit.md (BUG-07).
export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "40px 16px",
        gap: 12,
      }}
    >
      <Link href="/" className="spico-wordmark" style={{ marginBottom: 12 }}>
        SPICO
      </Link>
      <h1 className="title" style={{ fontSize: 48, margin: 0 }}>
        404
      </h1>
      <h4 className="title" style={{ margin: 0 }}>
        Page not found
      </h4>
      <p className="spico-muted" style={{ maxWidth: 420 }}>
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Link href="/" className="rts-btn btn-primary mt--10">
        Back to home
      </Link>
    </div>
  );
}
