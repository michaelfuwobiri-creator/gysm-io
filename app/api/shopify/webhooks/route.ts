import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookHmac } from "@/lib/shopify/core";
import { eraseShop, markUninstalled, shopifyConfig } from "@/lib/shopify/store";

// Shopify webhooks: app/uninstalled plus the three mandatory privacy
// (GDPR) topics. Every request is verified against the RAW body with the app
// secret. GYSM stores no Shopify customer data (only the shop domain, its
// encrypted token and a build counter), so customers/data_request and
// customers/redact have nothing to return or delete; shop/redact removes the
// shop row.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const cfg = shopifyConfig();
  const raw = await req.text();
  if (raw.length > 1_000_000) return new NextResponse("Too large", { status: 413 });
  if (!verifyWebhookHmac(raw, req.headers.get("x-shopify-hmac-sha256"), cfg.secret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  const topic = req.headers.get("x-shopify-topic") || "";
  const shopHeader = req.headers.get("x-shopify-shop-domain") || "";
  try {
    if (topic === "app/uninstalled") await markUninstalled(shopHeader);
    else if (topic === "shop/redact") await eraseShop(shopHeader);
    // customers/data_request and customers/redact: nothing stored, so nothing to do.
  } catch (e) {
    console.error("shopify webhook failed", topic, e);
    return new NextResponse("Error", { status: 500 }); // Shopify retries
  }
  return new NextResponse("ok", { status: 200 });
}
