import { NextRequest, NextResponse } from "next/server";
import { makeStoreBlueprint } from "@/lib/blueprint";
import { adminGraphql, planToShopifyDrafts } from "@/lib/shopify/core";
import { authenticateShop, recordBuild, shopifyConfig } from "@/lib/shopify/store";

// "Build my store": turns a plain-English store description into DRAFT
// products and unpublished starter pages in the merchant's own Shopify store.
// Nothing is published and nothing is charged; the merchant reviews it all in
// Shopify admin. Deterministic (uses the same planner as /api/blueprint), so it
// makes no AI call and spends no credits.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CREATE_PRODUCT = `mutation($product: ProductCreateInput!) {
  productCreate(product: $product) {
    product { id variants(first: 1) { nodes { id } } }
    userErrors { field message }
  }
}`;
const SET_PRICE = `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    userErrors { field message }
  }
}`;
const CREATE_PAGE = `mutation($page: PageCreateInput!) {
  pageCreate(page: $page) {
    page { id }
    userErrors { field message }
  }
}`;

export async function POST(req: NextRequest) {
  if (!shopifyConfig().ready) return NextResponse.json({ error: "Shopify app is not configured." }, { status: 503 });
  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > 16_000) return NextResponse.json({ error: "Request too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body?.niche !== "string" || !body.niche.trim()) return NextResponse.json({ error: "Describe your store first." }, { status: 400 });

  let auth;
  try {
    auth = await authenticateShop(req);
  } catch (e) {
    console.error("shopify auth failed", e);
    return NextResponse.json({ error: "Could not connect to your store." }, { status: 502 });
  }
  if (!auth) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  const plan = makeStoreBlueprint({ niche: body.niche, products: body.products, currency: body.currency }, { source: "shopify", medium: "app" });
  const drafts = planToShopifyDrafts(plan);
  const created = { products: 0, pages: 0 };
  const problems: string[] = [];

  for (const p of drafts.products) {
    try {
      const r: any = await adminGraphql(auth.shop, auth.accessToken, CREATE_PRODUCT, { product: { title: p.title, descriptionHtml: p.descriptionHtml, status: "DRAFT" } });
      const errs = r.productCreate?.userErrors || [];
      if (errs.length) {
        problems.push(`${p.title}: ${errs[0].message}`);
        continue;
      }
      created.products++;
      const productId = r.productCreate?.product?.id;
      const variantId = r.productCreate?.product?.variants?.nodes?.[0]?.id;
      if (productId && variantId && p.price) {
        const pr: any = await adminGraphql(auth.shop, auth.accessToken, SET_PRICE, { productId, variants: [{ id: variantId, price: p.price }] });
        const perrs = pr.productVariantsBulkUpdate?.userErrors || [];
        if (perrs.length) problems.push(`${p.title} price: ${perrs[0].message}`);
      }
    } catch (e: any) {
      problems.push(`${p.title}: ${String(e?.message || "failed").slice(0, 120)}`);
    }
  }
  for (const pg of drafts.pages) {
    try {
      const r: any = await adminGraphql(auth.shop, auth.accessToken, CREATE_PAGE, { page: { title: pg.title, body: pg.body, isPublished: false } });
      const errs = r.pageCreate?.userErrors || [];
      if (errs.length) problems.push(`${pg.title}: ${errs[0].message}`);
      else created.pages++;
    } catch (e: any) {
      problems.push(`${pg.title}: ${String(e?.message || "failed").slice(0, 120)}`);
    }
  }
  try {
    await recordBuild(auth.shop);
  } catch {
    // Counter only; never fail the build over it.
  }
  return NextResponse.json({ created, problems, checklist: plan.launchChecklist, compliance: plan.compliance });
}
