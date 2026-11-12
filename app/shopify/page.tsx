import type { Metadata } from "next";
import ShopifyApp from "./ShopifyApp";

// Embedded Shopify admin app (App URL in the Shopify app config). Shopify loads
// this page in an iframe inside the merchant's admin; frame-ancestors for it is
// set in next.config.js.
export const metadata: Metadata = {
  title: "GYSM for Shopify",
  robots: { index: false, follow: false },
};

export default function ShopifyPage() {
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "";
  return (
    <>
      {/* App Bridge reads this meta tag when its script runs, so the tag and the
          script are server-rendered here, in this order, as plain tags. */}
      <meta name="shopify-api-key" content={apiKey} />
      <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      <ShopifyApp configured={Boolean(apiKey)} />
    </>
  );
}
