import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getUser } from "@/lib/auth";
import { storeCanSell, storesEnabled } from "@/lib/stores/core";
import { getStoreBySlug, listProducts } from "@/lib/stores/db";
import { storeDb } from "@/lib/stores/connections";
import Storefront from "./Storefront";

export const dynamic = "force-dynamic";

async function loadStore(slug: string) {
  if (!storesEnabled()) return null;
  const store = await getStoreBySlug(slug);
  if (!store) return null;
  if (store.status === "draft") {
    // A draft is visible only to its owner, as a preview.
    // On a <slug>.gysm.store host Clerk's middleware doesn't run, so there is no session to read.
    const user = await getUser().catch(() => null);
    if (!user || user.id !== store.user_id) return null;
  }
  return store;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const store = await loadStore(params.slug);
  if (!store) return { title: "Store not found" };
  return { title: store.name, description: store.description || `Shop at ${store.name}` };
}

export default async function ShopPage({ params }: { params: { slug: string } }) {
  const store = await loadStore(params.slug);
  if (!store) notFound();
  const products = await listProducts(await storeDb(store), store.id, { activeOnly: true });
  return (
    <Storefront
      store={{ slug: store.slug, name: store.name, description: store.description, currency: store.currency, status: store.status }}
      canSell={storeCanSell(store)}
      products={products.map((p) => ({ id: p.id, name: p.name, description: p.description, price_cents: p.price_cents, image_url: p.image_url, stock: p.stock }))}
    />
  );
}
