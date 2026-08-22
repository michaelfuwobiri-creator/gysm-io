"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import GradientMesh from "../components/GradientMesh";

// Prompt-first entry point at the top of the dashboard -- previously the
// only way to start a new build from here was the small "+ New Build"
// button in the header, landing on an empty /builder. This puts the
// prompt box itself on the dashboard (same pattern as most AI builder
// home screens: greeting + "what do you want to build" front and
// center), reusing /builder's existing ?prompt= deep link (prefill-only,
// never auto-submits -- see app/builder/page.tsx) rather than adding a
// second generate pathway. Visual language (white pill, black button)
// matches the public homepage's own prompt box exactly (see app/page.tsx).
export default function PromptHero({ greetingName }: { greetingName: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState("");

  function go() {
    const trimmed = value.trim();
    router.push(trimmed ? `/builder?prompt=${encodeURIComponent(trimmed)}` : "/builder");
  }

  return (
    <div className="relative mb-10 rounded-[28px] overflow-hidden border border-black/5 bg-[#FCFCF9] p-8 sm:p-10 shadow-sm">
      <GradientMesh />
      <div className="relative max-w-2xl mx-auto text-center">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          Ready to build{greetingName ? `, ${greetingName}` : ""}?
        </h1>
        <p className="text-black/50 text-sm mt-2 mb-6">
          Describe the app you want. GYSM.IO builds it -- auth, database, and payments included.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 rounded-[20px] sm:rounded-full border border-black/10 bg-white p-2 shadow-sm">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="What do you want to build? e.g. a food delivery app with 6 dishes"
            className="min-w-0 flex-1 h-[48px] sm:h-[56px] rounded-full px-5 sm:px-6 outline-none text-[14px]"
          />
          <button
            onClick={go}
            className="h-[48px] sm:h-[56px] px-6 sm:px-8 rounded-full bg-black text-white font-bold text-[14px] hover:opacity-90 transition shrink-0"
          >
            Build →
          </button>
        </div>
      </div>
    </div>
  );
}
