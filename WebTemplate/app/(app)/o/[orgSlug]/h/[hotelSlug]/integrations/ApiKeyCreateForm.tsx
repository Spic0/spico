"use client";

import { useActionState } from "react";
import { createApiKeyAction, type CreateApiKeyState } from "./actions";
import { API_SCOPES } from "@/lib/apiKeys";

const initialState: CreateApiKeyState = {};

export function ApiKeyCreateForm({ orgSlug, hotelSlug }: { orgSlug: string; hotelSlug: string }) {
  const [state, formAction, pending] = useActionState(createApiKeyAction, initialState);

  return (
    <div>
      {state.created && (
        <div className="spico-panel">
          <strong>API key created: {state.created.name}</strong>
          <p className="spico-muted">
            Copy this key now — it will not be shown again. Only a hash is stored; if lost, revoke it and create a
            new one.
          </p>
          <code className="spico-key-reveal">{state.created.plaintext}</code>
        </div>
      )}

      <form action={formAction} className="spico-panel spico-settings-form">
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <div className="input-wrapper">
          <label htmlFor="ak-name">Name</label>
          <input id="ak-name" name="name" type="text" placeholder="e.g. Channel manager sync" required maxLength={120} />
        </div>
        <div className="input-wrapper">
          <label>Scopes</label>
          <div className="spico-checkbox-grid">
            {API_SCOPES.map((s) => (
              <label key={s.scope} className="form-check">
                <input type="checkbox" name="scopes" value={s.scope} />
                {s.label}
              </label>
            ))}
          </div>
        </div>
        {state.error && <p className="spico-form-error">{state.error}</p>}
        <button type="submit" className="rts-btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Create API key"}
        </button>
      </form>
    </div>
  );
}
