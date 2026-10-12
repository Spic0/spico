// Client-safe constant shared by lib/flash.ts (server) and
// components/layout/FlashToasts.tsx (client) — kept separate so the client
// never imports next/headers.
export const FLASH_COOKIE = "spico_flash";
