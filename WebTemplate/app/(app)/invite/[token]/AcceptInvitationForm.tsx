"use client";

import { useActionState } from "react";
import { acceptInvitationAction, type AcceptInvitationState } from "./actions";

const initialState: AcceptInvitationState = {};

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptInvitationAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      {state.error && <p className="spico-form-error">{state.error}</p>}
      <button type="submit" className="rts-btn btn-primary" disabled={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </button>
    </form>
  );
}
