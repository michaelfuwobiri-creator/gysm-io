"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// GYSM Agent UI: one timeline of chat text, tool activity and approval
// cards. The conversation history (OpenAI chat format) is kept here and
// sent back each turn; see lib/agent.ts.

type Item =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "ai"; text: string }
  | { id: string; kind: "tool"; callId: string; name: string; summary: string; ok?: boolean; output?: string; running: boolean }
  | {
      id: string;
      kind: "proposal";
      callId: string;
      name: string;
      summary: string;
      detail: string;
      risky: boolean;
      resolved?: "approved" | "declined";
    }
  | { id: string; kind: "note"; text: string; tone?: "error" | "muted" };

type Saved = { items: Item[]; messages: unknown[] };

const PINK = "#FF0080";
const MAX_SAVED_ITEMS = 150;

const STARTERS = [
  "Build a one-page site for my bakery and deploy it",
  "Make a tiny to-do web app, check it works, then deploy it",
  "Create a database table for customer sign-ups",
  "Show me what's in my workspace",
];

let idCounter = 0;
const uid = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

const TOOL_LABEL: Record<string, string> = {
  write_file: "Write file",
  read_file: "Read file",
  run_command: "Run command",
  deploy: "Deploy",
  create_db_table: "Database schema",
  get_logs: "Logs",
};

