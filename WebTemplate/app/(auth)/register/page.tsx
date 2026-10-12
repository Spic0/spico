"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction, type AuthState } from "../actions";

const initialState: AuthState = {};

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <div className="main-center-content-m-left center-content">
      <div className="rts-register-area">
        <div className="single-form-s-wrapper">
          <div className="head">
            <span>Start your journey</span>
            <h5 className="title">Create an account</h5>
          </div>
          <div className="body">
            <form action={formAction}>
              <div className="input-wrapper">
                <label className="visually-hidden" htmlFor="fullName">
                  Full name
                </label>
                <input id="fullName" name="fullName" type="text" placeholder="Full Name" required />
                <label className="visually-hidden" htmlFor="email">
                  Email
                </label>
                <input id="email" name="email" type="email" placeholder="Enter your mail" required />
                <label className="visually-hidden" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter your Password"
                  required
                  minLength={8}
                />
              </div>
              {state.error && <p className="spico-form-error">{state.error}</p>}
              <button type="submit" className="rts-btn btn-primary" disabled={pending}>
                {pending ? "Creating account…" : "Create Account"}
              </button>
              <p>
                Already have an account? <Link href="/login">Sign in</Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
