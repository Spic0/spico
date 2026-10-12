import { redirect } from "next/navigation";

// The guest create flow is now a popup on the Guests list. Keep this route so
// existing links (onboarding hub, reservation "New guest", bookmarks) still
// work — they open the list with the dialog open. returnTo is preserved.
export default async function NewGuestRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const { returnTo } = await searchParams;
  const qs = new URLSearchParams({ create: "1" });
  if (returnTo && returnTo.startsWith("/o/")) qs.set("returnTo", returnTo);
  redirect(`/o/${orgSlug}/h/${hotelSlug}/guests?${qs.toString()}`);
}
