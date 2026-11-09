// Rotating search plan for the unattended hunt. Each run takes the next few
// "trade in town, ST" queries so repeated runs sweep new ground instead of
// re-reading the same twenty results. Markets follow VOIIE_COLD_EMAIL_REGIONS
// (default US): a market is only searched when cold email is enabled for it,
// so no addresses are collected for countries VOIIE may not email. Add a
// market by adding its code there (e.g. "US,CA,AU,NZ") after reading the
// notes on that country in docs/VOIIE-SETUP.md.

const TRADES = [
  "electrician", "plumber", "HVAC contractor", "roofing contractor", "handyman", "landscaping company",
  "painting contractor", "general contractor", "concrete contractor", "fence contractor", "garage door repair",
  "tree service", "pest control", "septic service", "excavation contractor", "flooring contractor",
  "remodeling contractor", "siding contractor", "masonry contractor", "welding shop", "auto repair shop",
  "towing service", "appliance repair", "chimney sweep", "pressure washing", "carpet cleaning",
  "locksmith", "moving company", "septic tank cleaning", "well drilling",
];

import { coldEmailRegions } from "@/lib/voiie/compliance";

// Small and mid-size US cities: independent trades there are the most
// likely to still run an old, self-hosted website.
const US_TOWNS = [
  "Decatur, IL", "Kankakee, IL", "Danville, IL", "Quincy, IL", "Elgin, IL", "Joliet, IL", "Rockford, IL", "Peoria, IL", "Champaign, IL", "Springfield, IL",
  "Fort Wayne, IN", "Evansville, IN", "Muncie, IN", "Terre Haute, IN", "Kokomo, IN", "Lafayette, IN",
  "Toledo, OH", "Akron, OH", "Dayton, OH", "Youngstown, OH", "Canton, OH", "Mansfield, OH", "Lima, OH",
  "Flint, MI", "Saginaw, MI", "Kalamazoo, MI", "Battle Creek, MI", "Jackson, MI", "Muskegon, MI",
  "Green Bay, WI", "Appleton, WI", "Janesville, WI", "Eau Claire, WI", "Racine, WI", "Oshkosh, WI",
  "Cedar Rapids, IA", "Davenport, IA", "Waterloo, IA", "Sioux City, IA", "Dubuque, IA",
  "St. Cloud, MN", "Duluth, MN", "Rochester, MN", "Mankato, MN",
  "Springfield, MO", "Joplin, MO", "St. Joseph, MO", "Cape Girardeau, MO", "Columbia, MO",
  "Wichita, KS", "Topeka, KS", "Salina, KS", "Lincoln, NE", "Grand Island, NE", "Sioux Falls, SD",
  "Fargo, ND", "Billings, MT", "Boise, ID", "Idaho Falls, ID", "Spokane, WA", "Yakima, WA", "Medford, OR", "Eugene, OR",
  "Reno, NV", "Fresno, CA", "Bakersfield, CA", "Stockton, CA", "Redding, CA", "Chico, CA",
  "Tucson, AZ", "Yuma, AZ", "Las Cruces, NM", "Albuquerque, NM", "Pueblo, CO", "Grand Junction, CO", "Cheyenne, WY",
  "Amarillo, TX", "Lubbock, TX", "Abilene, TX", "Tyler, TX", "Waco, TX", "Beaumont, TX", "Laredo, TX",
  "Shreveport, LA", "Lafayette, LA", "Monroe, LA", "Little Rock, AR", "Fort Smith, AR", "Jackson, MS", "Hattiesburg, MS",
  "Montgomery, AL", "Mobile, AL", "Huntsville, AL", "Macon, GA", "Albany, GA", "Savannah, GA", "Columbus, GA",
  "Tallahassee, FL", "Pensacola, FL", "Ocala, FL", "Lakeland, FL", "Fort Myers, FL",
  "Chattanooga, TN", "Knoxville, TN", "Jackson, TN", "Johnson City, TN", "Bowling Green, KY", "Lexington, KY", "Owensboro, KY",
  "Greenville, SC", "Florence, SC", "Fayetteville, NC", "Wilmington, NC", "Greensboro, NC", "Roanoke, VA", "Lynchburg, VA",
  "Charleston, WV", "Huntington, WV", "Scranton, PA", "Erie, PA", "Altoona, PA", "Reading, PA", "Lancaster, PA",
  "Utica, NY", "Binghamton, NY", "Syracuse, NY", "Albany, NY", "Elmira, NY", "Bangor, ME", "Manchester, NH", "Worcester, MA",
];

