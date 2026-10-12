"use client";

import { useFormStatus } from "react-dom";

// Submit button for a destructive server-action form. Two safeguards:
//  1) A native confirm() gate so a misclick can't revoke/delete without an
//     explicit "OK" — see docs/ui-bug-audit.md (BUG-02).
//  2) useFormStatus pending state disables the button while the action runs so
//     it can't be double-submitted.
// Must be rendered INSIDE the <form> whose action it submits (useFormStatus
// reads the nearest form's status). Keeps the existing rts-btn/btn-danger
// Bootstrap classes — no new styling.
export function ConfirmSubmitButton({
  children,
  confirmMessage,
  className = "rts-btn btn-danger btn-sm",
  pendingLabel,
}: {
  children: React.ReactNode;
  confirmMessage: string;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
