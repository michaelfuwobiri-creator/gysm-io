"use client";

import { useState } from "react";

// Guideline 1.2: any user can report a published build.
export default function ReportBuildButton({ projectId }: { projectId: string }) {
  const [msg, setMsg] = useState("");
  async function report() {
    const reason = window.prompt("What's wrong with this build? (optional)");
    if (reason === null) return;
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "build", targetId: projectId, reason }),
    });
    setMsg(res.ok ? "Reported. We'll review it within 24 hours." : res.status === 401 ? "Sign in to report content." : "Couldn't submit the report.");
  }
  return (
    <span className="text-[12px] text-white/35">
      <button onClick={report} className="underline hover:text-white/70">Report this build</button>
      {msg && <span className="ml-2">{msg}</span>}
    </span>
  );
}
