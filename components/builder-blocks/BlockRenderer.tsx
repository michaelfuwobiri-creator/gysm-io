"use client";

import dynamic from "next/dynamic";
import type { BuilderBlock } from "@/lib/builderBlocks/blockDefs";

// ssr:false is load-bearing, not a style choice -- see AuthBlock.tsx's
// comment (useUser() + SSR = hydration errors #418/#423/#425, already
// confirmed 3x elsewhere in this codebase).
const AuthBlock = dynamic(() => import("./AuthBlock"), { ssr: false });

// Live canvas preview for one block. This is the "real app" rendering of
// each block type inside the builder itself (Auth is really wired to
// Clerk here); lib/builderBlocks/codeGenerator.ts produces the exported
// standalone-HTML version, which necessarily differs for Auth since
// exported HTML has no Clerk context -- see that file's header comment.
export default function BlockRenderer({ block }: { block: BuilderBlock }) {
  const p = block.props as Record<string, any>;

  switch (block.type) {
    case "header":
      return (
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <div className="font-black tracking-tight">{String(p.title)}</div>
          {p.showAuth && <div className="text-[12px] px-3 py-1.5 rounded-full bg-black text-white font-semibold">Sign In</div>}
        </div>
      );
    case "hero":
      return (
        <div className="text-center py-20 px-6">
          <h1 className="text-4xl font-black tracking-tight mb-3">{String(p.headline)}</h1>
          <p className="opacity-60 mb-6">{String(p.subheadline)}</p>
          <button className="rounded-full bg-[#FF0080] text-white font-bold px-7 py-3">{String(p.ctaText)}</button>
        </div>
      );
    case "auth":
      return <AuthBlock showUserButton={!!p.showUserButton} buttonText={String(p.buttonText)} />;
    case "payment":
      return (
        <div className="max-w-[280px] mx-auto my-8 rounded-2xl border border-black/10 p-6 text-center">
          <div className="font-extrabold">{String(p.planName)}</div>
          <div className="text-3xl font-black my-2">
            ${String(p.price)}
            <span className="text-xs opacity-50 font-medium">/mo</span>
          </div>
          <button className="w-full rounded-full bg-[#FF0080] text-white font-bold py-2.5">{String(p.buttonText)}</button>
        </div>
      );
    case "chat":
      return (
        <div className="max-w-[420px] mx-auto my-6 rounded-2xl border border-black/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-black/10 font-bold">{String(p.title)}</div>
          <div className="min-h-[120px] p-4 text-[13px] opacity-40">No messages yet.</div>
          <div className="p-3 border-t border-black/10">
            <input disabled placeholder={String(p.placeholder)} className="w-full rounded-full border border-black/15 px-4 py-2 text-[13px]" />
          </div>
        </div>
      );
    case "database": {
      const fields = String(p.fields || "").split(",").map((f) => f.trim()).filter(Boolean);
      return (
        <div className="max-w-[420px] mx-auto my-6 rounded-2xl border border-black/10 p-5">
          <div className="font-bold mb-2">Table: {String(p.tableName)}</div>
          <div className="flex flex-wrap gap-1.5">
            {fields.map((f) => (
              <span key={f} className="text-[11px] bg-black/5 rounded-full px-2.5 py-1">{f}</span>
            ))}
          </div>
        </div>
      );
    }
    case "form": {
      const fields = String(p.fields || "").split(",").map((f) => f.trim()).filter(Boolean);
      return (
        <div className="max-w-[360px] mx-auto my-6">
          <h3 className="font-bold mb-3">{String(p.title)}</h3>
          {fields.map((f) => (
            <input key={f} disabled placeholder={f} className="w-full mb-2 rounded-lg border border-black/15 px-3.5 py-2 text-[13px]" />
          ))}
          <button className="w-full rounded-lg bg-[#FF0080] text-white font-bold py-2.5">{String(p.submitText)}</button>
        </div>
      );
    }
    case "list": {
      const items = String(p.items || "").split(",").map((i) => i.trim()).filter(Boolean);
      return (
        <div className="max-w-[420px] mx-auto my-6">
          <h3 className="font-bold mb-2">{String(p.title)}</h3>
          <div className="flex flex-col gap-2">
            {items.map((i) => (
              <div key={i} className="rounded-lg border border-black/10 px-4 py-2.5 text-[13px]">{i}</div>
            ))}
          </div>
        </div>
      );
    }
    case "aiImage":
      return (
        <div className="max-w-[420px] mx-auto my-6">
          <div className="aspect-video rounded-2xl bg-gradient-to-br from-[#FF0080] to-violet-600 grid place-items-center text-white text-[11px] text-center p-4">
            AI image: &ldquo;{String(p.prompt)}&rdquo;
          </div>
        </div>
      );
    default:
      return null;
  }
}
