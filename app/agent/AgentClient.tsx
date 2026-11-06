"use client";

import { formatCredits, PLAN_WINDOW_LIMIT_CREDITS, UNLIMITED_BALANCE } from "@/lib/credits-constants";
import { useCallback, useEffect, useRef, useState } from "react";
import GysmMark from "./GysmMark";
import PreviewPanel from "./PreviewPanel";
import { itemsBefore, messagesBeforeUser, userItemBefore, userPositionFromEnd } from "@/lib/agentHistory";
import "./builder.css";
import { folderAccessSupported, localFileExists, runLocalTool, type DirHandleLike } from "@/lib/localFolder";

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
      secretLabel?: string;
      project?: string;
      /** A change to the user's own computer, run by this browser after approval. */
      local?: boolean;
      resolved?: "approved" | "declined";
    }
  | { id: string; kind: "note"; text: string; tone?: "error" | "muted" };

type Saved = { items: Item[]; messages: unknown[] };

const PINK = "#FF0080";
const MAX_SAVED_ITEMS = 150;

const STARTERS = [
  { label: "Build and deploy a site", prompt: "Build a one-page site for my bakery and deploy it" },
  { label: "Make a small web app", prompt: "Make a tiny to-do web app, check it works, then deploy it" },
  { label: "Set up a database table", prompt: "Create a database table for customer sign-ups" },
  { label: "Look through my workspace", prompt: "Show me what's in my workspace" },
  { label: "Review my website", prompt: "Review my website for SEO, speed and mobile problems: https://" },
];

