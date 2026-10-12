"use client";

import { useActionState } from "react";
import { createOrganizationAction, type CreateOrgState } from "./actions";

const initialState: CreateOrgState = {};

export default function NewOrganizationPage() {
  const [state, formAction, pending] = useActionState(createOrganizationAction, initialState);

  return (
    <div className="main-center-content-m-left center-content pt--40">
      <div className="rts-register-area">
        <div className="single-form-s-wrapper">
          <div className="head">
            <span>Start your journey</span>
            <h5 className="title">Create an organization</h5>
          </div>
          <div className="body">
            <form action={formAction}>
              <div className="input-wrapper">
                <label className="visually-hidden" htmlFor="name">
                  Organization name
                </label>
                <input id="name" name="name" type="text" placeholder="Organization name" required />
              </div>
              {state.error && <p className="spico-form-error">{state.error}</p>}
              <button type="submit" className="rts-btn btn-primary" disabled={pending}>
                {pending ? "Creating…" : "Create organization"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
