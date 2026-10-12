import { redirect } from "next/navigation";

// The reservation wizard is now a popup on the Reservations list (opened via
// ?create=1). This route stays so existing links (onboarding, "+ New guest"
// return path) keep working — it just reopens the list with the popup open,
// preserving any preselected guest.
export default async function NewReservationRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
  searchParams: Promise<{ guestId?: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const { guestId } = await searchParams;
  const qs = guestId ? `?create=1&guestId=${guestId}` : "?create=1";
  redirect(`/o/${orgSlug}/h/${hotelSlug}/reservations${qs}`);
}