const iconProps = { width: 15, height: 15, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const IconCopy = () => (
  <svg {...iconProps}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.8" />
    <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
  </svg>
);
const IconCheck = () => (
  <svg {...iconProps}>
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);
const IconEdit = () => (
  <svg {...iconProps}>
    <path d="M10.5 3.5 12.5 5.5M3 13l.6-2.6L11 3a1.4 1.4 0 0 1 2 2l-7.4 7.4L3 13Z" />
  </svg>
);
const IconRewrite = () => (
  <svg {...iconProps}>
    <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v2.8h-2.8" />
  </svg>
);

let idCounter = 0;
const uid = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

const TOOL_LABEL: Record<string, string> = {
  write_file: "Write file",
  read_file: "Read file",
  run_command: "Run command",
  deploy: "Deploy",
  create_db_table: "Database schema",
  get_logs: "Logs",
  edit_file: "Edit file",
  list_dir: "List folder",
  search: "Search files",
  query_db: "Database query",
  list_tables: "Database tables",
  set_env: "Secret",
  web_search: "Web search",
  fetch_url: "Fetch page",
  review_site: "Site review",
  suggest_next: "Suggestions",
  local_list: "Your folder",
  local_read: "Read (your computer)",
  local_write: "Write (your computer)",
  local_edit: "Edit (your computer)",
};

type ClientCall = { toolCallId: string; name: string; args: any; summary: string; write: boolean };
type ClientResult = { toolCallId: string; ok: boolean; output: string; declined?: boolean };

export default function AgentClient({ initialCredits, onPlan = false, userKey, initialPrompt = "" }: { initialCredits: number; onPlan?: boolean; userKey: string; initialPrompt?: string }) {
  const storageKey = `gysm-agent:${userKey}`;
  const [items, setItems] = useState<Item[]>([]);
  const [messages, setMessages] = useState<unknown[]>([]);
  const [text, setText] = useState(initialPrompt);
  const [busy, setBusy] = useState(false);
  // Clickable next steps from the agent; cleared as soon as anything new is sent.
  const [suggestions, setSuggestions] = useState<{ title: string; prompt: string }[]>([]);
  const [credits, setCredits] = useState(initialCredits);
  // What the agent is doing right now, shown beside the working GYSM mark.
  const [activity, setActivity] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Edit / Rewrite / Copy on messages.
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Preview: the project folder the agent is working on, and whether the side panel is open.
  const [lastProject, setLastProject] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Secret values live only in this in-memory map: never saved, never added to the chat history.
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<unknown[]>([]);
  messagesRef.current = messages;
  // The folder the user connected. The handle lives only in memory: after a
  // reload the user reconnects, which is also how permission is re-granted.
  const folderRef = useRef<DirHandleLike | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [folderSupported, setFolderSupported] = useState(false);
  const [folderError, setFolderError] = useState("");
  const pendingLocalRef = useRef<Record<string, ClientCall>>({});
  const runClientCallRef = useRef<(c: ClientCall) => Promise<void>>(async () => {});
  const sendRef = useRef<(b: any) => Promise<void>>(async () => {});

  useEffect(() => setFolderSupported(folderAccessSupported()), []);

  const connectFolder = async () => {
    setFolderError("");
    try {
      const handle = await (window as any).showDirectoryPicker({ id: "gysm-agent", mode: "readwrite" });
      folderRef.current = handle;
      setFolderName(handle.name);
    } catch (e: any) {
      if (e?.name !== "AbortError") setFolderError("Couldn't open that folder. Your browser may have blocked it (system folders aren't allowed).");
    }
  };
  const disconnectFolder = () => {
    folderRef.current = null;
    setFolderName(null);
    pendingLocalRef.current = {};
  };

  // The homepage and use-case pages stash the visitor's idea here before
  // sign-up; prefill it (never auto-run it) and clear it.
  useEffect(() => {
    try {
      const pending = localStorage.getItem("gysm_pending_prompt");
      if (pending) {
        localStorage.removeItem("gysm_pending_prompt");
        setText((t) => t || pending.slice(0, 2000));
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

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
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, busy]);

  const push = useCallback((item: Item) => setItems((prev) => [...prev, item]), []);

  const send = useCallback(
    async (body: { text?: string; decision?: { toolCallId: string; approve: boolean; secret?: string }; clientResult?: ClientResult }) => {
      setBusy(true);
      setSuggestions([]);
      let clientCall: ClientCall | null = null;
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, messages: messagesRef.current, localFolder: folderRef.current ? folderRef.current.name : undefined }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          const msg = j?.code === "NO_CREDITS" ? "You're out of credits. Subscribe on the Pricing page to keep going." : j?.error || "Something went wrong.";
          push({ id: uid(), kind: "note", text: msg, tone: "error" });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const handle = (e: any) => {
          if (e.type === "text") push({ id: uid(), kind: "ai", text: e.text });
          else if (e.type === "tool") {
            setActivity(e.summary);
            if (e.project) setLastProject(e.project);
            push({ id: uid(), kind: "tool", callId: e.toolCallId, name: e.name, summary: e.summary, running: true });
          } else if (e.type === "tool_result") {
            // Files changed: refresh the preview if it is open.
            if (e.ok && (e.name === "write_file" || e.name === "edit_file")) setPreviewKey((k) => k + 1);
            setItems((prev) =>
              prev.map((i) => (i.kind === "tool" && i.callId === e.toolCallId ? { ...i, running: false, ok: e.ok, output: e.output } : i))
            );
          } else if (e.type === "proposal") {
            push({ id: uid(), kind: "proposal", callId: e.toolCallId, name: e.name, summary: e.summary, detail: e.detail, risky: e.risky, secretLabel: e.secretInput?.label, project: e.project });
            // Show the site before the user is asked to approve a deploy.
            if (e.name === "deploy" && e.project) {
              setLastProject(e.project);
              setPreviewOpen(true);
            }
          } else if (e.type === "suggestions") setSuggestions(Array.isArray(e.suggestions) ? e.suggestions : []);
          else if (e.type === "declined") push({ id: uid(), kind: "note", text: `Declined: ${TOOL_LABEL[e.name] || e.name}`, tone: "muted" });
          else if (e.type === "credits") {
            if (e.balance || e.spent) setCredits(e.balance);
          } else if (e.type === "state") {
            messagesRef.current = e.messages;
            setMessages(e.messages);
          } else if (e.type === "client_tool") clientCall = { toolCallId: e.toolCallId, name: e.name, args: e.args, summary: e.summary, write: e.write };
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
        // The agent asked for something on the user's computer: run it here
        // (reads) or ask first (writes), then continue the same turn.
        if (clientCall) await runClientCallRef.current(clientCall);
      } catch {
        push({ id: uid(), kind: "note", text: "Connection lost. Please try again.", tone: "error" });
      } finally {
        setBusy(false);
        setActivity("");
      }
    },
    [push]
  );
  sendRef.current = send;

  runClientCallRef.current = async (call: ClientCall) => {
    const root = folderRef.current;
    if (!root) {
      await sendRef.current({ clientResult: { toolCallId: call.toolCallId, ok: false, output: "The folder is no longer connected." } });
      return;
    }
    if (call.write) {
      // Writes always wait for an explicit click.
      pendingLocalRef.current[call.toolCallId] = call;
      const exists = await localFileExists(root, String(call.args?.path ?? ""));
      const detail =
        call.name === "local_write"
          ? `${exists ? "Overwrites" : "Creates"} ${call.args?.path} in "${root.name}"\n\n${String(call.args?.content ?? "").slice(0, 3000)}`
          : `Edits ${call.args?.path} in "${root.name}"\n\n--- replace ---\n${String(call.args?.old_string ?? "").slice(0, 1500)}\n--- with ---\n${String(call.args?.new_string ?? "").slice(0, 1500)}`;
      push({ id: uid(), kind: "proposal", callId: call.toolCallId, name: call.name, summary: call.summary, detail, risky: call.name === "local_write" && exists, local: true });
      return;
    }
    push({ id: uid(), kind: "tool", callId: call.toolCallId, name: call.name, summary: call.summary, running: true });
    const r = await runLocalTool(root, call.name, call.args);
    setItems((prev) => prev.map((i) => (i.kind === "tool" && i.callId === call.toolCallId ? { ...i, running: false, ok: r.ok, output: r.output.slice(0, 4000) } : i)));
    await sendRef.current({ clientResult: { toolCallId: call.toolCallId, ok: r.ok, output: r.output } });
  };

  const submit = (t: string) => {
    const v = t.trim();
    if (!v || busy) return;
    setText("");
    push({ id: uid(), kind: "user", text: v });
    void send({ text: v });
  };

  const decideLocal = async (item: Extract<Item, { kind: "proposal" }>, approve: boolean) => {
    const call = pendingLocalRef.current[item.callId];
    delete pendingLocalRef.current[item.callId];
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, resolved: approve ? "approved" : "declined" } : i)));
    if (!call || !folderRef.current) {
      void send({ clientResult: { toolCallId: item.callId, ok: false, output: "The folder is no longer connected." } });
      return;
    }
    if (!approve) {
      void send({ clientResult: { toolCallId: item.callId, ok: false, output: "", declined: true } });
      return;
    }
    const r = await runLocalTool(folderRef.current, call.name, call.args);
    push({ id: uid(), kind: "tool", callId: call.toolCallId, name: call.name, summary: call.summary, running: false, ok: r.ok, output: r.output });
    void send({ clientResult: { toolCallId: item.callId, ok: r.ok, output: r.output } });
  };

  const decide = (item: Extract<Item, { kind: "proposal" }>, approve: boolean) => {
    if (busy) return;
    if (item.local) {
      void decideLocal(item, approve);
      return;
    }
    const secret = item.secretLabel ? secrets[item.id] : undefined;
    if (approve && item.secretLabel && !secret?.trim()) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, resolved: approve ? "approved" : "declined" } : i)));
    setSecrets((prev) => {
      const { [item.id]: _drop, ...rest } = prev;
      return rest;
    });
    void send({ decision: { toolCallId: item.callId, approve, secret } });
  };

  const copyText = async (id: string, value: string) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      // Older browsers: fall back to selecting a hidden textarea.
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (!ok) return;
    setCopiedId(id);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedId(null), 1600);
  };

  // Edit and Rewrite both go back to just before a user message and send
  // text again. Anything the agent already did (files, deploys) stays done.
  const rerunFrom = (userItem: Extract<Item, { kind: "user" }>, newText: string) => {
    const t = newText.trim();
    if (!t || busy) return;
    const pos = userPositionFromEnd(items, userItem.id);
    const cut = pos === -1 ? null : messagesBeforeUser(messagesRef.current as { role: string }[], pos);
    if (!cut) {
      push({ id: uid(), kind: "note", text: "That message is too far back to redo. Start a new chat or send a new message.", tone: "error" });
      return;
    }
    messagesRef.current = cut;
    setMessages(cut);
    setItems((prev) => [...itemsBefore(prev, userItem.id), { id: uid(), kind: "user", text: t }]);
    pendingLocalRef.current = {};
    setEditing(null);
    void send({ text: t });
  };

  const canRedo = (userItem: Extract<Item, { kind: "user" }>) => {
    const pos = userPositionFromEnd(items, userItem.id);
    return pos !== -1 && messagesBeforeUser(messagesRef.current as { role: string }[], pos) !== null;
  };

  const lastAiId = (() => {
    for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === "ai") return items[i].id;
    return null;
  })();

  const reset = () => {
    if (busy) return;
    setItems([]);
    setMessages([]);
    setEditing(null);
    setPreviewOpen(false);
    setLastProject(null);
  };

  const canSend = !busy && !!text.trim();
  const fillStarter = (prompt: string) => {
    setText(prompt);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const composer = (
    <div className="gb-composer-wrap">
      <form
        className="gb-composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <textarea
          ref={taRef}
          id="gb-input"
          aria-label="Message GYSM Builder"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit(text);
            }
          }}
          placeholder={items.length ? "Reply to GYSM Builder…" : "Describe what you want to build…"}
          rows={1}
        />
        <div className="gb-comp-row">
          <div className="left">
            {folderSupported &&
              (folderName ? (
                <>
                  <span className="gb-tag" title={`Connected folder: ${folderName}`}>
                    {folderName}
                  </span>
                  <button type="button" className="gb-ghost" onClick={disconnectFolder} disabled={busy} aria-label="Disconnect folder">
                    Disconnect
                  </button>
                </>
              ) : (
                <button type="button" className="gb-ghost" onClick={connectFolder} disabled={busy} title="Let the agent work in a folder on your computer. You approve every change.">
                  + Folder
                </button>
              ))}
          </div>
          <button type="submit" className={`gb-send${busy ? " working" : ""}`} disabled={!canSend} aria-label={busy ? "GYSM is working" : "Send"}>
            {busy ? (
              <GysmMark size={22} working onFuchsia />
            ) : (
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="gb">
      <div className="gb-main">
      <header className="gb-top">
        <div className="gb-brand">
          <GysmMark size={24} working={busy} title="GYSM" />
          <span>Builder</span>
          <small>by GYSM</small>
        </div>
        <div className="gb-actions">
          {lastProject && (
            <button className="gb-ghost" aria-pressed={previewOpen} onClick={() => setPreviewOpen((o) => !o)} title={`Preview ${lastProject} before it goes live`}>
              Preview
            </button>
          )}
          {credits >= UNLIMITED_BALANCE ? (
            <span className="gb-pill" title="Your plan">Unlimited</span>
          ) : onPlan ? (
            <a className="gb-pill" href="/billing" title="Usage left in this 5-hour window. Resets are shown in Billing.">
              {Math.max(0, Math.min(100, Math.floor((credits / PLAN_WINDOW_LIMIT_CREDITS) * 100)))}% left
            </a>
          ) : (
            <span className="gb-pill" title="Your credit balance">{formatCredits(credits)} credits</span>
          )}
          <a className="gb-ghost" href="/builder?classic=1">
            Classic builder
          </a>
          <button className="gb-ghost" onClick={reset} disabled={busy}>
            New chat
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="gb-scroll">
          <div className="gb-empty">
            <div className="gb-hero">
              <GysmMark size={44} working={busy} />
              <h1>What shall we build?</h1>
              <p>Describe it. GYSM writes it, checks it, and shows you before anything goes live.</p>
            </div>
            {composer}
            {folderError && <div className="gb-note error" style={{ marginLeft: 0 }}>{folderError}</div>}
            <div className="gb-chips">
              {STARTERS.map((st) => (
                <button key={st.label} className="gb-chip" onClick={() => fillStarter(st.prompt)} title={st.prompt}>
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="gb-scroll">
            <div className="gb-col">
              {items.map((item) => {
                if (item.kind === "user")
                  return (
                    <div key={item.id} className="gb-user gb-msg">
                      {editing?.id === item.id ? (
                        <div className="gb-edit">
                          <textarea
                            id={`edit-${item.id}`}
                            aria-label="Edit your message"
                            autoFocus
                            rows={3}
                            value={editing.text}
                            onChange={(e) => setEditing({ id: item.id, text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setEditing(null);
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) rerunFrom(item, editing.text);
                            }}
                          />
                          <div className="gb-edit-note">Sends from here. Steps the agent already took, like files written or sites deployed, are not undone.</div>
                          <div className="gb-btns">
                            <button className="gb-secondary" onClick={() => setEditing(null)}>
                              Cancel
                            </button>
                            <button className="gb-primary" onClick={() => rerunFrom(item, editing.text)} disabled={busy || !editing.text.trim()}>
                              Save and send
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="gb-bubble">{item.text}</div>
                          <div className="gb-msg-actions">
                            <button className="gb-act" onClick={() => copyText(item.id, item.text)} aria-label="Copy message">
                              {copiedId === item.id ? <IconCheck /> : <IconCopy />}
                              <span>{copiedId === item.id ? "Copied" : "Copy"}</span>
                            </button>
                            {!busy && canRedo(item) && (
                              <button className="gb-act" onClick={() => setEditing({ id: item.id, text: item.text })} aria-label="Edit message">
                                <IconEdit />
                                <span>Edit</span>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                if (item.kind === "ai") {
                  const redoFrom = !busy && item.id === lastAiId ? userItemBefore(items, item.id) : null;
                  return (
                    <div key={item.id} className="gb-ai gb-msg">
                      <div className="gb-ai-mark">
                        <GysmMark size={22} />
                      </div>
                      <div className="gb-ai-body">
                        <div className="gb-ai-text">{item.text}</div>
                        <div className="gb-msg-actions">
                          <button className="gb-act" onClick={() => copyText(item.id, item.text)} aria-label="Copy reply">
                            {copiedId === item.id ? <IconCheck /> : <IconCopy />}
                            <span>{copiedId === item.id ? "Copied" : "Copy"}</span>
                          </button>
                          {redoFrom && redoFrom.kind === "user" && canRedo(redoFrom as Extract<Item, { kind: "user" }>) && (
                            <button
                              className="gb-act"
                              onClick={() => rerunFrom(redoFrom as Extract<Item, { kind: "user" }>, (redoFrom as Extract<Item, { kind: "user" }>).text)}
                              aria-label="Rewrite reply"
                              title="Ask again and get a new answer. Uses credits again."
                            >
                              <IconRewrite />
                              <span>Rewrite</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }
                if (item.kind === "tool")
                  return (
                    <details key={item.id} className="gb-tool">
                      <summary>
                        <span className="gb-dot">
                          {item.running ? (
                            <span className="gb-spinner" />
                          ) : item.ok ? (
                            <svg className="gb-ok" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Done"><path d="m3.5 8.5 3 3 6-7" /></svg>
                          ) : (
                            <svg className="gb-bad" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="Failed"><path d="m4 4 8 8M12 4l-8 8" /></svg>
                          )}
                        </span>
                        <b>{TOOL_LABEL[item.name] || item.name}</b>
                        <span className="gb-sum">{item.summary}</span>
                      </summary>
                      {item.output && <pre>{item.output}</pre>}
                    </details>
                  );
                if (item.kind === "proposal")
                  return (
                    <div key={item.id} className="gb-approve">
                      <div className={`gb-eyebrow${item.risky ? " risky" : ""}`}>{item.risky ? "Needs your approval · be careful" : "Needs your approval"}</div>
                      <h3>{item.summary}</h3>
                      {item.detail && <pre>{item.detail}</pre>}
                      {item.secretLabel && !item.resolved && (
                        <input
                          type="password"
                          id={`secret-${item.id}`}
                          aria-label={item.secretLabel}
                          autoComplete="off"
                          placeholder={`${item.secretLabel} (only you can see this)`}
                          value={secrets[item.id] ?? ""}
                          onChange={(e) => setSecrets((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        />
                      )}
                      {item.resolved ? (
                        <div className="gb-resolved">{item.resolved === "approved" ? "Approved" : "Declined"}</div>
                      ) : (
                        <div className="gb-btns">
                          <button className="gb-primary" onClick={() => decide(item, true)} disabled={busy}>
                            Approve
                          </button>
                          <button className="gb-secondary" onClick={() => decide(item, false)} disabled={busy}>
                            Decline
                          </button>
                          {item.name === "deploy" && item.project && (
                            <button
                              className="gb-ghost"
                              onClick={() => {
                                setLastProject(item.project as string);
                                setPreviewOpen(true);
                              }}
                            >
                              Preview first
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                return (
                  <div key={item.id} className={`gb-note${item.tone === "error" ? " error" : ""}`}>
                    {item.text}
                  </div>
                );
              })}

              {busy && (
                <div className="gb-status" role="status" aria-live="polite">
                  <GysmMark size={22} working />
                  <span className="gb-shimmer">{activity || "Thinking…"}</span>
                </div>
              )}

              {!busy && suggestions.length > 0 && (
                <>
                  <div className="gb-sug-label">Suggested next steps. Nothing runs until you pick one.</div>
                  <div className="gb-sug">
                    {suggestions.map((sg) => (
                      <button key={sg.title} className="gb-chip" onClick={() => submit(sg.prompt)} title={sg.prompt}>
                        {sg.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
          <div className="gb-dock">
            {folderError && <div className="gb-note error" style={{ margin: "0 auto 6px", maxWidth: 720 }}>{folderError}</div>}
            {composer}
            <div className="gb-foot">Commands cost 5 credits, deploys 25, lookups 1. GYSM can make mistakes, so check what it builds.</div>
          </div>
        </>
      )}
      </div>
      {previewOpen && lastProject && (
        <PreviewPanel
          project={lastProject}
          refreshKey={previewKey}
          canDeploy={!busy && !items.some((i) => i.kind === "proposal" && i.name === "deploy" && !i.resolved)}
          onDeploy={() => submit(`Deploy ${lastProject} now`)}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
