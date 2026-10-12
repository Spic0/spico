"use client";

import { Toaster as HotToaster } from "react-hot-toast";

// App-wide toast host (mounted once in app/layout.tsx). Styled with the Spico
// tokens so it matches light and dark; react-hot-toast provides the aria-live.
export function Toaster() {
  return (
    <HotToaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: "var(--surface-1)",
          color: "var(--text-strong)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-md)",
          fontSize: "14px",
          maxWidth: "420px",
        },
        success: { iconTheme: { primary: "var(--status-success-fg)", secondary: "var(--surface-1)" } },
        error: { iconTheme: { primary: "var(--status-danger-fg)", secondary: "var(--surface-1)" } },
      }}
    />
  );
}
