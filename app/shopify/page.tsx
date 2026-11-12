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
  return <ShopifyApp apiKey={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || ""} />;
}
