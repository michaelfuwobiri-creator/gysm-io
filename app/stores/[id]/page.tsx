import { notFound, redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import { getUser } from "@/lib/auth";
import { storesEnabled } from "@/lib/stores/core";
import { PROVIDER_GUIDES, KEYED_PROVIDERS } from "@/lib/stores/integrations";
import StoreManager from "./StoreManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Store – GYSM" };

export default async function StorePage({ params }: { params: { id: string } }) {
  if (!storesEnabled()) notFound();
  const user = await getUser();
  if (!user) redirect(`/sign-in?redirect_url=/stores/${params.id}`);
  const guides = [PROVIDER_GUIDES.stripe, ...KEYED_PROVIDERS.map((p) => PROVIDER_GUIDES[p])];
  return (
    <AppShell active="stores">
      <StoreManager id={params.id} guides={guides} />
    </AppShell>
  );
}
