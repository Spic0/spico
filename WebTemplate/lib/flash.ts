import { cookies } from "next/headers";
import { FLASH_COOKIE } from "@/lib/flashCookie";

// One-shot flash message shown as a toast after a server action redirects or
// revalidates. Read and cleared client-side by components/layout/FlashToasts.tsx
// (hence not httpOnly). The wizard uses its returned state instead, not this.
export type FlashType = "success" | "error";
export { FLASH_COOKIE };

export async function flash(type: FlashType, message: string): Promise<void> {
  const store = await cookies();
  store.set(FLASH_COOKIE, JSON.stringify({ type, message }), {
    maxAge: 10,
    sameSite: "lax",
    path: "/",
    httpOnly: false,
  });
}
