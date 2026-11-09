// Rotating search plan for the unattended hunt. Each run takes the next few
// "trade in town, ST" queries so repeated runs sweep new ground instead of
// re-reading the same twenty results. US towns only by default: cold email
// is only enabled for the US (VOIIE_COLD_EMAIL_REGIONS), so leads from
// other countries could never be emailed anyway.

const TRADES = [
  "electrician", "plumber", "HVAC contractor", "roofing contractor", "handyman", "landscaping company",
  "painting contractor", "general contractor", "concrete contractor", "fence contractor", "garage door repair",
  "tree service", "pest control", "septic service", "excavation contractor", "flooring contractor",
  "remodeling contractor", "siding contractor", "masonry contractor", "welding shop", "auto repair shop",
  "towing service", "appliance repair", "chimney sweep", "pressure washing", "carpet cleaning",
  "locksmith", "moving company", "septic tank cleaning", "well drilling",
];

// Small and mid-size US cities: independent trades there are the most
// likely to still run an old, self-hosted website.
const TOWNS = [
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

export function rotationSize(): number {
  return TRADES.length * TOWNS.length;
}

/** The `count` queries starting at slot `start` (wraps). Interleaves trade
 *  and town so neighbouring slots differ in both. */
export function queriesFromSlot(start: number, count: number): string[] {
  const total = rotationSize();
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
