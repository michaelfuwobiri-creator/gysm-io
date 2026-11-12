import { NextRequest, NextResponse } from "next/server";
import { authenticateShop, shopifyConfig } from "@/lib/shopify/store";

// Called by the embedded page on load: verifies the session token and makes
// sure the shop has an offline token on file. Returns only the shop domain.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!shopifyConfig().ready) return NextResponse.json({ error: "Shopify app is not configured." }, { status: 503 });
  try {
    const s = await authenticateShop(req);
    if (!s) return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    return NextResponse.json({ shop: s.shop });
  } catch (e) {
    console.error("shopify session failed", e);
    return NextResponse.json({ error: "Could not connect to your store." }, { status: 502 });
  }
}
