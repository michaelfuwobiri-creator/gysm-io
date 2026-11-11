// Instant, deterministic "idea -> build plan" engine.
//
// Used in three places so they can never drift apart:
//   1. the public /blueprint page and the /build/[slug] landing pages
//      (app/components/IdeaBlueprint.tsx, runs entirely in the browser),
//   2. the public POST /api/blueprint endpoint (and the OpenAPI spec that
//      describes it, for GPT Actions),
//   3. the MCP server's planning tools (lib/mcp/server.ts).
//
// It makes NO AI call and costs nothing to run: it matches the idea against
// a small set of known use cases and returns a structured plan plus a
// refined build prompt and a deep link into the real builder. The page says
// so ("instant plan, not a generated app"). Keep every statement here true
// of the product as it stands (see GYSM_FACTS in lib/comparisons.ts: a build
// is ONE self-contained HTML page, there is no managed database or auth, and
// GitHub sync covers index.html only). Do not add claims about user counts,
// results or speed that the code cannot back up.

import { GYSM_FACTS } from "@/lib/comparisons";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";

export type DataTable = { table: string; fields: string[] };
export type Faq = { q: string; a: string };

export type UseCase = {
  slug: string;
  name: string;
  /** Has a page at /build/<slug> served by app/build/[slug]/page.tsx. */
  landing: boolean;
  /** Public path of the page for this use case, when there is one. */
  path?: string;
  keywords: string[];
  audience: string;
  headline: string;
  summary: string;
  sections: string[];
  features: string[];
  data: DataTable[];
  integrations: string[];
  examplePrompt: string;
  faq: Faq[];
};

export const GENERIC: UseCase = {
  slug: "custom-app",
  name: "Custom web app",
  landing: false,
  keywords: [],
  audience: "Anyone with an idea for a small web product",
  headline: "Your idea as a working web app",
  summary: "A single responsive page that does the one job you describe, with a live preview you can share.",
  sections: ["Hero with a clear promise", "The main interactive feature", "How it works", "FAQ", "Footer with contact details"],
  features: ["Responsive layout for phone and desktop", "Interactive main feature", "Clear call to action", "Shareable public link"],
  data: [{ table: "items", fields: ["id", "title", "details", "created_at"] }],
  integrations: ["Supabase (your own project) for real data and sign-in", "Stripe Payment Links for simple payments"],
  examplePrompt: "A simple tool that helps my customers do one specific job, with a clean landing section and a clear call to action",
  faq: [],
};

