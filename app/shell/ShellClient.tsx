"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// GYSM Shell UI -- mobile-first. One scrolling timeline mixes chat bubbles
// and terminal cards; the composer is pinned to the bottom with two inputs:
//   "Ask AI"   -> the agent (app/api/shell/agent) does the work
//   "Terminal" -> the user types a command (app/api/shell/exec)
// Every command card has an Explain button for beginners.

type Mode = "guide" | "auto";
type InputMode = "ai" | "terminal";

type Item =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "ai"; text: string }
  | {
      id: string;
      kind: "cmd";
      command: string;
      explanation?: string;
      by: "ai" | "user";
      output?: string;
      exitCode?: number;
      running?: boolean;
      explain?: string;
      explaining?: boolean;
    }
  | { id: string; kind: "proposal"; toolUseId: string; command: string; explanation: string; risky: boolean; resolved?: "run" | "skip" }
  | { id: string; kind: "file"; path: string; cwd: string }
  | { id: string; kind: "note"; text: string; tone?: "error" | "muted" };

type Saved = { items: Item[]; messages: unknown[]; cwd: string; mode: Mode };

const PINK = "#FF0080";
const MAX_SAVED_ITEMS = 200;

const STARTERS = [
  "Show me what's in my workspace",
  "Teach me 5 basic Linux commands, one at a time",
  "Make a Python script that tells me today's date in Rome, then run it",
  "Download the Wikipedia page for Rome and count how many times 'Colosseum' appears",
];

const KEYS = ["|", "~", "/", "-", "&&", ">", "*", "."];

let idCounter = 0;
const uid = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

function shortCwd(cwd: string) {
  if (!cwd) return "~/workspace";
  return cwd.replace(/^\/home\/[^/]+/, "~").replace(/^\/root/, "~");
}

// Tiny, safe markdown: **bold**, `code`, ```blocks```, "- " bullets, links
// as plain text. Renders React nodes only (no innerHTML).
function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("`") && p.endsWith("`") && p.length > 1)
          return (
            <code key={i} className="px-1 py-0.5 rounded bg-black/[0.06] font-mono text-[0.9em]">
              {p.slice(1, -1)}
            </code>
          );
        if (p.startsWith("**") && p.endsWith("**") && p.length > 3) return <strong key={i}>{p.slice(2, -2)}</strong>;
        return <span key={i}>{p.replace(/^_(.*)_$/, "$1")}</span>;
      })}
    </>
  );
}

