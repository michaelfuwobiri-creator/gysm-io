import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { CallList } from "@/app/voiie/_components/CallList";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?redirect_url=/voiie/calls");
  return <CallList />;
}