export const USE_CASES: UseCase[] = [
  {
    slug: "online-store",
    name: "Online store",
    landing: true,
    path: "/build/online-store",
    keywords: ["store", "shop", "ecommerce", "e-commerce", "sell", "products", "merch", "shopify", "catalog", "cart", "boutique", "storefront"],
    audience: "Small brands, makers and sellers who want a storefront page without a monthly platform fee",
    headline: "A storefront page for your products, built from a description",
    summary:
      "Describe what you sell and GYSM builds a responsive storefront page: product grid, product details, a cart and a checkout button that points at your own payment link.",
    sections: ["Hero with your best product", "Product grid with filters", "Product detail view", "Cart drawer", "Shipping and returns", "About the brand", "FAQ", "Footer with policies"],
    features: ["Product cards with price and image", "Add to cart and quantity controls", "Order summary", "Checkout button linked to your own payment link", "Mobile-first layout"],
    data: [
      { table: "products", fields: ["id", "name", "price", "image_url", "description", "in_stock"] },
      { table: "orders", fields: ["id", "customer_email", "items", "total", "status", "created_at"] },
    ],
    integrations: [
      "Stripe Payment Links (created in your own Stripe account)",
      "thirdweb checkout for card or crypto payments (configured in your own thirdweb account)",
      "Supabase (your own project) if you want real order records",
    ],
    examplePrompt: "An online store selling handmade candles with a product grid, a cart, a shipping and returns section and a checkout button",
    faq: [
      { q: "Is this a full Shopify replacement?", a: "No. GYSM generates a single storefront page. It does not manage inventory, taxes, shipping rates or order fulfilment for you. It suits small catalogues and launches where you take payment through your own payment link." },
      { q: "How do customers pay?", a: "You create a payment link in your own Stripe or thirdweb account and the checkout button points at it. GYSM never holds your payment keys or your money." },
      { q: "Can I keep real orders in a database?", a: "Yes, if you connect your own Supabase project. Without one, the page keeps its data in the page and nothing is stored on a server." },
    ],
  },
  {
    slug: "restaurant",
    name: "Restaurant or cafe",
    landing: true,
    path: "/build/restaurant",
    keywords: ["restaurant", "cafe", "coffee", "menu", "bakery", "bar", "pizzeria", "food", "takeaway", "catering"],
    audience: "Restaurants, cafes and food businesses that need a clear, fast menu page",
    headline: "A menu page your customers can read on a phone",
    summary: "Describe your place and GYSM builds a menu page with opening hours, location, photos and a way to reach you.",
    sections: ["Hero with photo and tagline", "Menu by category", "Opening hours", "Location and map link", "Reservations or contact", "Reviews you are allowed to show", "Footer"],
    features: ["Menu sections with prices", "Dietary labels", "Opening hours and holiday notes", "Tap-to-call and directions links", "Mobile-first layout"],
    data: [{ table: "menu_items", fields: ["id", "category", "name", "description", "price", "dietary_tags"] }],
    integrations: ["A reservation link from your own booking tool", "Supabase (your own project) if you want editable menu data"],
    examplePrompt: "A website for an Italian restaurant with a menu by category, opening hours, a map link and a reservation button",
    faq: [
      { q: "Can customers order online?", a: "The page can link to your own ordering or payment link. GYSM does not run an ordering system for you." },
      { q: "Can I update the menu later?", a: "Yes. Describe the change in the builder and it updates the page, or edit the exported code yourself." },
    ],
  },
  {
    slug: "coaching",
    name: "Coaching or consulting business",
    landing: true,
    path: "/build/coaching",
    keywords: ["coach", "coaching", "consultant", "consulting", "mentor", "therapist", "trainer", "tutor", "course", "freelancer", "advisor"],
    audience: "Coaches, consultants and tutors who sell their time or a programme",
    headline: "A page that turns visitors into discovery calls",
    summary: "Describe your offer and GYSM builds a credible one-page site: who you help, how you work, packages, and a button to book a call.",
    sections: ["Hero with the outcome you deliver", "Who it is for", "How we work", "Packages", "About you", "FAQ", "Book a call"],
    features: ["Package cards", "Booking button linked to your own scheduler", "FAQ that handles objections", "Contact form layout", "Mobile-first layout"],
    data: [{ table: "enquiries", fields: ["id", "name", "email", "message", "created_at"] }],
    integrations: ["Your own scheduling link", "Stripe Payment Links for paid packages", "Supabase (your own project) to store enquiries"],
    examplePrompt: "A website for a career coach with three packages, an about section, an FAQ and a button to book a discovery call",
    faq: [
      { q: "Does it include testimonials?", a: "Only the ones you provide. GYSM does not invent reviews, and you should only publish testimonials you have permission to use." },
      { q: "Can I take payment for a package?", a: "Yes, by linking each package to a payment link you create in your own payment account." },
    ],
  },
  {
    slug: "portfolio",
    name: "Portfolio site",
    landing: true,
    path: "/build/portfolio",
    keywords: ["portfolio", "photographer", "designer", "artist", "creative", "resume", "cv", "personal site", "personal website", "showcase", "freelance"],
    audience: "Designers, photographers, developers and creatives who need a fast personal site",
    headline: "A portfolio that looks designed, from one description",
    summary: "Describe your work and style and GYSM builds a portfolio with a project grid, an about section and a contact call to action.",
    sections: ["Hero with your name and speciality", "Selected work grid", "Project detail view", "About", "Services", "Contact"],
    features: ["Filterable project grid", "Project detail overlay", "Social links", "Contact button", "Mobile-first layout"],
    data: [{ table: "projects", fields: ["id", "title", "year", "category", "cover_url", "description"] }],
    integrations: ["Your own domain through the custom-domain option", "Supabase (your own project) if you want editable projects"],
    examplePrompt: "A minimal portfolio for a wedding photographer with a project grid, an about section, services and a contact button",
    faq: [
      { q: "Can I use my own domain?", a: "Yes. GYSM supports attaching a custom domain to a published build." },
      { q: "Can I edit the code?", a: "Yes. You can download the project or copy the code and host it anywhere." },
    ],
  },
  {
    slug: "event-page",
    name: "Event page",
    landing: true,
    path: "/build/event-page",
    keywords: ["event", "conference", "meetup", "workshop", "webinar", "wedding", "party", "festival", "tickets", "rsvp", "launch party"],
    audience: "Organisers of meetups, workshops, weddings and small events",
    headline: "An event page with a schedule and a way to say yes",
    summary: "Describe your event and GYSM builds a page with the date, schedule, speakers or details, location and an RSVP or ticket button.",
    sections: ["Hero with date and place", "Schedule", "Speakers or details", "Location", "RSVP or tickets", "FAQ"],
    features: ["Countdown to the date", "Schedule timeline", "RSVP form layout", "Ticket button linked to your own payment link", "Mobile-first layout"],
    data: [{ table: "rsvps", fields: ["id", "name", "email", "guests", "created_at"] }],
    integrations: ["Stripe Payment Links for tickets", "Supabase (your own project) to collect RSVPs"],
    examplePrompt: "A page for a one-day startup meetup with a schedule, three speakers, a location section and an RSVP button",
    faq: [
      { q: "Can it sell tickets?", a: "It can link a ticket button to a payment link you create. GYSM does not issue or scan tickets." },
      { q: "Does it collect RSVPs?", a: "With your own Supabase project it can store RSVPs. Without one, the form is a layout only." },
    ],
  },
  {
    slug: "nonprofit",
    name: "Nonprofit or community page",
    landing: true,
    path: "/build/nonprofit",
    keywords: ["nonprofit", "non-profit", "charity", "donate", "donation", "church", "volunteer", "foundation", "community", "ngo", "fundraiser"],
    audience: "Small charities, community groups and fundraisers",
    headline: "A clear page for your cause and a way to give",
    summary: "Describe your mission and GYSM builds a page with your story, your impact, how to help and a donate button pointing at your own donation link.",
    sections: ["Hero with the mission", "The problem and what you do", "How to help", "Donate", "Volunteer sign-up", "Updates", "Contact"],
    features: ["Donate button linked to your own donation link", "Volunteer form layout", "Updates section", "Mobile-first layout"],
    data: [{ table: "volunteers", fields: ["id", "name", "email", "interests", "created_at"] }],
    integrations: ["Your own donation link from your payment provider", "Supabase (your own project) to store volunteer sign-ups"],
    examplePrompt: "A page for a small local food bank with our mission, how to volunteer, a donate button and contact details",
    faq: [
      { q: "Does GYSM process donations?", a: "No. The donate button links to a donation page you set up with your own payment provider." },
      { q: "Does it add impact numbers?", a: "Only figures you give it. Use real, verifiable numbers about your own work." },
    ],
  },
  {
    slug: "booking-app",
    name: "Booking app",
    landing: false,
    path: "/build/booking-app",
    keywords: ["booking", "appointment", "reservation", "salon", "barber", "barbershop", "clinic", "schedule", "slots", "spa", "studio"],
    audience: "Service businesses that take appointments",
    headline: "Appointment booking for a service business",
    summary: "A booking page with services, time slots and a confirmation step.",
    sections: ["Hero", "Services and prices", "Pick a date and time", "Your details", "Confirmation", "Location and hours"],
    features: ["Service picker", "Date and time slot picker", "Confirmation screen", "Mobile-first layout"],
    data: [
      { table: "services", fields: ["id", "name", "duration_min", "price"] },
      { table: "bookings", fields: ["id", "service_id", "customer_name", "customer_email", "starts_at", "status"] },
    ],
    integrations: ["Supabase (your own project) for real bookings", "Stripe Payment Links for deposits"],
    examplePrompt: "A booking app for my barbershop with services, time slots and a payment step",
    faq: [],
  },
  {
    slug: "saas",
    name: "SaaS landing and dashboard",
    landing: false,
    path: "/build/saas",
    keywords: ["saas", "dashboard", "subscription", "startup", "mvp", "b2b", "crm", "tool", "platform", "analytics"],
    audience: "Founders validating a software product",
    headline: "A SaaS MVP front end",
    summary: "A landing page, pricing section and a dashboard layout for a software product idea.",
    sections: ["Hero", "Feature grid", "Pricing", "Dashboard preview", "FAQ", "Sign-up"],
    features: ["Pricing table", "Dashboard layout with tables and charts", "Sign-up flow layout"],
    data: [{ table: "accounts", fields: ["id", "email", "plan", "created_at"] }],
    integrations: ["Supabase (your own project) for sign-up and data", "Stripe Payment Links for plans"],
    examplePrompt: "A project management SaaS for freelancers with client dashboards, task boards and a pricing page",
    faq: [],
  },
  {
    slug: "dating-app",
    name: "Dating or social app concept",
    landing: false,
    path: "/build/dating-app",
    keywords: ["dating", "match", "social app", "friends", "swipe", "zodiac", "chat app"],
    audience: "Creators prototyping a social or dating product",
    headline: "A social app concept you can click through",
    summary: "Profiles, a matching flow and chat screens as an interactive prototype.",
    sections: ["Onboarding", "Profile", "Discovery cards", "Matches", "Chat"],
    features: ["Swipe-style discovery", "Profile editor layout", "Chat layout"],
    data: [{ table: "profiles", fields: ["id", "name", "bio", "photos", "created_at"] }],
    integrations: ["Supabase (your own project) for real accounts"],
    examplePrompt: "A dating app that matches people by zodiac sign with profiles, swipe cards and chat",
    faq: [],
  },
];

