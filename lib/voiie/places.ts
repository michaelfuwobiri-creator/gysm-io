// Google Places API (New) -- finds real local businesses that have no
// website on file, the strongest buy signal VOIIE can hunt for: unlike a
// social-media post that merely mentions wanting a website (rare, noisy,
// and dependent on X's/Meta's search access), a business Google itself
// has no site on record for is a guaranteed, standing need. Complements
// (doesn't replace) the Twitter/Threads keyword hunt in lib/voiie/hunt.ts.
//
// Setup: console.cloud.google.com -> enable "Places API (New)" -> create
// an API key (restrict it to Places API) -> GOOGLE_PLACES_API_KEY.
// Requires a Cloud Billing account attached even to use the free monthly
// allowance (1,000 calls/mo at the "Enterprise" field tier, which is what
// including websiteUri requires) -- nothing is charged until that's
// exceeded.

export interface PlaceLead {
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
  rating: number | null;
  category: string;
}

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.primaryTypeDisplayName",
].join(",");

/**
 * Searches for businesses matching `query` (e.g. "plumbers in Austin, TX"
 * -- a category + location works best, same as typing into Google Maps)
 * and returns only the ones with no websiteUri on file. Google simply
 * omits that field when a business hasn't listed one, so "field absent"
 * is the actual signal -- there's no query syntax for "without a
 * website," the filtering happens here after the fetch.
 *
 * Returns an empty list (never throws) if GOOGLE_PLACES_API_KEY isn't
 * configured, matching lib/voiie/threads.ts's graceful-degrade pattern --
 * hunt.ts can run off Twitter/Threads alone if Places isn't set up yet.
 */
export async function searchBusinessesWithoutWebsite(query: string, maxResults = 20): Promise<PlaceLead[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !query.trim()) return [];

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: Math.min(Math.max(maxResults, 1), 20),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[voiie/places] search failed (${res.status}) -- continuing without Places results:`, body.slice(0, 300));
    return [];
  }

  const json = (await res.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text: string };
      formattedAddress?: string;
      internationalPhoneNumber?: string;
      websiteUri?: string;
      rating?: number;
      primaryTypeDisplayName?: { text: string };
    }>;
  };

  return (json.places ?? [])
    .filter((p) => !p.websiteUri) // the actual "needs a website" filter
    .map((p) => ({
      placeId: p.id,
      name: p.displayName?.text ?? "Unknown business",
      address: p.formattedAddress ?? "",
      phone: p.internationalPhoneNumber ?? null,
      rating: p.rating ?? null,
      category: p.primaryTypeDisplayName?.text ?? "local business",
    }));
}
