"use client";

import type { FlowTvItem } from "@/lib/flowTv";

// One published generation -- shows exactly what generated it (prompt +
// kind), per the 42-tool spec's "every generation shows exact prompt +
// settings + remix button". Settings beyond the prompt (aspect ratio,
// resolution, etc.) aren't surfaced here yet -- input jsonb has them,
// this is a first pass at the prompt/remix part specifically.
export default function FlowTvCard({ item }: { item: FlowTvItem }) {
  const remixHref = `/builder?remixSkill=${encodeURIComponent(item.kind)}&remixPrompt=${encodeURIComponent(item.prompt || "")}`;

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.03] flex flex-col">
      <div className="aspect-video bg-black flex items-center justify-center overflow-hidden">
        {item.kind === "video" || item.kind === "avatar" || item.kind === "reframe" || item.kind === "video-upscale" ? (
          <video src={item.outputUrl} controls className="w-full h-full object-cover" />
        ) : item.kind === "tts" || item.kind === "voice-clone" || item.kind === "music" || item.kind === "sound-effect" || item.kind === "voice-enhance" ? (
          <audio src={item.outputUrl} controls className="w-full px-3" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.outputUrl} alt={item.prompt || ""} className="w-full h-full object-cover" />
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-[#FF0080] font-semibold">{item.kind}</span>
        {item.prompt && <p className="text-[12px] text-white/60 line-clamp-2">{item.prompt}</p>}
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-[11px] text-white/35">{item.publisherName || "Anonymous"}</span>
          <a href={remixHref} className="text-[11px] font-medium text-[#FF0080] hover:underline">
            Remix
          </a>
        </div>
      </div>
    </div>
  );
}
