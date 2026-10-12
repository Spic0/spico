import Link from "next/link";

export default async function BookingConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotelSlug: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { hotelSlug } = await params;
  const { code } = await searchParams;

  return (
    <div className="spico-book-container">
      <h1 className="title">Booking request received</h1>
      {code ? (
        <p>
          Your confirmation code is <strong>{code}</strong>. The hotel will review and confirm your request shortly.
        </p>
      ) : (
        <p>Your booking request was received.</p>
      )}
      <p className="spico-muted">Keep your confirmation code for reference.</p>
      <Link href={`/book/${hotelSlug}`} className="rts-btn btn-border">
        Book another stay
      </Link>
    </div>
  );
}
