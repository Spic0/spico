"use client";

import { useActionState } from "react";
import { activateHotelAction, type ActivateHotelState } from "./actions";

const initialState: ActivateHotelState = {};

export function ActivateHotelForm({
  orgSlug,
  hotelSlug,
  allPassed,
}: {
  orgSlug: string;
  hotelSlug: string;
  allPassed: boolean;
}) {
  const [state, formAction, pending] = useActionState(activateHotelAction, initialState);

  return (
    <form action={formAction} className="mt--20">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="hotelSlug" value={hotelSlug} />
      {state.error && <p className="spico-form-error">{state.error}</p>}
      {state.success && <p className="spico-form-success">Hotel activated.</p>}
      <button type="submit" className="rts-btn btn-primary" disabled={pending || !allPassed}>
        {pending ? "Activating…" : "Activate hotel"}
      </button>
      {!allPassed && <p className="spico-muted mt--10">Complete every check above before activating.</p>}
    </form>
  );
}
