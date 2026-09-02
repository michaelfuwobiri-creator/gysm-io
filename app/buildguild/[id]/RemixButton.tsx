"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  projectId: string;
};

// "Remix this app" on a public BuildGuild listing -- clones the published
// build into a new project owned by the signed-in viewer, then drops
// them straight into the builder on their own copy. Not signed in yet?
// Send them to sign-in and bounce right back here to try again, same
// pattern the builder itself uses for its own auth redirects.
export default function RemixButton({ projectId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function remix() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/remix`, { method: "POST" });
      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=/buildguild/${projectId}`);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to remix this app.");
        setLoading(false);
        return;
      }
      router.push(`/builder?projectId=${data.id}`);
    } catch {
      setError("Failed to remix this app. Try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={remix}
        disabled={loading}
        className="h-9 px-5 rounded-full bg-[#FF0080] text-white text-[13px] font-bold hover:bg-[#FF0080] transition disabled:opacity-50"
      >
        {loading ? "Remixing…" : "Remix this app →"}
      </button>
      {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