const CA_TOWNS = [
  "London, ON", "Windsor, ON", "Sudbury, ON", "Thunder Bay, ON", "Barrie, ON", "Peterborough, ON", "Kingston, ON", "Sarnia, ON", "Brantford, ON", "Guelph, ON",
  "Moncton, NB", "Saint John, NB", "Halifax, NS", "Sydney, NS", "St. John's, NL", "Charlottetown, PE",
  "Sherbrooke, QC", "Trois-Rivieres, QC", "Saguenay, QC", "Gatineau, QC",
  "Winnipeg, MB", "Brandon, MB", "Regina, SK", "Saskatoon, SK", "Moose Jaw, SK",
  "Red Deer, AB", "Lethbridge, AB", "Medicine Hat, AB", "Grande Prairie, AB",
  "Kamloops, BC", "Kelowna, BC", "Nanaimo, BC", "Prince George, BC", "Chilliwack, BC",
];

const AU_TOWNS = [
  "Newcastle, NSW", "Wollongong, NSW", "Wagga Wagga, NSW", "Albury, NSW", "Tamworth, NSW", "Orange, NSW", "Dubbo, NSW", "Coffs Harbour, NSW",
  "Geelong, VIC", "Ballarat, VIC", "Bendigo, VIC", "Shepparton, VIC", "Warrnambool, VIC", "Mildura, VIC",
  "Townsville, QLD", "Cairns, QLD", "Toowoomba, QLD", "Rockhampton, QLD", "Bundaberg, QLD", "Mackay, QLD", "Gladstone, QLD",
  "Launceston, TAS", "Devonport, TAS", "Mandurah, WA", "Bunbury, WA", "Geraldton, WA", "Kalgoorlie, WA", "Albany, WA",
  "Mount Gambier, SA", "Whyalla, SA", "Alice Springs, NT", "Darwin, NT",
];

const NZ_TOWNS = [
  "Hamilton", "Tauranga", "Rotorua", "Napier", "Hastings", "Palmerston North", "Whanganui", "New Plymouth",
  "Nelson", "Invercargill", "Dunedin", "Timaru", "Whangarei", "Gisborne", "Blenheim", "Queenstown",
];

// Region code -> towns. Place names alone ("Hamilton") are ambiguous to the
// search, so non-US entries get the country appended in the query.
const TOWN_SETS: Record<string, { towns: string[]; suffix: string }> = {
  US: { towns: US_TOWNS, suffix: "" },
  CA: { towns: CA_TOWNS, suffix: ", Canada" },
  AU: { towns: AU_TOWNS, suffix: ", Australia" },
  NZ: { towns: NZ_TOWNS, suffix: ", New Zealand" },
};

/** Towns for every enabled market, interleaved so each run mixes countries. */
function activeTowns(): string[] {
  const regions = coldEmailRegions().filter((r) => TOWN_SETS[r]);
  const sets = (regions.length ? regions : ["US"]).map((r) => TOWN_SETS[r].towns.map((t) => `${t}${TOWN_SETS[r].suffix}`));
  const out: string[] = [];
  const longest = Math.max(...sets.map((x) => x.length));
  for (let i = 0; i < longest; i++) for (const set of sets) if (i < set.length) out.push(set[i]);
  return out;
}

export function rotationSize(): number {
  return TRADES.length * activeTowns().length;
}

/** The `count` queries starting at slot `start` (wraps). Interleaves trade
 *  and town so neighbouring slots differ in both. */
export function queriesFromSlot(start: number, count: number): string[] {
  const TOWNS = activeTowns();
  const total = TRADES.length * TOWNS.length;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const slot = (((start + i) % total) + total) % total;
    const trade = TRADES[slot % TRADES.length];
    const town = TOWNS[Math.floor(slot / TRADES.length) % TOWNS.length];
    // Offset the town index by the trade so a given town isn't hit by the
    // same trade pattern every cycle.
    const t2 = TOWNS[(Math.floor(slot / TRADES.length) + (slot % TRADES.length) * 7) % TOWNS.length];
    out.push(`${trade} in ${i % 2 === 0 ? town : t2}`);
  }
  return out;
}
