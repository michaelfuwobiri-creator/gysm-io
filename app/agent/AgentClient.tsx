"use client";

import { PLAN_WINDOW_LIMIT_CREDITS, UNLIMITED_BALANCE } from "@/lib/credits-constants";
import { useCallback, useEffect, useRef, useState } from "react";
import GysmMark from "./GysmMark";
import PreviewPanel from "./PreviewPanel";
import Markdown from "./Markdown";
import ConnectCard from "./ConnectCard";
import { AUTONOMY_SCOPES, SCOPE_LABEL, type AutonomyScope } from "@/lib/agentAutonomy";
import { archiveChat, parseChats, removeChat, serializeChats, type SavedChat } from "@/lib/agentChats";
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
  | { id: string; kind: "note"; text: string; tone?: "error" | "muted" }
  /** The agent asks to work on its own; the user picks what it may do. */
  | { id: string; kind: "autonomy"; goal: string; scopes: AutonomyScope[]; maxSteps: number; resolved?: "allowed" | "refused" }
  /** Connect a Supabase database (the user approves on Supabase themselves). */
  | { id: string; kind: "connect"; project: string; projectId: string; stage: "connect" | "pick" | "done" }
  /** A file the agent made for the user. `data` (base64) is kept in memory only, never saved. */
  | { id: string; kind: "file"; name: string; mime: string; data?: string };

type Saved = { items: Item[]; messages: unknown[] };
type Grant = { scopes: AutonomyScope[]; maxSteps: number; used: number };

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
  update_plan: "Plan",
  ask_user: "Question",
  generate_image: "Image",
  read_pdf: "Read PDF",
  send_file: "Send file",
  remember: "Memory",
  forget: "Memory",
  local_list: "Your folder",
  local_read: "Read (your computer)",
  local_write: "Write (your computer)",
  local_edit: "Edit (your computer)",
};

type ClientCall = { toolCallId: string; name: string; args: any; summary: string; write: boolean };
type ClientResult = { toolCallId: string; ok: boolean; output: string; declined?: boolean };

const MAX_IMAGE_SIDE = 1400;

async function downloadFile(name: string, mime: string, base64: string) {
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // iPhone and iPad (including the GYSM app) can't save a blob link, so open the share sheet instead.
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && typeof File !== "undefined" && typeof navigator.canShare === "function") {
      const file = new File([bytes], name, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name }).catch(() => {});
        return;
      }
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    /* the browser refused the download */
  }
}

function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("That file couldn't be read."));
    r.readAsDataURL(blob);
  });
}

/** Reads a chosen file as base64. Large photos are shrunk first so the upload stays small. */
async function readAttachment(file: File): Promise<{ name: string; mime: string; data: string }> {
  if (file.type.startsWith("image/") && file.size > 600_000 && file.type !== "image/gif") {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
      if (blob) return { name: file.name.replace(/\.[^.]+$/, "") + ".jpg", mime: "image/jpeg", data: await fileToBase64(blob) };
    } catch {
      /* fall through and send the original */
    }
  }
  if (file.size > 2_400_000) throw new Error(`${file.name} is too large (limit about 2.4 MB).`);
  return { name: file.name, mime: file.type || "application/octet-stream", data: await fileToBase64(file) };
}

