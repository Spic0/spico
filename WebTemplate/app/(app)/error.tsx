"use client";

import Link from "next/link";
import { useEffect } from "react";

// App-shell error boundary. Offers a retry (reset) and a route home instead of
// a dead end, and no longer surfaces the raw error string as the primary
// message (kept only as small print for support). See docs/ui-bug-audit.md (BUG-06).
export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for local debugging; production server errors are already logged.
    console.error(error);
  }, [error]);

  return (
    <div className="main-center-content-m-left center-content pt--40">
      <div className="container-30">
        <h4 className="title">Something went wrong</h4>
        <p className="spico-muted">
          This page ran into an unexpected error. You can try again, or head back and continue working.
        </p>
        <div className="spico-inline-form mt--20">
          <button type="button" className="rts-btn btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/" className="rts-btn btn-border">
            Back to home
          </Link>
        </div>
        {error.digest && (
          <p className="spico-muted mt--20" style={{ fontSize: 12 }}>
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
