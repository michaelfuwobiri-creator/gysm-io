import { notFound, redirect } from "next/navigation";
import AppShell from "../components/AppShell";
import { getUser } from "@/lib/auth";
import { storesEnabled } from "@/lib/stores/core";
import StoresClient from "./StoresClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stores – GYSM" };

export default async function StoresPage() {
  if (!storesEnabled()) notFound();
  const user = await getUser();
  if (!user) redirect("/sign-in?redirect_url=/stores");
  return (
    <AppShell active="stores">
      <StoresClient />
    </AppShell>
  );
}
