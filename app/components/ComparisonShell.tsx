import type { ReactNode } from "react";
import { PRICING_PLANS, formatPlanPrice } from "@/lib/stripe";
import { CHECKED_ON } from "@/lib/comparisons";

/** GYSM's public plan, read from the same source as /pricing. */
export function gysmPriceSummary(): string {
  const plan = PRICING_PLANS.filter((p) => !p.hidden && p.interval === "month").sort((a, b) => a.price - b.price)[0];
  return plan ? `One plan: ${formatPlanPrice(plan)}/month, cancel anytime` : "See the pricing page";
}

export default function ComparisonShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: "Inter,sans-serif" }} className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] antialiased">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FCFCF9]/80 border-b border-black/[0.05] h-[56px] md:h-[64px] flex items-center">
        <div className="max-w-[1000px] mx-auto px-5 w-full flex items-center justify-between">
          <a href="/" className="font-black tracking-tighter text-[16px]">GYSM</a>
          <a href="/agent" className="text-[13px] font-bold bg-black text-white rounded-full px-4 py-2">Try GYSM free</a>
        </div>
      </nav>
      <main className="max-w-[1000px] mx-auto px-5 md:px-8 py-12 md:py-16">{children}</main>
      <footer className="max-w-[1000px] mx-auto px-5 md:px-8 pb-12 text-[12px] text-black/50">
        Competitor details were read from each product&apos;s own pricing or plans page on {CHECKED_ON} and may have
        changed since. A feature that is not listed here may still exist. Product names belong to their owners and
        GYSM is not affiliated with them. <a href="/links" className="underline">All GYSM pages</a>
      </footer>
    </div>
  );
}
