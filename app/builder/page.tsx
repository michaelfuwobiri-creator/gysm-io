import { redirect } from "next/navigation";

// The classic builder has been retired: the GYSM Agent is the builder. Old
// links still work and land in the Agent with the same context:
//   ?projectId=<id>  -> open that saved build    (/agent?project=<id>)
//   ?template=<id>   -> start from that template (/agent?template=<id>)
//   ?prompt= / ?remixPrompt= -> prefill the message box
export const dynamic = "force-dynamic";

export default function BuilderPage({
  searchParams,
}: {
  searchParams: { projectId?: string; template?: string; prompt?: string; remixPrompt?: string };
}) {
  const sp = searchParams ?? {};
  if (typeof sp.projectId === "string" && sp.projectId) redirect(`/agent?project=${encodeURIComponent(sp.projectId)}`);
  if (typeof sp.template === "string" && sp.template) redirect(`/agent?template=${encodeURIComponent(sp.template)}`);
  const prompt = typeof sp.prompt === "string" ? sp.prompt : typeof sp.remixPrompt === "string" ? sp.remixPrompt : "";
  redirect(prompt ? `/agent?prompt=${encodeURIComponent(prompt.slice(0, 2000))}` : "/agent");
}
