"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction, type AuthState } from "../actions";

const initialState: AuthState = {};

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  return (
    <div className="main-center-content-m-left center-content">
      <div className="rts-register-area">
        <div className="single-form-s-wrapper">
          <div className="head">
            <span>Forgot your password?</span>
            <h5 className="title">Reset password</h5>
          </div>
          <div className="body">
            {state.success ? (
              <p>Check your email for a link to reset your password.</p>
            ) : (
              <form action={formAction}>
                <div className="input-wrapper">
                  <label className="visually-hidden" htmlFor="email">
                    Email
                  </label>
                  <input id="email" name="email" type="email" placeholder="Enter your mail" required />
                </div>
                {state.error && <p className="spico-form-error">{state.error}</p>}
                <button type="submit" className="rts-btn btn-primary" disabled={pending}>
                  {pending ? "Sending…" : "Send reset link"}
                </button>
              </form>
            )}
            <p>
              <Link href="/login">Back to login</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
