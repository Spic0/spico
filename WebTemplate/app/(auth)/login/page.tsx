"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, type AuthState } from "../actions";

const initialState: AuthState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <div className="main-center-content-m-left center-content">
      <div className="rts-register-area">
        <div className="single-form-s-wrapper">
          <div className="head">
            <span>Welcome back</span>
            <h5 className="title">Login to continue</h5>
          </div>
          <div className="body">
            <form action={formAction}>
              <div className="input-wrapper">
                <label className="visually-hidden" htmlFor="email">
                  Email
                </label>
                <input id="email" name="email" type="email" placeholder="Enter your mail" required />
                <label className="visually-hidden" htmlFor="password">
                  Password
                </label>
                <input id="password" name="password" type="password" placeholder="Password" required />
              </div>
              <div className="check-wrapper">
                <Link href="/reset-password">Forgot password?</Link>
              </div>
              {state.error && <p className="spico-form-error">{state.error}</p>}
              <button type="submit" className="rts-btn btn-primary" disabled={pending}>
                {pending ? "Signing in…" : "Sign In"}
              </button>
              <p>
                Don&apos;t have an account? <Link href="/register">Sign Up for Free</Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
