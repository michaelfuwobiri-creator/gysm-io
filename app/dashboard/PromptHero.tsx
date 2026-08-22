"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Prompt-first entry point at the top of the dashboard -- previously the
// only way to start a new build from here was the small "+ New Build"
// button in the header, landing on an empty /builder. This puts the
// prompt box itself on the dashboard (same pattern as most AI builder
// home screens: greeting + "what do you want to build" front and
// center), reusing /builder's existing ?prompt= deep link (prefill-only,
// never auto-submits -- see app/builder/page.tsx) rather than adding a
// second generate pathway. Visual language (gradient-border pill, black
// input) matches the builder's own empty-state prompt card exactly.
export default function PromptHero({ greetingName }: { greetingName: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState("");

  function go() {
    const trimmed = value.trim();
    router.push(trimmed ? `/builder?prompt=${encodeURIComponent(trimmed)}` : "/builder");
  }

  return (
    <div className="relative mb-10 rounded-[28px] overflow-hidden border border-white/10 bg-white/[0.02] p-8 sm:p-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.16),transparent_60%)]" />
      <div className="relative max-w-2xl mx-auto text-center">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          Ready to build{greetingName ? `, ${greetingName}` : ""}?
        </h1>
        <p className="text-white/40 text-sm mt-2 mb-6">
          Describe the app you want. GYSM.IO builds it -- auth, database, and payments included.
        </p>
        <div className="relative rounded-[26px] p-[1.5px] bg-gradient-to-r from-violet-600/40 via-fuchsia-500/40 to-violet-600/40">
          <div className="bg-[#0A0A0A] border border-white/5 rounded-[24.5px] p-2 flex flex-col sm:flex-row gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
              placeholder="What do you want to build? e.g. a food delivery app with 6 dishes"
              className="min-w-0 flex-1 h-[48px] sm:h-[56px] bg-black rounded-full px-5 sm:px-6 outline-none border border-white/10 focus:border-fuchsia-500/40 transition text-[14px]"
            />
            <button
              onClick={go}
              className="h-[48px] sm:h-[56px] px-6 sm:px-8 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-[14px] hover:opacity-90 transition shrink-0"
            >
              Build →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
