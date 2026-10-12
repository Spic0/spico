import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

// Auth pages: reachable when logged out; a logged-in user is bounced to home.
const AUTH_PATHS = ["/login", "/register", "/reset-password"];
// Truly public prefixes (guest-facing booking engine): reachable by anyone,
// logged in or not, and never redirected.
const PUBLIC_PREFIXES = ["/book"];
// Routes that authenticate themselves (Open API keys, M9) rather than via a
// Supabase Auth session/cookie — skip the session refresh and redirect logic
// entirely, not just the redirect, since there is no session to refresh.
const NO_SESSION_PREFIXES = ["/api"];

export async function updateSession(request: NextRequest) {
  const { pathname: earlyPathname } = request.nextUrl;
  if (NO_SESSION_PREFIXES.some((path) => earlyPathname.startsWith(path))) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // IMPORTANT: avoid inserting logic between createServerClient and this
  // getUser() call — the Supabase docs warn this can cause intermittent
  // session-refresh failures.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthPath = AUTH_PATHS.some((path) => pathname.startsWith(path));
  const isPublicPrefix = PUBLIC_PREFIXES.some((path) => pathname.startsWith(path));

  // Guest-facing pages are always allowed; never redirect either way.
  if (isPublicPrefix) {
    return response;
  }

  if (!user && !isAuthPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isAuthPath) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}
