"use client";

import { useActionState, useState } from "react";
import { seedTestDataAction, removeTestDataAction, type TestDataState } from "./actions";

const initialState: TestDataState = {};

function ConfirmForm({
  orgSlug,
  hotelSlug,
  action,
  label,
  pendingLabel,
  confirmLabel,
  variant = "primary",
}: {
  orgSlug: string;
  hotelSlug: string;
  action: (prevState: TestDataState, formData: FormData) => Promise<TestDataState>;
  label: string;
  pendingLabel: string;
  confirmLabel: string;
  variant?: "primary" | "danger";
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form action={formAction}>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="hotelSlug" value={hotelSlug} />
      {state.error && <p className="spico-form-error">{state.error}</p>}
      {state.success && <p className="spico-form-success">{state.success}</p>}
      <label className="form-check">
        <input
          className="form-check-input"
          type="checkbox"
          name="confirm"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span className="form-check-label">{confirmLabel}</span>
      </label>
      <button
        type="submit"
        className={`rts-btn btn-${variant} mt--10`}
        disabled={pending || !confirmed}
      >
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}

export function SeedTestDataForm({ orgSlug, hotelSlug }: { orgSlug: string; hotelSlug: string }) {
  return (
    <ConfirmForm
      orgSlug={orgSlug}
      hotelSlug={hotelSlug}
      action={seedTestDataAction}
      label="Seed test data"
      pendingLabel="Seeding…"
      confirmLabel={`I understand this will add labelled test data to ${hotelSlug}.`}
    />
  );
}

export function RemoveTestDataForm({ orgSlug, hotelSlug }: { orgSlug: string; hotelSlug: string }) {
  return (
    <ConfirmForm
      orgSlug={orgSlug}
      hotelSlug={hotelSlug}
      action={removeTestDataAction}
      label="Remove test data"
      pendingLabel="Removing…"
      confirmLabel={`I understand this will permanently delete all test data for ${hotelSlug}.`}
      variant="danger"
    />
  );
}
