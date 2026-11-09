// Business-relevant pictures for VOIIE demos.
//
// The shared site generator (lib/ai/orchestrator.ts) is told to use
// picsum.photos placeholders, which serve RANDOM pictures: a bakery demo
// could show a seaside or drum kit. For VOIIE demos we replace every picsum
// URL after generation with pictures GENERATED for the business's own trade
// (OpenAI gpt-image-1 via the OPENAI_API_KEY that already runs the builder;
// no stock-photo account needed). If generation fails or no key is set, the
// slot becomes a neutral gradient block -- never an unrelated photo.
// Cost: at most MAX_IMAGES low-quality JPEGs per demo, made only after a lead
// has filled in the form.

const MAX_IMAGES = 4;

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

const SHOTS = [
  "wide, welcoming hero shot of the business premises or workspace, natural light",
  "a skilled worker doing the core work of this business, candid, no faces in close-up",
  "close-up detail of the finished product or result this business delivers",
  "tools, ingredients or materials typical of this business, neatly arranged",
];

async function generateOne(subject: string, shot: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 75000);
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: `Realistic professional photograph for a small business website: ${subject}. ${shot}. Photorealistic, natural lighting, no text, no logos, no watermarks, no captions.`,
        size: "1536x1024",
        quality: "low",
        output_format: "jpeg",
        output_compression: 70,
        n: 1,
      }),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      console.warn("[voiie/images] OpenAI image request failed", res.status);
      return null;
    }
    const data: any = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    return typeof b64 === "string" && b64.length > 1000 ? `data:image/jpeg;base64,${b64}` : null;
  } catch (e: any) {
    console.warn("[voiie/images] image generation failed:", e?.message);
    return null;
  }
}

/** Number of distinct placeholder images in the generated page (capped). */
export function placeholderCount(html: string): number {
  return Math.min(MAX_IMAGES, new Set(html.match(PICSUM) ?? []).size);
}

/** Generate up to `count` pictures of the business's trade, in parallel. Failed ones are dropped. */
export async function generateTradePhotos(subject: string, count: number): Promise<string[]> {
  const n = Math.min(MAX_IMAGES, Math.max(0, count));
  if (!n || !subject.trim()) return [];
  const results = await Promise.all(Array.from({ length: n }, (_, i) => generateOne(subject, SHOTS[i % SHOTS.length])));
  return results.filter((r): r is string => !!r);
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