function Markdown({ text }: { text: string }) {
  const blocks = text.split(/```(?:\w+)?\n?([\s\S]*?)```/g);
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, bi) =>
        bi % 2 === 1 ? (
          <pre key={bi} className="rounded-lg bg-[#111] text-[#e6e6e6] p-3 text-[12px] font-mono overflow-x-auto whitespace-pre">
            {block.replace(/\n$/, "")}
          </pre>
        ) : (
          block
            .split(/\n{2,}/)
            .filter((para) => para.trim())
            .map((para, pi) => {
              const lines = para.split("\n");
              if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
                return (
                  <ul key={`${bi}-${pi}`} className="flex flex-col gap-1 pl-4 list-disc">
                    {lines.map((l, li) => (
                      <li key={li}>
                        <Inline text={l.replace(/^\s*([-*]|\d+\.)\s+/, "")} />
                      </li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={`${bi}-${pi}`} className="whitespace-pre-wrap">
                  <Inline text={para.replace(/^#+\s*/gm, "")} />
                </p>
              );
            })
        )
      )}
    </div>
  );
}

export default function ShellClient({ initialCredits, userKey }: { initialCredits: number; userKey: string }) {
  const storageKey = `gysm-shell:${userKey}`;
  const [items, setItems] = useState<Item[]>([]);
  const [messages, setMessages] = useState<unknown[]>([]);
  const [cwd, setCwd] = useState("");
  const [mode, setMode] = useState<Mode>("guide");
  const [inputMode, setInputMode] = useState<InputMode>("ai");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState(initialCredits);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Restore the conversation on this device (files live in the sandbox).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Saved;
        setItems((saved.items || []).map((it) => (it.kind === "cmd" && it.running ? { ...it, running: false } : it)));
        setMessages(saved.messages || []);
        setCwd(saved.cwd || "");
        setMode(saved.mode === "auto" ? "auto" : "guide");
      }
    } catch {
      /* storage unavailable -- start fresh */
    }
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      const saved: Saved = { items: items.slice(-MAX_SAVED_ITEMS), messages, cwd, mode };
      localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      /* quota or private mode -- not critical */
    }
  }, [items, messages, cwd, mode, loaded, storageKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length, busy]);

  const add = useCallback((item: Item) => setItems((prev) => [...prev, item]), []);
  const patch = useCallback(
    (id: string, fn: (it: Item) => Item) => setItems((prev) => prev.map((it) => (it.id === id ? fn(it) : it))),
    []
  );

  const handleError = useCallback(
    async (res: Response) => {
      let msg = "Something went wrong. Please try again.";
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
        if (j?.code === "NO_CREDITS") msg = "You're out of credits. Top up on the Pricing page to keep going.";
      } catch {}
      add({ id: uid(), kind: "note", text: msg, tone: "error" });
    },
    [add]
  );

  // ---- AI turn (streams NDJSON events) ----
  const runAgent = useCallback(
    async (payload: { text?: string; decision?: { toolUseId: string; approve: boolean; command?: string } }) => {
      setBusy(true);
      try {
        const res = await fetch("/api/shell/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, messages, cwd, mode }),
        });
        if (!res.ok || !res.body) {
          await handleError(res);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let runningId: string | null = null;
        let liveCwd = cwd;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let e: any;
            try {
              e = JSON.parse(line);
            } catch {
              continue;
            }
            if (e.type === "text") add({ id: uid(), kind: "ai", text: e.text });
            else if (e.type === "proposal")
              add({ id: uid(), kind: "proposal", toolUseId: e.toolUseId, command: e.command, explanation: e.explanation, risky: !!e.risky });
            else if (e.type === "command") {
              const id: string = uid();
              runningId = id;
              add({ id, kind: "cmd", command: e.command, explanation: e.explanation, by: e.by, running: true });
            } else if (e.type === "output") {
              const target = runningId;
              if (target) patch(target, (it) => (it.kind === "cmd" ? { ...it, output: e.output, exitCode: e.exitCode, running: false } : it));
              runningId = null;
              if (e.cwd) {
                liveCwd = e.cwd;
                setCwd(e.cwd);
              }
            } else if (e.type === "skipped") add({ id: uid(), kind: "note", text: "Skipped.", tone: "muted" });
            else if (e.type === "file") add({ id: uid(), kind: "file", path: e.path, cwd: liveCwd });
            else if (e.type === "credits") setCredits(e.balance);
            else if (e.type === "state") {
              setMessages(e.messages || []);
              if (e.cwd) setCwd(e.cwd);
            } else if (e.type === "error") add({ id: uid(), kind: "note", text: e.error, tone: "error" });
          }
        }
      } catch {
        add({ id: uid(), kind: "note", text: "Connection lost. Please try again.", tone: "error" });
      } finally {
        setBusy(false);
      }
    },
    [messages, cwd, mode, add, patch, handleError]
  );

  const hasPending = items.some((it) => it.kind === "proposal" && !it.resolved);

  // ---- Manual terminal command ----
  const runManual = useCallback(
    async (command: string) => {
      const id = uid();
      add({ id, kind: "cmd", command, by: "user", running: true });
      setBusy(true);
      try {
        const res = await fetch("/api/shell/exec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command, cwd }),
        });
        if (!res.ok) {
          patch(id, (it) => (it.kind === "cmd" ? { ...it, running: false } : it));
          await handleError(res);
          return;
        }
        const j = await res.json();
        patch(id, (it) => (it.kind === "cmd" ? { ...it, output: j.output, exitCode: j.exitCode, running: false } : it));
        if (j.cwd) setCwd(j.cwd);
        if (j.credits) setCredits(j.credits.balance);
        // Keep the AI aware of what the user did by hand, so "why did that
        // fail?" works right after a manual command. Skipped while a
        // proposed command is waiting: the history must end on that
        // tool_use until the user decides.
        if (!hasPending) setMessages((prev) => [
          ...prev,
          { role: "user", content: `(I ran this myself in the terminal)\n$ ${command}\nexit code: ${j.exitCode}\n${String(j.output || "").slice(0, 3000)}` },
          { role: "assistant", content: "Noted." },
        ]);
      } catch {
        patch(id, (it) => (it.kind === "cmd" ? { ...it, running: false } : it));
        add({ id: uid(), kind: "note", text: "Connection lost. Please try again.", tone: "error" });
      } finally {
        setBusy(false);
      }
    },
    [cwd, hasPending, add, patch, handleError]
  );

  const explain = useCallback(
    async (item: Extract<Item, { kind: "cmd" }>) => {
      patch(item.id, (it) => (it.kind === "cmd" ? { ...it, explaining: true } : it));
      try {
        const res = await fetch("/api/shell/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: item.command, output: item.output }),
        });
        if (!res.ok) {
          await handleError(res);
          patch(item.id, (it) => (it.kind === "cmd" ? { ...it, explaining: false } : it));
          return;
        }
        const j = await res.json();
        if (j.credits) setCredits(j.credits.balance);
        patch(item.id, (it) => (it.kind === "cmd" ? { ...it, explain: j.explanation, explaining: false } : it));
      } catch {
        patch(item.id, (it) => (it.kind === "cmd" ? { ...it, explaining: false } : it));
      }
    },
    [patch, handleError]
  );

  const pendingProposal = items.find((it) => it.kind === "proposal" && !it.resolved) as
    | Extract<Item, { kind: "proposal" }>
    | undefined;

  const decide = (p: Extract<Item, { kind: "proposal" }>, approve: boolean, command: string) => {
    patch(p.id, (it) => (it.kind === "proposal" ? { ...it, resolved: approve ? "run" : "skip", command } : it));
    runAgent({ decision: { toolUseId: p.toolUseId, approve, command } });
  };

  const submit = (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || busy) return;
    setInput("");
    if (inputMode === "terminal" && !textOverride) {
      runManual(text);
      return;
    }
    add({ id: uid(), kind: "user", text });
    if (pendingProposal) {
      // A new message while a command waits = skip it and answer the message.
      patch(pendingProposal.id, (it) => (it.kind === "proposal" ? { ...it, resolved: "skip" } : it));
      runAgent({ text, decision: { toolUseId: pendingProposal.toolUseId, approve: false } });
    } else {
      runAgent({ text });
    }
  };

  const upload = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      add({ id: uid(), kind: "note", text: "Files can be up to 4 MB for now.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("cwd", cwd);
      const res = await fetch("/api/shell/files", { method: "POST", body: form });
      if (!res.ok) {
        await handleError(res);
        return;
      }
      const j = await res.json();
      add({ id: uid(), kind: "note", text: `Uploaded ${file.name} → ${shortCwd(j.path)}`, tone: "muted" });
      if (!pendingProposal) setMessages((prev) => [
        ...prev,
        { role: "user", content: `(I uploaded a file: ${j.path})` },
        { role: "assistant", content: "Got it." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const newChat = () => {
    if (busy) return;
    setItems([]);
    setMessages([]);
  };

  const insertKey = (k: string) => {
    const el = inputRef.current;
    if (!el) return setInput((v) => v + k);
    const start = el.selectionStart ?? input.length;
    const end = el.selectionEnd ?? input.length;
    const next = input.slice(0, start) + k + input.slice(end);
    setInput(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + k.length, start + k.length);
    });
  };

  return (
    <div className="max-w-3xl mx-auto w-full flex flex-col min-h-[calc(100dvh-56px)] md:min-h-screen">
      {/* Header */}
      <div className="sticky top-[56px] md:top-0 z-20 bg-[#FCFCF9]/95 backdrop-blur border-b border-black/5 px-4 py-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <div className="h-8 w-8 rounded-lg bg-[#111] text-white grid place-items-center font-mono text-sm shrink-0">&gt;_</div>
          <div className="min-w-0">
            <div className="font-black leading-tight">Shell</div>
            <div className="text-[11px] font-mono text-black/40 truncate">{shortCwd(cwd)}</div>
          </div>
        </div>
        <div className="flex rounded-full bg-black/[0.05] p-0.5 text-[12px] font-bold" role="radiogroup" aria-label="AI mode">
          {(["guide", "auto"] as Mode[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-full transition ${mode === m ? "bg-white shadow-sm text-black" : "text-black/50"}`}
            >
              {m === "guide" ? "Guide me" : "Do it for me"}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-bold text-black/40 tabular-nums" title="Credits">
          {credits} cr
        </span>
        <button onClick={newChat} disabled={busy} className="text-[12px] font-bold text-black/50 hover:text-black px-2 py-1.5 disabled:opacity-40">
          New chat
        </button>
      </div>

      {/* Timeline */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3">
        {loaded && items.length === 0 && (
          <div className="py-8 flex flex-col gap-5">
            <div>
              <h1 className="text-2xl font-black tracking-tight">Your computer in the cloud.</h1>
              <p className="text-black/60 mt-1 text-[15px]">
                Tell the AI what you want done. It runs the commands in your own private Linux workspace and explains every
                step. Prefer typing commands yourself? Switch to <b>Terminal</b> below.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInputMode("ai");
                    add({ id: uid(), kind: "user", text: s });
                    runAgent({ text: s });
                  }}
                  disabled={busy}
                  className="text-left px-4 py-3 rounded-2xl border border-black/10 bg-white text-[14px] font-semibold hover:border-black/30 transition disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-black/40">
              <b>Guide me</b> asks before every command. <b>Do it for me</b> runs commands on its own and only asks before risky
              ones. AI help is billed by usage; each command costs 5 credits.
            </p>
          </div>
        )}

        {items.map((it) => {
          if (it.kind === "user")
            return (
              <div key={it.id} className="self-end max-w-[85%] rounded-2xl rounded-br-md bg-black text-white px-4 py-2.5 text-[15px] whitespace-pre-wrap">
                {it.text}
              </div>
            );
          if (it.kind === "ai")
            return (
              <div key={it.id} className="self-start max-w-[92%] text-[15px] leading-relaxed text-black/85">
                <Markdown text={it.text} />
              </div>
            );
          if (it.kind === "note")
            return (
              <div
                key={it.id}
                className={`text-[13px] ${it.tone === "error" ? "text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2" : "text-black/40"}`}
              >
                {it.text}
              </div>
            );
          if (it.kind === "file")
            return (
              <a
                key={it.id}
                href={`/api/shell/files?path=${encodeURIComponent(it.path)}&cwd=${encodeURIComponent(it.cwd)}`}
                className="self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-white text-[14px] font-bold"
                style={{ background: PINK }}
              >
                ⬇ Download {it.path.split("/").pop()}
              </a>
            );
          if (it.kind === "proposal") return <ProposalCard key={it.id} p={it} busy={busy} onDecide={decide} />;
          return <CommandCard key={it.id} c={it} onExplain={explain} />;
        })}

        {busy && !items.some((it) => it.kind === "cmd" && it.running) && (
          <div className="self-start flex items-center gap-1.5 text-black/40 text-[13px]" aria-live="polite">
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:240ms]" />
            <span className="ml-1">Working…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 z-20 bg-[#FCFCF9]/95 backdrop-blur border-t border-black/5 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex rounded-full bg-black/[0.05] p-0.5 text-[12px] font-bold">
            {(["ai", "terminal"] as InputMode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setInputMode(m);
                  inputRef.current?.focus();
                }}
                className={`px-3 py-1 rounded-full transition ${inputMode === m ? "bg-white shadow-sm text-black" : "text-black/50"}`}
              >
                {m === "ai" ? "Ask AI" : "Terminal"}
              </button>
            ))}
          </div>
          {inputMode === "terminal" && (
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => insertKey(k)}
                  className="shrink-0 min-w-[34px] px-2 py-1 rounded-md bg-white border border-black/10 font-mono text-[13px]"
                >
                  {k}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-end gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Upload a file"
            className="h-11 w-11 shrink-0 rounded-full border border-black/10 bg-white grid place-items-center text-black/60 disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.4 11.1l-9.2 9.2a6 6 0 01-8.5-8.5l9.2-9.2a4 4 0 015.7 5.7l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5" />
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <div className={`flex-1 flex items-end rounded-2xl border bg-white px-3 ${inputMode === "terminal" ? "border-black/30 font-mono" : "border-black/10"}`}>
            {inputMode === "terminal" && <span className="py-3 pr-1.5 text-[15px] font-mono" style={{ color: PINK }}>$</span>}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              autoCapitalize={inputMode === "terminal" ? "off" : "sentences"}
              autoCorrect={inputMode === "terminal" ? "off" : "on"}
              spellCheck={inputMode !== "terminal"}
              placeholder={
                pendingProposal
                  ? "Or tell the AI something else…"
                  : inputMode === "terminal"
                    ? "Type a command, e.g. ls -la"
                    : "What should I do? e.g. convert my CSV to Excel"
              }
              className="flex-1 resize-none bg-transparent py-3 text-[16px] outline-none max-h-40"
            />
          </div>
          <button
            onClick={() => submit()}
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="h-11 w-11 shrink-0 rounded-full grid place-items-center text-white disabled:opacity-30 transition"
            style={{ background: inputMode === "terminal" ? "#111" : PINK }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function CommandCard({ c, onExplain }: { c: Extract<Item, { kind: "cmd" }>; onExplain: (c: Extract<Item, { kind: "cmd" }>) => void }) {
  const failed = !c.running && c.exitCode !== undefined && c.exitCode !== 0;
  return (
    <div className="rounded-2xl overflow-hidden border border-black/10 bg-[#111] text-[#e6e6e6]">
      {c.explanation && (
        <div className="px-4 pt-3 text-[13px] text-white/60 font-sans leading-snug">{c.explanation}</div>
      )}
      <div className="px-4 pt-2.5 pb-2 font-mono text-[13px] flex gap-2">
        <span style={{ color: PINK }}>$</span>
        <span className="whitespace-pre-wrap break-all text-white">{c.command}</span>
      </div>
      {c.running ? (
        <div className="px-4 pb-3 font-mono text-[12px] text-white/40 animate-pulse">running…</div>
      ) : c.output !== undefined ? (
        <pre className="px-4 pb-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words max-h-80 overflow-y-auto text-white/80">
          {c.output || <span className="text-white/30">(no output)</span>}
        </pre>
      ) : null}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white/[0.04] border-t border-white/10 font-sans">
        <span className={`text-[11px] font-bold ${failed ? "text-red-400" : "text-white/30"}`}>
          {c.running ? "" : failed ? `failed (exit ${c.exitCode})` : c.by === "ai" ? "run by AI" : "run by you"}
        </span>
        {!c.explain && (
          <button
            onClick={() => onExplain(c)}
            disabled={c.explaining || c.running}
            className="text-[12px] font-bold text-white/70 hover:text-white px-2 py-1 disabled:opacity-40"
          >
            {c.explaining ? "Explaining…" : "Explain"}
          </button>
        )}
      </div>
      {c.explain && (
        <div className="bg-white text-black/80 px-4 py-3 text-[14px] leading-relaxed font-sans">
          <Markdown text={c.explain} />
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  p,
  busy,
  onDecide,
}: {
  p: Extract<Item, { kind: "proposal" }>;
  busy: boolean;
  onDecide: (p: Extract<Item, { kind: "proposal" }>, approve: boolean, command: string) => void;
}) {
  const [command, setCommand] = useState(p.command);
  const [editing, setEditing] = useState(false);

  if (p.resolved) {
    return p.resolved === "skip" ? (
      <div className="text-[13px] text-black/40 font-mono line-through truncate">$ {p.command}</div>
    ) : null; // an approved command shows up as a CommandCard once it runs
  }

  return (
    <div className={`rounded-2xl border-2 bg-white overflow-hidden ${p.risky ? "border-amber-400" : "border-black/10"}`}>
      <div className="px-4 pt-3 flex items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-black/40">Ready to run</span>
        {p.risky && (
          <span className="text-[11px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
            Careful
          </span>
        )}
      </div>
      <p className="px-4 pt-1.5 text-[14px] text-black/70 leading-snug">{p.explanation}</p>
      <div className="mx-4 mt-2.5 rounded-xl bg-[#111] px-3 py-2.5 font-mono text-[13px] text-white flex gap-2">
        <span style={{ color: PINK }}>$</span>
        {editing ? (
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            rows={Math.min(6, command.split("\n").length + 1)}
            className="flex-1 bg-transparent outline-none resize-none text-white"
          />
        ) : (
          <span className="whitespace-pre-wrap break-all">{command}</span>
        )}
      </div>
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={() => onDecide(p, true, command)}
          disabled={busy || !command.trim()}
          className="flex-1 h-11 rounded-full text-white font-bold text-[15px] disabled:opacity-40"
          style={{ background: PINK }}
        >
          Run it
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          disabled={busy}
          className="h-11 px-4 rounded-full border border-black/10 font-bold text-[14px] text-black/70 disabled:opacity-40"
        >
          {editing ? "Done" : "Edit"}
        </button>
        <button
          onClick={() => onDecide(p, false, command)}
          disabled={busy}
          className="h-11 px-4 rounded-full font-bold text-[14px] text-black/50 disabled:opacity-40"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
