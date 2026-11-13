import { notFound } from "next/navigation";
import { storesEnabled } from "@/lib/stores/core";
import { getStoreBySlug } from "@/lib/stores/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thank you" };

export default async function ThanksPage({ params }: { params: { slug: string } }) {
  if (!storesEnabled()) notFound();
  const store = await getStoreBySlug(params.slug);
  if (!store) notFound();
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 text-neutral-900">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Thank you for your order</h1>
        <p className="mt-3 text-neutral-500">
          Your payment went through and {store.name} has been told about your order.
        </p>
        <a href="./" className="mt-6 inline-block rounded-full bg-neutral-900 px-5 py-2 text-white">Back to the store</a>
      </div>
    </main>
  );
}
