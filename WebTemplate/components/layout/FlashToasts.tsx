"use client";

import { useEffect } from "react";
import toast from "react-hot-toast";
import { FLASH_COOKIE } from "@/lib/flashCookie";

// Reads the one-shot flash cookie and shows it as a toast, then clears it. The
// effect has no deps so it runs after every commit — i.e. after a navigation
// (redirect) and after a server-action revalidation alike — which is what makes
// inline-edit toasts (same URL) work, not just redirects.
function takeFlash(): { type: string; message: string } | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${FLASH_COOKIE}=([^;]*)`));
  if (!match) return null;
  document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
  try {
    return JSON.parse(decodeURIComponent(match[1]!));
  } catch {
    return null;
  }
}

export function FlashToasts() {
  useEffect(() => {
    const f = takeFlash();
    if (!f?.message) return;
    if (f.type === "error") toast.error(f.message);
    else toast.success(f.message);
  });
  return null;
}
