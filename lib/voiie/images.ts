// Business-relevant photos for VOIIE demos.
//
// The shared site generator (lib/ai/orchestrator.ts) is told to use
// picsum.photos placeholders, which serve RANDOM pictures: a bakery demo
// could show a seaside or drum kit. For VOIIE demos we replace every picsum
// URL after generation:
//   - with real photos searched by the business's own trade (Pexels API,
//     needs PEXELS_API_KEY; free, no attribution fee but Pexels asks for a
//     visible credit, which the demo footer adds), or
//   - when no key / no results, with a neutral gradient block -- never with
//     an unrelated photo.

const TRADE_QUERIES: Array<[RegExp, string]> = [
  [/bak(ery|er)|panetter|pasticcer|pastry|patisserie|bread|cake|cupcake/i, "bakery fresh bread pastries"],
  [/restaurant|trattoria|ristorante|pizzeri|pizza|bistro|osteria|dining/i, "restaurant dining food"],
  [/cafe|caf[eé]|coffee|espresso|bar\b/i, "coffee shop cafe"],
  [/plumb|idraulic|pipe|drain/i, "plumber repairing pipe"],
  [/electric(ian|al)?\b|elettric/i, "electrician wiring"],
  [/hvac|heating|air.?condition|furnace|climat/i, "hvac technician"],
  [/roof/i, "roofing contractor"],
  [/landscap|lawn|garden|giardin/i, "landscaping garden lawn"],
  [/clean(ing|er)|maid|pulizi/i, "house cleaning"],
  [/hair|salon|barber|parrucch|barbier/i, "hair salon stylist"],
  [/nail|beauty|spa\b|massage|estetic/i, "beauty salon spa"],
  [/dent(al|ist)|dentist/i, "dentist dental clinic"],
  [/gym|fitness|personal trainer|yoga|pilates|palestra/i, "gym fitness training"],
  [/auto|car (repair|wash)|mechanic|garage|officina|tyre|tire/i, "auto mechanic garage"],
  [/paint(er|ing)|imbianch/i, "house painter painting"],
  [/construct|builder|carpent|contractor|remodel|renovat|edil|falegnam/i, "construction carpenter renovation"],
  [/florist|flower|fiorai/i, "florist flowers bouquet"],
  [/photograph|fotograf/i, "photographer camera"],
  [/law(yer)?|attorney|legal|avvocat/i, "lawyer law office"],
  [/account(ant|ing)|bookkeep|tax|commercialist/i, "accountant office"],
  [/real estate|realtor|immobil|property/i, "real estate house keys"],
  [/vet(erinar)?|pet|dog|groom/i, "veterinarian pet dog"],
  [/hotel|b&b|bed and breakfast|guest ?house|hostel|agriturismo/i, "boutique hotel room"],
  [/moving|removal|trasloch/i, "moving boxes movers"],
  [/tutor|school|lesson|teacher|scuola/i, "tutoring classroom"],
];

/** Search phrase describing what the business does, for photo search. */
export function imageQuery(name: string, desc: string): string {
  const text = `${name} ${desc}`;
  for (const [re, q] of TRADE_QUERIES) if (re.test(text)) return q;
  // Unknown trade: use the description itself, minus filler words.
  const stop = new Set(["a", "an", "the", "and", "or", "of", "in", "for", "to", "we", "our", "your", "with", "at", "on", "is", "are", "by", "from", "local", "best", "quality", "services", "service", "company", "business", "provides", "offering", "offer"]);
  const words = desc.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
  return words.slice(0, 4).join(" ");
}

export async function searchPhotos(query: string, count = 12): Promise<string[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query.trim()) return [];
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`, {
      headers: { Authorization: key },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data.photos ?? []).map((p: any) => p?.src?.large).filter((u: unknown): u is string => typeof u === "string");
  } catch {
    return [];
  }
}

const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9edf5"/><stop offset="1" stop-color="#cfd8ea"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/></svg>';
const PLACEHOLDER = `data:image/svg+xml;base64,${Buffer.from(PLACEHOLDER_SVG).toString("base64")}`;

const PICSUM = /https?:\/\/picsum\.photos\/[^\s"'()<>]+/gi;

/** Replace every random picsum placeholder with a relevant photo (cycled) or a neutral block. */
export function replacePlaceholderImages(html: string, photos: string[]): { html: string; replaced: number; usedPhotos: boolean } {
  let i = 0;
  const seen = new Map<string, string>();
  const out = html.replace(PICSUM, (m) => {
    if (seen.has(m)) return seen.get(m)!;
    const next = photos.length ? photos[i++ % photos.length] : PLACEHOLDER;
    seen.set(m, next);
    return next;
  });
  return { html: out, replaced: seen.size, usedPhotos: photos.length > 0 && seen.size > 0 };
}

/** Footer credit Pexels asks for, added only when its photos are used. */
export function addPhotoCredit(html: string): string {
  const credit = '<p style="text-align:center;font-size:11px;opacity:.6;margin:12px 0">Photos by <a href="https://www.pexels.com" target="_blank" rel="noopener">Pexels</a></p>';
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${credit}</body>`) : html + credit;
}
