import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { ReplyInbox } from "@/app/voiie/_components/ReplyInbox";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?redirect_url=/voiie/inbox");
  return <ReplyInbox />;
}
