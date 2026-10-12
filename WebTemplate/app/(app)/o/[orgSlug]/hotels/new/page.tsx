import { getOrganizationBySlugOrNotFound } from "@/lib/data";
import { createHotelAction } from "./actions";

export default async function NewHotelPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);

  return (
    <div className="pt--40">
      <div className="rts-register-area">
        <div className="single-form-s-wrapper">
          <div className="head">
            <span>{organization.name}</span>
            <h5 className="title">Add a hotel</h5>
          </div>
          <div className="body">
            <form action={createHotelAction}>
              <input type="hidden" name="orgSlug" value={organization.slug} />
              <div className="input-wrapper">
                <label className="visually-hidden" htmlFor="name">
                  Hotel name
                </label>
                <input id="name" name="name" type="text" placeholder="Hotel name" required />
              </div>
              <button type="submit" className="rts-btn btn-primary">
                Create hotel
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