export default function AgentClient({
  initialCredits,
  onPlan = false,
  userKey,
  initialPrompt = "",
  openBuild = null,
}: {
  initialCredits: number;
  onPlan?: boolean;
  userKey: string;
  initialPrompt?: string;
  openBuild?: { project?: string; template?: string } | null;
}) {
  const storageKey = `gysm-agent:${userKey}`;
  const [items, setItems] = useState<Item[]>([]);
  const [messages, setMessages] = useState<unknown[]>([]);
  const [text, setText] = useState(initialPrompt);
  const [busy, setBusy] = useState(false);
  // Clickable next steps from the agent; cleared as soon as anything new is sent.
  const [suggestions, setSuggestions] = useState<{ title: string; prompt: string }[]>([]);
  // The agent's live checklist for a bigger job (update_plan). Not saved.
  // Older conversations the user can bring back (kept in this browser).
  const [chats, setChats] = useState<SavedChat[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const chatIdRef = useRef(`chat-${Date.now().toString(36)}`);
  const historyKey = `gysm-agent-chats:${userKey}`;
  // Voice dictation (Web Speech API), shown only where the browser has it.
  const [micSupported, setMicSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);
  // Files attached to the message being written (sent once, then cleared).
  const [attached, setAttached] = useState<{ name: string; mime: string; data: string }[]>([]);
  const [attachError, setAttachError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // What the agent remembers about the user (remember/forget tools); shown in a small panel.
  const [memOpen, setMemOpen] = useState(false);
  const [memories, setMemories] = useState<{ id: number; text: string }[]>([]);
  // A multiple-choice question from the agent (ask_user); the pick is sent as the next message.
  const [question, setQuestion] = useState<{ question: string; options: string[] } | null>(null);
  const [plan, setPlan] = useState<{ title: string; status: "pending" | "doing" | "done" }[]>([]);
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
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  // Autonomous mode: only ever set by the user pressing Allow on a card. In memory
  // only, so a reload or a new chat ends it.
  const [grant, setGrant] = useState<Grant | null>(null);
  const grantRef = useRef<Grant | null>(null);
  const pauseRef = useRef(false);
  const updateGrant = (g: Grant | null) => {
    grantRef.current = g;
    setGrant(g);
  };

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
      setChats(parseChats(localStorage.getItem(historyKey)));
    } catch {
      /* storage unavailable */
    }
  }, [historyKey]);

  const saveChats = (next: SavedChat[]) => {
    setChats(next);
    try {
      localStorage.setItem(historyKey, serializeChats(next));
    } catch {
      /* storage full or unavailable */
    }
  };

  // Opening a saved build or template (dashboard, templates, BuildGuild):
  // copy it into the workspace, show it in Preview, and prefill the box.
  const openedRef = useRef(false);
  useEffect(() => {
    if (!openBuild || openedRef.current) return;
    openedRef.current = true;
    try {
      window.history.replaceState(null, "", "/agent");
    } catch {
      /* ignore */
    }
    const noteId = `open-${Date.now()}`;
    setItems((cur) => [...cur, { id: noteId, kind: "note", text: "Opening your build in the workspace…", tone: "muted" }]);
    (async () => {
      try {
        const res = await fetch("/api/agent/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(openBuild),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.folder) throw new Error(j?.error || "Couldn't open that build.");
        setItems((cur) => cur.map((i) => (i.id === noteId ? { ...i, text: `Opened it in your workspace as ${j.folder}. Tell me what to change, or publish it.` } : i)));
        setLastProject(j.folder);
        setPreviewKey((k) => k + 1);
        setPreviewOpen(true);
        setText((t) => t || `In the ${j.folder} folder: `);
      } catch (e: any) {
        setItems((cur) => cur.map((i) => (i.id === noteId ? { ...i, text: String(e?.message || "Couldn't open that build."), tone: "error" } : i)));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    try {
      const saved: Saved = { items: items.slice(-MAX_SAVED_ITEMS).map((i) => (i.kind === "file" ? { ...i, data: undefined } : i)), messages };
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
    async (body: { text?: string; attachments?: { name: string; mime: string; data: string }[]; decision?: { toolCallId: string; approve: boolean; secret?: string }; clientResult?: ClientResult }) => {
      // A fresh message or decision starts a new run; a continuation of a run
      // the user already stopped (a local tool result) must not go on.
      if (body.clientResult && stoppedRef.current) {
        setBusy(false);
        setActivity("");
        return;
      }
      if (!body.clientResult) stoppedRef.current = false;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      setSuggestions([]);
      setQuestion(null);
      if (body.text) setPlan([]);
      let clientCall: ClientCall | null = null;
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({ ...body, messages: messagesRef.current, localFolder: folderRef.current ? folderRef.current.name : undefined, autonomy: grantRef.current && grantRef.current.used < grantRef.current.maxSteps ? grantRef.current : undefined }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          const msg = j?.code === "NO_CREDITS" ? "Subscribe to GYSM (€20/month) to keep building." : j?.error || "Something went wrong.";
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
          } else if (e.type === "plan") setPlan(Array.isArray(e.steps) ? e.steps : []);
          else if (e.type === "question") setQuestion({ question: String(e.question ?? ""), options: Array.isArray(e.options) ? e.options.map(String) : [] });
          else if (e.type === "file") push({ id: uid(), kind: "file", name: String(e.name), mime: String(e.mime), data: String(e.data) });
          else if (e.type === "autonomy_request")
            push({ id: uid(), kind: "autonomy", goal: String(e.goal ?? ""), scopes: (Array.isArray(e.scopes) ? e.scopes : []).filter((x: string) => x !== "browser"), maxSteps: Number(e.maxSteps) || 40 });
          else if (e.type === "autonomy") {
            const g = grantRef.current;
            if (g) {
              updateGrant(e.exhausted ? null : { ...g, used: Math.max(g.used, Number(e.used) || 0) });
              if (e.pause) pauseRef.current = true;
            }
          } else if (e.type === "connect") push({ id: uid(), kind: "connect", project: String(e.project ?? ""), projectId: String(e.projectId ?? ""), stage: "connect" });
          else if (e.type === "suggestions") setSuggestions(Array.isArray(e.suggestions) ? e.suggestions : []);
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
        if (clientCall && !stoppedRef.current) await runClientCallRef.current(clientCall);
        // A long autonomous job continues in a fresh request.
        if (pauseRef.current && !stoppedRef.current && grantRef.current) {
          pauseRef.current = false;
          await sendRef.current({ text: "Continue where you left off." });
        }
      } catch {
        if (ctrl.signal.aborted || stoppedRef.current) {
          // Pressed Stop: the history the browser holds is still the last
          // complete one, so the next message continues cleanly.
          setItems((prev) => prev.map((i) => (i.kind === "tool" && i.running ? { ...i, running: false, ok: false, output: "Stopped." } : i)));
          push({ id: uid(), kind: "note", text: "Stopped.", tone: "muted" });
        } else {
          push({ id: uid(), kind: "note", text: "Connection lost. Please try again.", tone: "error" });
        }
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

  const stop = useCallback(() => {
    stoppedRef.current = true;
    pauseRef.current = false;
    grantRef.current = null;
    setGrant(null);
    abortRef.current?.abort();
  }, []);

  // Esc stops the running prompt.
  useEffect(() => {
    if (!busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, stop]);

  const toggleMemory = async () => {
    const next = !memOpen;
    setMemOpen(next);
    if (!next) return;
    try {
      const r = await fetch("/api/agent/memory");
      const j = await r.json();
      setMemories(Array.isArray(j?.memories) ? j.memories : []);
    } catch {
      setMemories([]);
    }
  };
  const forgetMemory = async (id: number) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    try {
      await fetch(`/api/agent/memory?id=${id}`, { method: "DELETE" });
    } catch {
      /* the list refreshes next time it is opened */
    }
  };
  const forgetAllMemories = async () => {
    setMemories([]);
    try {
      await fetch("/api/agent/memory?all=1", { method: "DELETE" });
    } catch {
      /* the list refreshes next time it is opened */
    }
  };

  useEffect(() => {
    const w = window as any;
    setMicSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      try {
        recogRef.current?.abort();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  const toggleMic = () => {
    if (listening) {
      try {
        recogRef.current?.stop();
      } catch {
        /* already stopped */
      }
      return;
    }
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (ev: any) => {
      let heard = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) heard += ev.results[i][0].transcript;
      heard = heard.trim();
      if (heard) setText((t) => (t && !/\s$/.test(t) ? `${t} ${heard}` : `${t}${heard}`));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setAttachError("");
    const next = [...attached];
    for (const file of Array.from(list)) {
      if (next.length >= 4) {
        setAttachError("You can attach up to 4 files at a time.");
        break;
      }
      try {
        next.push(await readAttachment(file));
      } catch (e: any) {
        setAttachError(e?.message || "That file couldn't be read.");
      }
    }
    setAttached(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = (t: string) => {
    const v = t.trim();
    if ((!v && attached.length === 0) || busy) return;
    const files = attached;
    setText("");
    setAttached([]);
    setAttachError("");
    const shown = files.length ? `${v}${v ? "\n\n" : ""}Attached: ${files.map((f) => f.name).join(", ")}` : v;
    push({ id: uid(), kind: "user", text: shown });
    void send({ text: v, ...(files.length ? { attachments: files } : {}) });
  };

  const answerAutonomy = (item: Extract<Item, { kind: "autonomy" }>, allow: boolean, scopes: AutonomyScope[], maxSteps: number) => {
    if (busy) return;
    setItems((prev) => prev.map((i) => (i.id === item.id && i.kind === "autonomy" ? { ...i, resolved: allow ? "allowed" : "refused" } : i)));
    if (allow) {
      updateGrant({ scopes, maxSteps, used: 0 });
      void send({ text: "Autonomous mode is on. Go ahead." });
    } else {
      void send({ text: "No, ask me before each step." });
    }
  };

  const setConnectStage = (id: string, stage: "connect" | "pick" | "done") => setItems((prev) => prev.map((i) => (i.id === id && i.kind === "connect" ? { ...i, stage } : i)));

  // Back from Supabase: show the project picker (or what went wrong).
  const backendRef = useRef(false);
  useEffect(() => {
    if (backendRef.current) return;
    backendRef.current = true;
    try {
      const q = new URLSearchParams(window.location.search);
      const pid = q.get("projectId");
      const err = q.get("backendError");
      if (!q.get("backendPick") && !err) return;
      window.history.replaceState(null, "", "/agent");
      if (err) push({ id: uid(), kind: "note", text: err, tone: "error" });
      else if (pid) push({ id: uid(), kind: "connect", project: "", projectId: pid, stage: "pick" });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decideLocal = async (item: Extract<Item, { kind: "proposal" }>, approve: boolean) => {
    const call = pendingLocalRef.current[item.callId];
    delete pendingLocalRef.current[item.callId];
    setItems((prev) => prev.map((i) => (i.id === item.id && i.kind === "proposal" ? { ...i, resolved: approve ? "approved" : "declined" } : i)));
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
    setItems((prev) => prev.map((i) => (i.id === item.id && i.kind === "proposal" ? { ...i, resolved: approve ? "approved" : "declined" } : i)));
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
    // Keep the conversation we are leaving so it can be restored later.
    saveChats(archiveChat(chats, chatIdRef.current, items, messages, Date.now()));
    chatIdRef.current = `chat-${Date.now().toString(36)}`;
    updateGrant(null);
    setItems([]);
    setMessages([]);
    setEditing(null);
    setPreviewOpen(false);
    setLastProject(null);
  };

  const restoreChat = (id: string) => {
    if (busy) return;
    const target = chats.find((c) => c.id === id);
    if (!target) return;
    // Park the current conversation, then bring the chosen one back.
    const parked = archiveChat(chats, chatIdRef.current, items, messages, Date.now());
    saveChats(removeChat(parked, id));
    chatIdRef.current = target.id;
    setItems(target.items as Item[]);
    setMessages(target.messages);
    messagesRef.current = target.messages;
    setSuggestions([]);
    setQuestion(null);
    setPlan([]);
    setEditing(null);
    setPreviewOpen(false);
    setLastProject(null);
    setHistoryOpen(false);
  };

  const canSend = !busy && (!!text.trim() || attached.length > 0);
  const fillStarter = (prompt: string) => {
    setText(prompt);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const composer = (
    <div className="gb-composer-wrap">
      {memOpen && (
        <div className="gb-mem" role="region" aria-label="Memory">
          <div className="gb-mem-head">
            <b>What GYSM remembers</b>
            {memories.length > 0 && (
              <button type="button" className="gb-ghost" onClick={forgetAllMemories}>
                Forget all
              </button>
            )}
          </div>
          {memories.length === 0 ? (
            <div className="gb-mem-empty">Nothing yet. Tell GYSM about your brand, style or audience and it will keep it for next time.</div>
          ) : (
            <ul>
              {memories.map((m) => (
                <li key={m.id}>
                  <span>{m.text}</span>
                  <button type="button" className="gb-ghost" onClick={() => forgetMemory(m.id)} aria-label={`Forget: ${m.text}`}>
                    Forget
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {grant && (
        <div className="gb-auto-bar" role="status">
          <span>
            Working on its own · {grant.used}/{grant.maxSteps} steps · {grant.scopes.map((s) => (s === "publish" ? "publish" : "database")).join(" + ")}
          </span>
          <button type="button" className="gb-ghost" onClick={busy ? stop : () => updateGrant(null)} title={busy ? "Stop now and turn autonomous mode off" : "Turn autonomous mode off"}>
            {busy ? "Stop" : "Pause"}
          </button>
        </div>
      )}
      <form
        className="gb-composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        {(attached.length > 0 || attachError) && (
          <div className="gb-attached">
            {attached.map((f, i) => (
              <span key={`${f.name}-${i}`} className="gb-tag">
                {f.name}
                <button type="button" className="gb-ghost" aria-label={`Remove ${f.name}`} onClick={() => setAttached((prev) => prev.filter((_, j) => j !== i))}>
                  ×
                </button>
              </span>
            ))}
            {attachError && <span className="gb-attach-err">{attachError}</span>}
          </div>
        )}
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
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept="image/*,.pdf,.txt,.md,.csv,.json,.html,.css,.js,.svg"
              onChange={(e) => void addFiles(e.target.files)}
            />
            <button type="button" className="gb-ghost" onClick={() => fileInputRef.current?.click()} disabled={busy} title="Attach images or files (logo, photos, a brief)">
              + File
            </button>
            {micSupported && (
              <button
                type="button"
                className={`gb-ghost gb-mic${listening ? " on" : ""}`}
                onClick={toggleMic}
                disabled={busy}
                aria-pressed={listening}
                title={listening ? "Stop dictating" : "Dictate with your voice"}
              >
                {listening ? "Listening…" : "Voice"}
              </button>
            )}
            <button type="button" className="gb-ghost" onClick={toggleMemory} aria-expanded={memOpen} title="What GYSM remembers about you between chats">
              Memory
            </button>
          </div>
          <button
            type={busy ? "button" : "submit"}
            className={`gb-send${busy ? " stop" : ""}`}
            disabled={!busy && !canSend}
            onClick={busy ? stop : undefined}
            aria-label={busy ? "Stop" : "Send"}
            title={busy ? "Stop (Esc)" : "Send"}
          >
            {busy ? (
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <rect x="5.5" y="5.5" width="9" height="9" rx="1.8" />
              </svg>
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
            <a className="gb-pill" href="/pricing" title="See the GYSM plan">
              Subscribe
            </a>
          )}
          <button className="gb-ghost" onClick={() => setHistoryOpen((o) => !o)} aria-expanded={historyOpen} title="Bring back an earlier chat">
            History{chats.length ? ` (${chats.length})` : ""}
          </button>
          <button className="gb-ghost" onClick={reset} disabled={busy}>
            New chat
          </button>
        </div>
      </header>

      {historyOpen && (
        <div className="gb-history" role="region" aria-label="Earlier chats">
          <div className="gb-history-head">
            <b>Earlier chats</b>
            <button type="button" className="gb-ghost" onClick={() => setHistoryOpen(false)}>
              Close
            </button>
          </div>
          {chats.length === 0 ? (
            <div className="gb-mem-empty">No earlier chats yet. When you start a new chat, the one you leave is saved here.</div>
          ) : (
            <ul>
              {chats.map((c) => (
                <li key={c.id}>
                  <span className="gb-history-title">
                    {c.title}
                    <small>{new Date(c.savedAt).toLocaleString()}</small>
                  </span>
                  <span className="gb-history-btns">
                    <button type="button" className="gb-secondary" onClick={() => restoreChat(c.id)} disabled={busy}>
                      Restore
                    </button>
                    <button type="button" className="gb-ghost" onClick={() => saveChats(removeChat(chats, c.id))} aria-label={`Delete chat: ${c.title}`}>
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
                        <div className="gb-ai-text"><Markdown text={item.text} /></div>
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
                              title="Ask again and get a new answer."
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
                if (item.kind === "file")
                  return (
                    <div key={item.id} className="gb-file">
                      <span className="gb-file-name">{item.name}</span>
                      {item.data ? (
                        <button type="button" className="gb-secondary" onClick={() => void downloadFile(item.name, item.mime, item.data as string)}>
                          Download
                        </button>
                      ) : (
                        <span className="gb-file-gone">No longer available. Ask the agent to send it again.</span>
                      )}
                    </div>
                  );
                if (item.kind === "autonomy")
                  return <AutonomyCard key={item.id} item={item} busy={busy} onAnswer={(allow, scopes, steps) => answerAutonomy(item, allow, scopes, steps)} />;
                if (item.kind === "connect")
                  return (
                    <ConnectCard
                      key={item.id}
                      projectId={item.projectId}
                      project={item.project}
                      stage={item.stage}
                      onStage={(st) => setConnectStage(item.id, st)}
                      onLinked={() => void send({ text: "My Supabase database is connected. Check it with database_status and continue." })}
                    />
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

              {plan.length > 0 && (
                <div className="gb-plan" role="list" aria-label="Plan">
                  {plan.map((st, i) => (
                    <div key={`${i}-${st.title}`} role="listitem" className={`gb-plan-step ${st.status}`}>
                      <span className="gb-plan-dot" aria-hidden="true">{st.status === "done" ? "✓" : st.status === "doing" ? "•" : ""}</span>
                      <span>{st.title}</span>
                    </div>
                  ))}
                </div>
              )}

              {busy && (
                <div className="gb-status" role="status" aria-live="polite">
                  <GysmMark size={22} working />
                  <span className="gb-shimmer">{activity || "Thinking…"}</span>
                  <button type="button" className="gb-stop-btn" onClick={stop} title="Stop now (Esc)">
                    Stop
                  </button>
                </div>
              )}

              {!busy && question && (
                <div className="gb-ask" role="group" aria-label="Question from the agent">
                  <div className="gb-ask-q">{question.question}</div>
                  <div className="gb-sug">
                    {question.options.map((opt) => (
                      <button key={opt} className="gb-chip" onClick={() => submit(opt)}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  <div className="gb-sug-label">Or type your own answer below.</div>
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
            <div className="gb-foot">GYSM can make mistakes, so check what it builds.</div>
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


function AutonomyCard({
  item,
  busy,
  onAnswer,
}: {
  item: Extract<Item, { kind: "autonomy" }>;
  busy: boolean;
  onAnswer: (allow: boolean, scopes: AutonomyScope[], maxSteps: number) => void;
}) {
  const offered = (item.scopes.length ? item.scopes : AUTONOMY_SCOPES.filter((x) => x !== "browser")) as AutonomyScope[];
  const [picked, setPicked] = useState<AutonomyScope[]>(offered);
  const [steps, setSteps] = useState(String([10, 25, 50, 100].find((n) => n >= item.maxSteps) ?? 100));
  return (
    <div className="gb-approve" role="group" aria-label="Permission to work on its own">
      <div className="gb-eyebrow">Needs your permission</div>
      <h3>Let GYSM work on its own?</h3>
      {item.goal && <p className="gb-card-note">{item.goal}</p>}
      <div className="gb-card-note">It will only do what you tick, and it stops for anything involving secrets, deleting, or risky commands.</div>
      {offered.map((sc) => (
        <label key={sc} className="gb-check">
          <input
            type="checkbox"
            disabled={!!item.resolved}
            checked={picked.includes(sc)}
            onChange={(e) => setPicked((p) => (e.target.checked ? [...p, sc] : p.filter((x) => x !== sc)))}
          />
          <span>{SCOPE_LABEL[sc]}</span>
        </label>
      ))}
      {item.resolved ? (
        <div className="gb-resolved">{item.resolved === "allowed" ? "Allowed" : "Not now"}</div>
      ) : (
        <>
          <label className="gb-check">
            <span>Step limit</span>
            <select value={steps} onChange={(e) => setSteps(e.target.value)}>
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  Up to {n} steps
                </option>
              ))}
            </select>
          </label>
          <div className="gb-btns">
            <button className="gb-primary" disabled={busy || picked.length === 0} onClick={() => onAnswer(true, picked, Number(steps))}>
              Allow
            </button>
            <button className="gb-secondary" disabled={busy} onClick={() => onAnswer(false, [], 0)}>
              Not now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
