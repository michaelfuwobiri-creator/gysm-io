import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { OutreachQueue } from "@/app/voiie/_components/OutreachQueue";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?redirect_url=/voiie/queue");
  return <OutreachQueue />;
}