export const LANDING_USE_CASES = USE_CASES.filter((u) => u.landing);

export function getUseCase(slug: string): UseCase | undefined {
  return USE_CASES.find((u) => u.slug === slug);
}

const MAX_IDEA = 600;

/** Collapse whitespace and drop control characters. Never trust caller text. */
export function cleanText(input: unknown, max = MAX_IDEA): string {
  if (typeof input !== "string") return "";
  return input.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Score each use case by keyword hits (whole words / phrases). */
export function scoreUseCases(idea: string): { useCase: UseCase; score: number }[] {
  const text = ` ${idea.toLowerCase()} `;
  return USE_CASES.map((useCase) => {
    let score = 0;
    for (const kw of useCase.keywords) {
      // No lookbehind: older Safari (this runs in the browser too) rejects it.
      const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(kw)}(?![a-z0-9])`, "g");
      const hits = text.match(re)?.length ?? 0;
      if (hits) score += 1 + (kw.includes(" ") ? 1 : 0) + Math.min(hits - 1, 2) * 0.25;
    }
    return { useCase, score };
  }).sort((a, b) => b.score - a.score);
}

export function inferUseCase(idea: string): UseCase {
  const best = scoreUseCases(idea)[0];
  return best && best.score > 0 ? best.useCase : GENERIC;
}

export type Utm = { source?: string; medium?: string; campaign?: string };

export function buildDeepLink(prompt: string, utm: Utm = {}): string {
  const p = cleanText(prompt, 1800);
  const params = new URLSearchParams();
  params.set("prompt", p);
  params.set("utm_source", cleanSlug(utm.source) || "blueprint");
  params.set("utm_medium", cleanSlug(utm.medium) || "web");
  if (utm.campaign) params.set("utm_campaign", cleanSlug(utm.campaign));
  return `${SITE_URL}/agent?${params.toString()}`;
}

function cleanSlug(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) : "";
}

export type Blueprint = {
  useCase: { slug: string; name: string; matched: boolean };
  idea: string;
  audience: string;
  summary: string;
  sections: string[];
  features: string[];
  data: DataTable[];
  integrations: string[];
  limits: string[];
  buildPrompt: string;
  buildLink: string;
  note: string;
};

export function makeBlueprint(ideaInput: unknown, utm: Utm = {}): Blueprint {
  const idea = cleanText(ideaInput);
  const uc = idea ? inferUseCase(idea) : GENERIC;
  const matched = uc !== GENERIC;
  const base = idea || uc.examplePrompt;
  const buildPrompt = cleanText(
    `${base}. Build it as one responsive, mobile-first web page with these sections: ${uc.sections.join("; ")}. Include: ${uc.features.join("; ")}. Use realistic placeholder content that I can replace, and do not invent customer reviews, statistics or awards.`,
    1800,
  );
  return {
    useCase: { slug: uc.slug, name: uc.name, matched },
    idea: base,
    audience: uc.audience,
    summary: uc.summary,
    sections: uc.sections,
    features: uc.features,
    data: uc.data,
    integrations: uc.integrations,
    limits: GYSM_FACTS.limits,
    buildPrompt,
    buildLink: buildDeepLink(buildPrompt, { ...utm, campaign: utm.campaign || uc.slug }),
    note: "This is an instant plan matched to your idea. It is not a generated app: open the build link to generate the real page with a live preview.",
  };
}

// ---------------------------------------------------------------------------
// Online store planner (the "Shopify-style" tool exposed through MCP)
// ---------------------------------------------------------------------------

export type PaymentChoice = "stripe" | "thirdweb" | "both";

export type StoreBlueprint = {
  niche: string;
  currency: string;
  products: { name: string; price?: string }[];
  sections: string[];
  features: string[];
  checkout: { option: string; howItWorks: string; youDoYourself: string[] }[];
  compliance: string[];
  launchChecklist: string[];
  limits: string[];
  buildPrompt: string;
  buildLink: string;
  note: string;
};

const CURRENCIES = new Set(["EUR", "USD", "GBP", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "PLN", "ZAR", "NGN", "INR", "JPY"]);

export function makeStoreBlueprint(input: {
  niche?: unknown;
  products?: unknown;
  currency?: unknown;
  payments?: unknown;
}, utm: Utm = {}): StoreBlueprint {
  const niche = cleanText(input.niche, 160) || "general store";
  const currency = typeof input.currency === "string" && CURRENCIES.has(input.currency.toUpperCase()) ? input.currency.toUpperCase() : "EUR";
  const payments: PaymentChoice = input.payments === "thirdweb" || input.payments === "both" ? input.payments : "stripe";

  const products: { name: string; price?: string }[] = [];
  if (Array.isArray(input.products)) {
    for (const p of input.products.slice(0, 12)) {
      if (typeof p === "string") {
        const name = cleanText(p, 80);
        if (name) products.push({ name });
      } else if (p && typeof p === "object") {
        const name = cleanText((p as any).name, 80);
        const price = cleanText((p as any).price, 24);
        if (name) products.push(price ? { name, price } : { name });
      }
    }
  }

  const uc = getUseCase("online-store")!;
  const checkout: StoreBlueprint["checkout"] = [];
  if (payments === "stripe" || payments === "both") {
    checkout.push({
      option: "Stripe Payment Links",
      howItWorks: "Each product's button opens a hosted Stripe payment page that you create in your own Stripe account. Card and local payment methods are handled by Stripe.",
      youDoYourself: ["Create a Stripe account and complete its verification", "Create one payment link per product in your Stripe dashboard", "Paste each link into the page (GYSM never sees your Stripe keys)"],
    });
  }
  if (payments === "thirdweb" || payments === "both") {
    checkout.push({
      option: "thirdweb checkout (card or crypto)",
      howItWorks: "The checkout button opens a hosted thirdweb payment flow that you configure in your own thirdweb account, so buyers can pay by card or with crypto. See thirdweb's checkout and payment-link documentation for the current options.",
      youDoYourself: ["Create a thirdweb account and a payment or checkout setup for each product", "Decide which currencies and chains you accept and who receives the funds", "Paste the checkout links into the page (GYSM never holds keys, wallets or funds)"],
    });
  }

  const sections = uc.sections;
  const features = [...uc.features, "A clear price in " + currency + " on every product", "A visible shipping and returns section"];
  const productLine = products.length
    ? ` Products: ${products.map((p) => (p.price ? `${p.name} (${p.price})` : p.name)).join("; ")}.`
    : " Use 6 realistic placeholder products that I can replace.";
  const buildPrompt = cleanText(
    `An online store for ${niche}, priced in ${currency}.${productLine} One responsive, mobile-first page with these sections: ${sections.join("; ")}. Include: ${features.join("; ")}. Every product button is a checkout link I will paste in. Do not invent customer reviews, statistics or awards.`,
    1800,
  );

  return {
    niche,
    currency,
    products,
    sections,
    features,
    checkout,
    compliance: [
      "Show the seller's legal name, address and contact details.",
      "Publish shipping, returns and refund terms. Consumers in the EU generally have a right to withdraw from distance purchases within 14 days, with exceptions.",
      "Show prices including any VAT or sales tax that applies where you sell.",
      "If you sell to the EU or UK, add privacy and cookie notices for any analytics you run.",
      "Selling tokens, securities or regulated financial products needs separate legal advice. This plan is for physical or ordinary goods and services.",
      "This is general information, not legal or tax advice.",
    ],
    launchChecklist: [
      "Write the product list with real names, prices and photos you own",
      "Create the payment links and test one purchase end to end",
      "Write shipping, returns and contact sections",
      "Generate the page and preview it on a phone",
      "Publish it, then attach your own domain if you have one",
      "Place a real test order and check the confirmation arrives",
      "Share the link where your customers already are",
    ],
    limits: GYSM_FACTS.limits,
    buildPrompt,
    buildLink: buildDeepLink(buildPrompt, { ...utm, campaign: utm.campaign || "online-store" }),
    note: "This is an instant plan, not a generated store. Open the build link to generate the real page with a live preview.",
  };
}
