"use client";

import { useCallback, useState } from "react";

export interface Toast {
  id: string;
  text: string;
  tone: "fuchsia" | "cyan" | "violet";
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((text: string, tone: Toast["tone"] = "fuchsia") => {
    const id = Math.random().toString(36).slice(2, 10);
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  return { toasts, push };
}

const TONE_STYLES: Record<Toast["tone"], { bd: string; bg: string; fg: string }> = {
  fuchsia: { bd: "rgba(255,0,128,.4)", bg: "rgba(255,0,128,.12)", fg: "#ff8fc4" },
  cyan: { bd: "rgba(6,182,212,.4)", bg: "rgba(6,182,212,.12)", fg: "#67e8f9" },
  violet: { bd: "rgba(139,92,246,.4)", bg: "rgba(139,92,246,.12)", fg: "#c4b5fd" },
};

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-[340px]">
      {toasts.map((t) => {
        const c = TONE_STYLES[t.tone];
        return (
          <div
            key={t.id}
            className="font-mono text-[12px] rounded-xl px-3.5 py-2.5 shadow-[0_12px_30px_rgba(0,0,0,.5)]"
            style={{ background: "#0f0f14", border: `1px solid ${c.bd}`, color: c.fg }}
          >
            {t.text}
          </div>
        );
      })}
    </div>
  );
}
