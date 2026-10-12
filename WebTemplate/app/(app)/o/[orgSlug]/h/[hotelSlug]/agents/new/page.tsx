import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { languageLabel } from "@/lib/languages";
import { createAgentAction } from "./actions";

export default async function NewAgentPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await requirePermission("ai_agents.create", { hotelId: hotel.id, organizationId: organization.id });

  return (
    <div className="pt--40">
      <div className="rts-register-area">
        <div className="single-form-s-wrapper">
          <div className="head">
            <span>{hotel.name}</span>
            <h5 className="title">Create an AI agent</h5>
          </div>
          <div className="body">
            <form action={createAgentAction}>
              <input type="hidden" name="orgSlug" value={organization.slug} />
              <input type="hidden" name="hotelSlug" value={hotel.slug} />
              <div className="input-wrapper">
                <label htmlFor="name">Name</label>
                <input id="name" name="name" type="text" placeholder="e.g. Front Desk Assistant" required />
              </div>
              <div className="input-wrapper">
                <label htmlFor="description">Description</label>
                <textarea id="description" name="description" rows={3} />
              </div>
              <div className="input-wrapper">
                <label htmlFor="agentType">Agent type</label>
                <select id="agentType" name="agentType" required defaultValue="">
                  <option value="" disabled>
                    Select a type
                  </option>
                  <option value="receptionist">AI Receptionist</option>
                  <option value="reservations">Reservations Agent</option>
                  <option value="concierge">Concierge Agent</option>
                  <option value="night">Night Agent</option>
                  <option value="restaurant">Restaurant Agent</option>
                  <option value="spa">Spa Agent</option>
                  <option value="general_information">General Information Agent</option>
                </select>
              </div>
              <div className="input-wrapper">
                <label htmlFor="defaultLanguage">Default language</label>
                <select id="defaultLanguage" name="defaultLanguage" required defaultValue="">
                  <option value="" disabled>
                    Select a language
                  </option>
                  {hotel.languages.map((code) => (
                    <option key={code} value={code}>
                      {languageLabel(code)}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="rts-btn btn-primary">
                Create agent
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