export default function AgentClient({ initialCredits, userKey }: { initialCredits: number; userKey: string }) {
  const storageKey = `gysm-agent:${userKey}`;
  const [items, setItems] = useState<Item[]>([]);
  const [messages, setMessages] = useState<unknown[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState(initialCredits);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<unknown[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw) as Saved;
        if (Array.isArray(s.items)) setItems(s.items.map((i) => (i.kind === "tool" ? { ...i, running: false } : i)));
        if (Array.isArray(s.messages)) setMessages(s.messages);
      }
    } catch {
      /* storage unavailable */
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      const saved: Saved = { items: items.slice(-MAX_SAVED_ITEMS), messages };
      localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }, [items, messages, storageKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, busy]);

  const push = useCallback((item: Item) => setItems((prev) => [...prev, item]), []);

  const send = useCallback(
    async (body: { text?: string; decision?: { toolCallId: string; approve: boolean } }) => {
      setBusy(true);
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, messages: messagesRef.current }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          const msg = j?.code === "NO_CREDITS" ? "You're out of credits. Top up on the Pricing page to keep going." : j?.error || "Something went wrong.";
          push({ id: uid(), kind: "note", text: msg, tone: "error" });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const handle = (e: any) => {
          if (e.type === "text") push({ id: uid(), kind: "ai", text: e.text });
          else if (e.type === "tool")
            push({ id: uid(), kind: "tool", callId: e.toolCallId, name: e.name, summary: e.summary, running: true });
          else if (e.type === "tool_result")
            setItems((prev) =>
              prev.map((i) => (i.kind === "tool" && i.callId === e.toolCallId ? { ...i, running: false, ok: e.ok, output: e.output } : i))
            );
          else if (e.type === "proposal")
            push({ id: uid(), kind: "proposal", callId: e.toolCallId, name: e.name, summary: e.summary, detail: e.detail, risky: e.risky });
          else if (e.type === "declined") push({ id: uid(), kind: "note", text: `Declined: ${TOOL_LABEL[e.name] || e.name}`, tone: "muted" });
          else if (e.type === "credits") {
            if (e.balance || e.spent) setCredits(e.balance);
          } else if (e.type === "state") setMessages(e.messages);
          else if (e.type === "error") push({ id: uid(), kind: "note", text: e.error, tone: "error" });
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            try {
              handle(JSON.parse(line));
            } catch {
              /* skip malformed line */
            }
          }
        }
      } catch {
        push({ id: uid(), kind: "note", text: "Connection lost. Please try again.", tone: "error" });
      } finally {
        setBusy(false);
      }
    },
    [push]
  );

  const submit = (t: string) => {
    const v = t.trim();
    if (!v || busy) return;
    setText("");
    push({ id: uid(), kind: "user", text: v });
    void send({ text: v });
  };

  const decide = (item: Extract<Item, { kind: "proposal" }>, approve: boolean) => {
    if (busy) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, resolved: approve ? "approved" : "declined" } : i)));
    void send({ decision: { toolCallId: item.callId, approve } });
  };

  const reset = () => {
    if (busy) return;
    setItems([]);
    setMessages([]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 24px)", maxWidth: 820, margin: "0 auto", padding: "0 12px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>GYSM Agent</h1>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Builds, runs, and deploys in your private workspace. Deploys and database changes ask you first.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, border: `1px solid ${PINK}`, borderRadius: 999, padding: "2px 10px" }}>{credits} cr</span>
          <button onClick={reset} disabled={busy} style={{ fontSize: 12, background: "none", border: "1px solid #8884", borderRadius: 8, padding: "4px 8px", color: "inherit" }}>
            New chat
          </button>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
        {items.length === 0 && (
          <div style={{ display: "grid", gap: 8, marginTop: 24 }}>
            <div style={{ opacity: 0.8, fontSize: 14 }}>Tell the agent what to build. For example:</div>
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => submit(s)}
                style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "1px solid #8884", background: "none", color: "inherit", fontSize: 14 }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {items.map((item) => {
          if (item.kind === "user")
            return (
              <div key={item.id} style={{ display: "flex", justifyContent: "flex-end", margin: "8px 0" }}>
                <div style={{ background: PINK, color: "#fff", padding: "8px 12px", borderRadius: 14, maxWidth: "85%", whiteSpace: "pre-wrap" }}>{item.text}</div>
              </div>
            );
          if (item.kind === "ai")
            return (
              <div key={item.id} style={{ margin: "8px 0", whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5 }}>
                {item.text}
              </div>
            );
          if (item.kind === "tool")
            return (
              <details key={item.id} style={{ margin: "6px 0", border: "1px solid #8883", borderRadius: 10, padding: "6px 10px", fontSize: 13 }}>
                <summary style={{ cursor: "pointer" }}>
                  {item.running ? "… " : item.ok ? "✓ " : "✗ "}
                  <strong>{TOOL_LABEL[item.name] || item.name}</strong> <span style={{ opacity: 0.75 }}>{item.summary}</span>
                </summary>
                {item.output && <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, margin: "6px 0 0", maxHeight: 260, overflow: "auto" }}>{item.output}</pre>}
              </details>
            );
          if (item.kind === "proposal")
            return (
              <div key={item.id} style={{ margin: "10px 0", border: `1px solid ${item.risky ? "#d33" : PINK}`, borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{item.risky ? "Needs your approval" : "Approval"}</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{item.summary}</div>
                {item.detail && <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, maxHeight: 220, overflow: "auto", margin: "0 0 8px" }}>{item.detail}</pre>}
                {item.resolved ? (
                  <div style={{ fontSize: 13, opacity: 0.8 }}>{item.resolved === "approved" ? "Approved" : "Declined"}</div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => decide(item, true)} disabled={busy} style={{ background: PINK, color: "#fff", border: 0, borderRadius: 8, padding: "8px 14px", fontWeight: 600 }}>
                      Approve
                    </button>
                    <button onClick={() => decide(item, false)} disabled={busy} style={{ background: "none", color: "inherit", border: "1px solid #8886", borderRadius: 8, padding: "8px 14px" }}>
                      Decline
                    </button>
                  </div>
                )}
              </div>
            );
          return (
            <div key={item.id} style={{ margin: "8px 0", fontSize: 13, color: item.tone === "error" ? "#d33" : undefined, opacity: item.tone === "muted" ? 0.7 : 1 }}>
              {item.text}
            </div>
          );
        })}
        {busy && <div style={{ fontSize: 13, opacity: 0.7, margin: "8px 0" }}>Working…</div>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
        style={{ display: "flex", gap: 8, padding: "8px 0 12px" }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(text);
            }
          }}
          placeholder="What should the agent build?"
          rows={2}
          style={{ flex: 1, borderRadius: 12, border: "1px solid #8886", padding: 10, background: "none", color: "inherit", resize: "none", font: "inherit" }}
        />
        <button type="submit" disabled={busy || !text.trim()} style={{ background: PINK, color: "#fff", border: 0, borderRadius: 12, padding: "0 18px", fontWeight: 600, opacity: busy || !text.trim() ? 0.5 : 1 }}>
          Send
        </button>
      </form>
      <div style={{ fontSize: 11, opacity: 0.6, paddingBottom: 8 }}>AI usage is billed in credits; each command costs 5, each deploy 25.</div>
    </div>
  );
}
