"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// Footer email capture -> feeds the "Prospects" Resend Audience (see
// lib/email/newsletter.ts). Styled for the light footer section on the
// homepage (app/[locale]/page.tsx), not the dark hero above it.
export default function NewsletterSignup({ source = "footer" }: { source?: string }) {
  const t = useTranslations("Home");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("done");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return <p className="mt-4 text-[12px] font-semibold text-black/60">{t("footer.newsletterSuccess")}</p>;
  }

  return (
    <div className="mt-4 max-w-[320px]">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("footer.newsletterPlaceholder")}
          className="h-9 flex-1 min-w-0 rounded-full border border-black/10 bg-white px-4 text-[12px] text-black outline-none placeholder:text-black/30 focus:border-black/30"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="h-9 shrink-0 rounded-full bg-gradient-to-r from-[#FF0080] to-[#FF5CA8] px-4 text-[12px] font-semibold text-white disabled:opacity-60"
        >
          {status === "loading" ? "..." : t("footer.newsletterCta")}
        </button>
      </form>
      {status === "error" && (
        <p className="mt-2 text-[11px] text-red-500">{t("footer.newsletterError")}</p>
      )}
    </div>
  );
}
