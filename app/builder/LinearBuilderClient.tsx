"use client";

/**
 * GYSM Linear Builder -- Claude Artifacts x Linear.app style conversational
 * builder. This IS the live /builder route (see app/builder/page.tsx).
 *
 * Chat generation, model tier, iterative edits, and BuildGuild publish all
 * call the same real endpoints the previous BuilderClient.tsx used
 * (/api/generate, /api/projects/[id]/publish) -- see runRealGeneration /
 * publishToBuildGuild below. Chat history, search, media attachments,
 * the schedule picker, and the program runner are net-new UI surfaces
 * with no existing backend, so those still persist to localStorage and
 * (for schedule/program specifically) still simulate their execution --
 * disclosed clearly in the handoff notes rather than pretended otherwise.
 *
 * Everything here is intentionally dependency-free (no framer-motion /
 * zustand / fuse.js / monaco / react-resizable-panels -- see the handoff
 * notes for why) so it compiles against the app's existing toolchain with
 * zero new npm installs.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";

/* --------------------------------------------------------------------- */
/* Types                                                                  */
/* --------------------------------------------------------------------- */

type Role = "user" | "assistant" | "system";

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  mediaIds?: string[];
  streaming?: boolean;
}

interface CodeFile {
  name: string;
  language: string;
  content: string;
}

interface Artifact {
  id: string;
  chatId: string;
  projectId: string | null; // real gysm-io project id once generated server-side
  title: string;
  html: string;
  files: CodeFile[];
  url: string;
  progress: number; // 0-100
  deployed: boolean;
  published: boolean; // published to BuildGuild
  suggestions: string[];
}

interface MediaItem {
  id: string;
  chatId: string;
  url: string;
  type: "image" | "video" | "figma" | "github";
  name: string;
}

interface ScheduleItem {
  id: string;
  chatId: string;
  chatTitle: string;
  runAt: number;
  label: string;
  status: "queued" | "done";
}

interface ProgramStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done";
}

interface ProgramLog {
  id: string;
  time: string;
  text: string;
}

interface Program {
  id: string;
  chatId: string;
  steps: ProgramStep[];
  logs: ProgramLog[];
  running: boolean;
}

interface Chat {
  id: string;
  title: string;
  preview: string;
  timestamp: number;
  messages: ChatMessage[];
  artifactId?: string;
  pinned?: boolean;
}

interface StoreState {
  chats: Chat[];
  artifacts: Record<string, Artifact>;
  media: MediaItem[];
  schedules: ScheduleItem[];
  programs: Record<string, Program>;
  activeChatId: string | null;
}

/* --------------------------------------------------------------------- */
/* Tiny dependency-free store (localStorage-backed, Zustand-shaped)       */
/* --------------------------------------------------------------------- */

const STORAGE_KEY = "gysm_linear_builder_v1";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function seedState(): StoreState {
  // No canned demo chats -- a fresh, empty chat is created for real
  // visitors; resuming a saved project or a deep-linked prompt is handled
  // by LinearBuilderApp's one-time hydration effect below, reading
  // initialHtml/initialProjectId/initialPrompt from app/builder/page.tsx.
  const chat: Chat = {
    id: uid("chat"),
    title: "New Build",
    preview: "Just started",
    timestamp: Date.now(),
    messages: [],
  };
  return {
    chats: [chat],
    artifacts: {},
    media: [],
    schedules: [],
    programs: {},
    activeChatId: chat.id,
  };
}

function loadInitial(): StoreState {
  if (typeof window === "undefined") return seedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as StoreState;
    if (!parsed.chats || parsed.chats.length === 0) return seedState();
    return parsed;
  } catch {
    return seedState();
  }
}

function createStore() {
  let state: StoreState = loadInitial();
  const listeners = new Set<() => void>();

  function persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full / private mode -- fine, in-memory state still works */
    }
  }

  return {
    get: () => state,
    set: (updater: (s: StoreState) => StoreState) => {
      state = updater(state);
      persist();
      listeners.forEach((l) => l());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const store = typeof window !== "undefined" ? createStore() : null;
// Server-side fallback so this module can still be imported during SSR;
// the real store is created lazily on the client above.
const serverSnapshot = seedState();

function useLinearStore(): [StoreState, (updater: (s: StoreState) => StoreState) => void] {
  const subscribe = useCallback((listener: () => void) => {
    if (!store) return () => {};
    return store.subscribe(listener);
  }, []);
  const getSnapshot = useCallback(() => (store ? store.get() : serverSnapshot), []);
  const getServerSnapshot = useCallback(() => serverSnapshot, []);
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = useCallback((updater: (s: StoreState) => StoreState) => {
    store?.set(updater);
  }, []);
  return [state, set];
}

/* --------------------------------------------------------------------- */
/* Utilities                                                              */
/* --------------------------------------------------------------------- */

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function dayBucket(ts: number): "Today" | "Yesterday" | "Last 7 Days" | "Older" {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.floor((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Last 7 Days";
  return "Older";
}

/** Lightweight fuzzy match: case-insensitive substring with a bonus for
 *  matches at a word boundary. Good enough for instant client-side search
 *  over a few hundred local records -- not a real Fuse.js port. */
function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  const idx = t.indexOf(q);
  if (idx === -1) return -1;
  const wordStart = idx === 0 || /\s/.test(t[idx - 1]);
  return 100 - idx * (wordStart ? 1 : 2);
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-[#FF0080] bg-[#FF0080]/10 rounded">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

const SKILLS = [
  { cmd: "/build", label: "Build", desc: "Generate or extend the app" },
  { cmd: "/schedule", label: "Schedule", desc: "Queue this build for later" },
  { cmd: "/search", label: "Search", desc: "Search chats, artifacts, media" },
  { cmd: "/media", label: "Media", desc: "Attach images, video, Figma, GitHub" },
  { cmd: "/program", label: "Program", desc: "Build a multi-step autonomous run" },
  { cmd: "/deploy", label: "Deploy", desc: "Publish the current artifact" },
  { cmd: "/stripe", label: "Stripe", desc: "Wire up a checkout for this build" },
];

const PROGRAM_ACTION_TYPES = [
  "Find leads on Twitter",
  "Build demo",
  "Send email",
  "Collect payment",
  "Wait",
  "Custom step",
];

/* --------------------------------------------------------------------- */
/* Real AI backend -- same /api/generate + /api/projects/[id]/publish     */
/* contract the previous BuilderClient.tsx used                          */
/* --------------------------------------------------------------------- */

const STAGE_LABELS: Record<string, string> = {
  structure: "Reading your prompt and planning the build...",
  structure_done: "Structure, content, and interactivity written.",
  design: "Applying a visual design pass...",
  design_done: "Design polish complete.",
  saving: "Saving your build...",
};

type ModelTier = "fast" | "best" | "claude";

const TIER_LABELS: Record<ModelTier, string> = {
  fast: "GYSM Terra",
  best: "GYSM Sol",
  claude: "Claude Sonnet 5",
};

function titleFromPrompt(prompt: string): string {
  const words = prompt
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 5).join(" ") || "Untitled build";
}

interface GenerateDoneEvent {
  type: "done";
  html: string;
  projectId?: string;
  suggestions?: string[];
}
interface GenerateStageEvent {
  type: "stage";
  stage: string;
}
interface GenerateErrorEvent {
  type: "error";
  error?: string;
  code?: string;
}
type GenerateEvent = GenerateDoneEvent | GenerateStageEvent | GenerateErrorEvent;

/** Calls the real /api/generate endpoint (the same one the production
 *  builder uses) and streams NDJSON stage events back through callbacks,
 *  so the caller can show live progress instead of one opaque spinner.
 *  Throws on network/parse failure; auth (401) and no-credits (402) are
 *  reported via the onAuthRequired / onNoCredits callbacks instead of a
 *  throw, since those are real HTTP statuses the caller should redirect
 *  on rather than display as an error bubble. */
async function runRealGeneration(opts: {
  prompt: string;
  previousHtml?: string | null;
  projectId?: string | null;
  image?: string;
  tier: ModelTier;
  onStage: (label: string) => void;
  onAuthRequired: () => void;
  onNoCredits: () => void;
}): Promise<GenerateDoneEvent> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: opts.prompt,
      previousHtml: opts.previousHtml || undefined,
      projectId: opts.projectId || undefined,
      image: opts.image,
      tier: opts.tier,
    }),
  });

  if (res.status === 401) {
    opts.onAuthRequired();
    throw new Error("__redirecting__");
  }
  if (res.status === 402) {
    opts.onNoCredits();
    throw new Error("__redirecting__");
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body.error || `Something went wrong (${res.status}).`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: GenerateDoneEvent | null = null;

  while (true) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const evt = JSON.parse(line) as GenerateEvent;
      if (evt.type === "stage") {
        opts.onStage(STAGE_LABELS[evt.stage] ?? evt.stage);
      } else if (evt.type === "error") {
        if (evt.code === "NO_CREDITS") {
          opts.onNoCredits();
          throw new Error("__redirecting__");
        }
        throw new Error(evt.error || "Something went wrong.");
      } else if (evt.type === "done") {
        done = evt;
      }
    }
  }

  if (!done) throw new Error("No preview came back. Try again.");
  return done;
}

/** Publishes a real project to BuildGuild via the same endpoint the
 *  production builder uses. */
async function publishToBuildGuild(projectId: string, title: string, tagline: string) {
  const res = await fetch(`/api/projects/${projectId}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, tagline }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Failed to publish.");
  return data as { ok: true; id: string };
}

/* --------------------------------------------------------------------- */
/* Tiny regex-based syntax highlighter (Monaco stand-in)                 */
/* --------------------------------------------------------------------- */

function highlightCode(code: string): React.ReactNode[] {
  const rules: { re: RegExp; cls: string }[] = [
    { re: /(\/\/.*$)/gm, cls: "text-white/35 italic" },
    { re: /(".*?"|'.*?'|`[^`]*`)/g, cls: "text-[#f6b8dd]" },
    {
      re: /\b(import|export|default|from|function|return|const|let|var|async|await|if|else|new|class|extends|interface|type|useState|useEffect)\b/g,
      cls: "text-[#FF0080]",
    },
    { re: /\b([A-Z][A-Za-z0-9_]*)\b/g, cls: "text-[#9fd6ff]" },
  ];
  // Tokenize by running each rule against remaining plain segments only,
  // good enough for a code-preview pane (not a real tokenizer/AST).
  type Seg = { text: string; cls?: string };
  let segs: Seg[] = [{ text: code }];
  for (const rule of rules) {
    const next: Seg[] = [];
    for (const seg of segs) {
      if (seg.cls) {
        next.push(seg);
        continue;
      }
      let last = 0;
      const re = new RegExp(rule.re);
      let m: RegExpExecArray | null;
      while ((m = re.exec(seg.text))) {
        if (m.index > last) next.push({ text: seg.text.slice(last, m.index) });
        next.push({ text: m[0], cls: rule.cls });
        last = m.index + m[0].length;
        if (!re.global) break;
      }
      if (last < seg.text.length) next.push({ text: seg.text.slice(last) });
    }
    segs = next;
  }
  return segs.map((s, i) => (
    <span key={i} className={s.cls}>
      {s.text}
    </span>
  ));
}

/* --------------------------------------------------------------------- */
/* Presentational: inline code block with copy                           */
/* --------------------------------------------------------------------- */

function InlineCodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 mb-1 rounded-xl border border-white/10 bg-[#0f0f14] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
        <span className="text-[10px] uppercase tracking-wide text-white/40">{language}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(code).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="text-[11px] text-white/50 hover:text-white transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3 text-[12px] leading-relaxed overflow-x-auto font-mono text-white/80">
        <code>{highlightCode(code)}</code>
      </pre>
    </div>
  );
}

/** Splits assistant text on fenced ```lang code blocks so we can render
 *  plain paragraphs plus real InlineCodeBlocks, and turns a trailing
 *  "Built demo: gysm.io/demo/xxx" line into an artifact preview card. */
function renderAssistantContent(content: string, onOpenArtifact: () => void) {
  const parts = content.split(/```(\w*)\n([\s\S]*?)```/g);
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    const text = parts[i];
    const lang = parts[i + 1];
    const code = parts[i + 2];
    const demoMatch = text.match(/built demo:\s*(\S+)/i);
    const cleanText = demoMatch ? text.replace(demoMatch[0], "").trim() : text.trim();
    if (cleanText) {
      nodes.push(
        <p key={`t-${i}`} className="whitespace-pre-wrap leading-relaxed">
          {cleanText}
        </p>
      );
    }
    if (typeof code === "string") {
      nodes.push(<InlineCodeBlock key={`c-${i}`} language={lang || "tsx"} code={code} />);
    }
    if (demoMatch) {
      nodes.push(
        <button
          key={`a-${i}`}
          onClick={onOpenArtifact}
          className="mt-2 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:border-[#FF0080]/40 hover:bg-[#FF0080]/5 transition-colors"
        >
          <div className="h-10 w-10 shrink-0 rounded-lg bg-[#FF0080] flex items-center justify-center text-white text-[13px] font-bold">
            {"</>"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-white">{demoMatch[1]}</div>
            <div className="text-[11px] text-white/40">Live preview ready</div>
          </div>
          <span className="text-[#FF0080] text-[12px] font-medium shrink-0">View Artifact &rarr;</span>
        </button>
      );
    }
  }
  return nodes;
}

/* --------------------------------------------------------------------- */
/* Presentational: message bubble                                        */
/* --------------------------------------------------------------------- */

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[#FF0080] animate-pulse"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  onOpenArtifact,
  media,
}: {
  message: ChatMessage;
  onOpenArtifact: () => void;
  media: MediaItem[];
}) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-white/[0.04] border border-white/10 px-3 py-1 text-[11px] text-white/50">
          {message.content}
        </span>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%]">
          {message.mediaIds && message.mediaIds.length > 0 && (
            <div className="mb-1.5 flex justify-end gap-1.5">
              {message.mediaIds.map((id) => {
                const m = media.find((mm) => mm.id === id);
                if (!m) return null;
                return m.type === "image" ? (
                  <img key={id} src={m.url} alt={m.name} className="h-14 w-14 rounded-lg object-cover border border-white/10" />
                ) : (
                  <span key={id} className="h-14 flex items-center rounded-lg border border-white/10 bg-white/5 px-2 text-[10px] text-white/60">
                    {m.name}
                  </span>
                );
              })}
            </div>
          )}
          <div className="rounded-[20px_20px_4px_20px] bg-white text-[#08080a] px-4 py-2.5 text-[14px] leading-relaxed">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-[#FF0080] flex items-center justify-center text-white text-[12px] font-bold">
        G
      </div>
      <div className="min-w-0 flex-1 text-[14px] text-white/90 space-y-1">
        {message.streaming ? (
          message.content ? (
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <TypingDots />
          )
        ) : (
          renderAssistantContent(message.content, onOpenArtifact)
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Sidebar                                                                */
/* --------------------------------------------------------------------- */

function Sidebar({
  chats,
  schedules,
  activeChatId,
  onSelectChat,
  onNewChat,
  onOpenSearch,
  onTogglePin,
  onDeleteChat,
  onRenameChat,
  mobileOpen,
  onCloseMobile,
  userName,
  userEmail,
  credits,
}: {
  chats: Chat[];
  schedules: ScheduleItem[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onOpenSearch: () => void;
  onTogglePin: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  /** Real signed-in identity (from Clerk via getUser(), see page.tsx) --
   *  this footer used to show hardcoded "Jordan Kim / jordan@studio.co"
   *  demo data left over from the initial mockup pass. */
  userName: string;
  userEmail: string | null;
  /** Real credit balance (see lib/credits.ts) -- replaces a fabricated
   *  "12/50 builds 24%" progress bar that wasn't wired to anything. */
  credits: number;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const sorted = useMemo(
    () => [...chats].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.timestamp - a.timestamp),
    [chats]
  );
  const groups: Record<string, Chat[]> = { Today: [], Yesterday: [], "Last 7 Days": [], Older: [] };
  for (const c of sorted) groups[dayBucket(c.timestamp)].push(c);

  const queuedSchedules = schedules.filter((s) => s.status === "queued");

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onCloseMobile} />
      )}
      <aside
        className={`fixed lg:static z-50 lg:z-auto top-0 left-0 h-full w-[300px] shrink-0 bg-[#0a0a0d] border-r border-white/8 flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/8 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-[#FF0080] flex items-center justify-center text-white text-[13px] font-bold">
              G
            </div>
            <span className="text-white font-bold text-[14px]">GYSM.IO</span>
            <span className="ml-auto rounded-full bg-[#FF0080]/15 border border-[#FF0080]/30 px-2 py-0.5 text-[10px] font-semibold text-[#FF0080]">
              PRO
            </span>
          </div>
          <button
            onClick={onNewChat}
            className="group w-full rounded-xl bg-[#FF0080] px-3 py-2.5 text-[13px] font-semibold text-white flex items-center justify-center gap-2 shadow-[0_0_0_rgba(255,0,128,0)] hover:shadow-[0_0_20px_rgba(255,0,128,0.35)] transition-shadow duration-300"
          >
            <span className="text-[16px] leading-none">+</span> New Build
          </button>
          <button
            onClick={onOpenSearch}
            className="w-full flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-[12px] text-white/40 hover:border-white/20 transition-colors"
          >
            <span>Search chats, artifacts...</span>
            <span className="ml-auto text-[10px] rounded border border-white/15 px-1.5 py-0.5 text-white/40">
              &#8984;K
            </span>
          </button>
        </div>

        {/* Scheduled builds */}
        {queuedSchedules.length > 0 && (
          <div className="px-4 py-3 border-b border-white/8">
            <div className="text-[10px] uppercase tracking-wide text-white/35 mb-2">Scheduled</div>
            <div className="space-y-1.5">
              {queuedSchedules.slice(0, 3).map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-[11px] text-white/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF0080] shrink-0" />
                  <span className="truncate">{s.chatTitle}</span>
                  <span className="ml-auto shrink-0 text-white/35">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {(["Today", "Yesterday", "Last 7 Days", "Older"] as const).map((bucket) =>
            groups[bucket].length ? (
              <div key={bucket}>
                <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wide text-white/35">{bucket}</div>
                <div className="space-y-0.5">
                  {groups[bucket].map((c) => {
                    const active = c.id === activeChatId;
                    const schedule = schedules.find((s) => s.chatId === c.id && s.status === "queued");
                    return (
                      <div
                        key={c.id}
                        onClick={() => onSelectChat(c.id)}
                        className={`group relative rounded-lg px-2.5 py-2 cursor-pointer border-l-2 transition-colors ${
                          active
                            ? "border-[#FF0080] bg-[#FF0080]/10"
                            : "border-transparent hover:bg-white/[0.04]"
                        }`}
                      >
                        {renamingId === c.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                onRenameChat(c.id, renameValue || c.title);
                                setRenamingId(null);
                              } else if (e.key === "Escape") {
                                setRenamingId(null);
                              }
                            }}
                            onBlur={() => {
                              onRenameChat(c.id, renameValue || c.title);
                              setRenamingId(null);
                            }}
                            className="w-full bg-white/10 rounded px-1.5 py-0.5 text-[13px] text-white outline-none"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {c.pinned && <span className="text-[#FF0080] text-[10px]">&#128204;</span>}
                            <span className="truncate text-[13px] text-white">{c.title}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="truncate text-[11px] text-white/40">{c.preview}</span>
                          <span className="ml-auto shrink-0 text-[10px] text-white/30">{timeAgo(c.timestamp)}</span>
                        </div>
                        {schedule && (
                          <span className="mt-1 inline-block rounded-full bg-[#FF0080]/15 text-[#FF0080] text-[10px] px-2 py-0.5">
                            Scheduled &middot; {schedule.label}
                          </span>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuFor(menuFor === c.id ? null : c.id);
                          }}
                          className="hidden group-hover:flex absolute right-1.5 top-1.5 h-5 w-5 items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10"
                        >
                          &#8230;
                        </button>
                        {menuFor === c.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-1.5 top-7 z-10 w-32 rounded-lg border border-white/10 bg-[#15151a] shadow-xl py-1"
                          >
                            <button
                              onClick={() => {
                                setRenamingId(c.id);
                                setRenameValue(c.title);
                                setMenuFor(null);
                              }}
                              className="w-full text-left px-3 py-1.5 text-[12px] text-white/80 hover:bg-white/5"
                            >
                              Rename
                            </button>
                            <button
                              onClick={() => {
                                onTogglePin(c.id);
                                setMenuFor(null);
                              }}
                              className="w-full text-left px-3 py-1.5 text-[12px] text-white/80 hover:bg-white/5"
                            >
                              {c.pinned ? "Unpin" : "Pin"}
                            </button>
                            <button
                              onClick={() => {
                                onDeleteChat(c.id);
                                setMenuFor(null);
                              }}
                              className="w-full text-left px-3 py-1.5 text-[12px] text-red-400 hover:bg-white/5"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null
          )}
        </div>

        {/* Bottom: real user + real credit balance (see getUser()/
            getCreditBalance() in page.tsx) -- was hardcoded demo data. */}
        <div className="p-4 border-t border-white/8 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-white flex items-center justify-center text-[#08080a] text-[11px] font-bold shrink-0">
              {userName.trim().charAt(0).toUpperCase() || "G"}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] text-white truncate">{userName}</div>
              {userEmail && <div className="text-[10px] text-white/40 truncate">{userEmail}</div>}
            </div>
            <a href="/dashboard" className="ml-auto text-white/40 hover:text-white text-[14px]" title="Dashboard">&#9881;</a>
          </div>
          <div className="flex items-center justify-between text-[10px] text-white/40">
            <span className="font-bold text-white/70">{credits} credits</span>
          </div>
          <a
            href="/pricing"
            className="block w-full text-center rounded-lg bg-white text-[#08080a] text-[12px] font-semibold py-1.5 hover:bg-[#FF0080] hover:text-white transition-colors"
          >
            Upgrade
          </a>
        </div>
      </aside>
    </>
  );
}

/* --------------------------------------------------------------------- */
/* Command palette (search skill)                                        */
/* --------------------------------------------------------------------- */

function CommandPalette({
  chats,
  artifacts,
  media,
  onClose,
  onSelectChat,
}: {
  chats: Chat[];
  artifacts: Record<string, Artifact>;
  media: MediaItem[];
  onClose: () => void;
  onSelectChat: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const chatResults = useMemo(
    () =>
      chats
        .map((c) => ({ c, score: Math.max(fuzzyScore(query, c.title), fuzzyScore(query, c.preview)) }))
        .filter((r) => query === "" || r.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
    [chats, query]
  );

  const artifactList = Object.values(artifacts);
  const artifactResults = useMemo(
    () =>
      artifactList
        .map((a) => ({ a, score: fuzzyScore(query, a.title) }))
        .filter((r) => query === "" || r.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artifacts, query]
  );

  const mediaResults = useMemo(
    () =>
      media
        .map((m) => ({ m, score: fuzzyScore(query, m.name) }))
        .filter((r) => query === "" || r.score >= 0)
        .slice(0, 6),
    [media, query]
  );

  const flatCount = chatResults.length + artifactResults.length;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, Math.max(flatCount - 1, 0)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
      }
      if (e.key === "Enter") {
        if (highlight < chatResults.length) {
          onSelectChat(chatResults[highlight].c.id);
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatResults, flatCount, highlight, onClose, onSelectChat]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[600px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#0f0f14]/95 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.4)] overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
          <span className="text-white/40">&#128269;</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            placeholder="Search chats, artifacts, media..."
            className="flex-1 bg-transparent outline-none text-[14px] text-white placeholder:text-white/30 caret-[#FF0080]"
          />
          <span className="text-[10px] text-white/30 border border-white/15 rounded px-1.5 py-0.5">Esc</span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {chatResults.length > 0 && (
            <div className="px-2 mb-2">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-white/35">Chats</div>
              {chatResults.map((r, i) => (
                <button
                  key={r.c.id}
                  onClick={() => {
                    onSelectChat(r.c.id);
                    onClose();
                  }}
                  className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left ${
                    highlight === i ? "bg-[#FF0080]/10" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[13px] text-white truncate">{highlightMatch(r.c.title, query)}</div>
                    <div className="text-[11px] text-white/40 truncate">{r.c.preview}</div>
                  </div>
                  <span className="ml-auto text-[10px] text-white/30 shrink-0">{timeAgo(r.c.timestamp)}</span>
                </button>
              ))}
            </div>
          )}
          {artifactResults.length > 0 && (
            <div className="px-2 mb-2">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-white/35">Artifacts</div>
              {artifactResults.map((r) => (
                <div key={r.a.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-white/[0.04]">
                  <span className="text-[10px] rounded bg-[#FF0080]/15 text-[#FF0080] px-1.5 py-0.5">Code</span>
                  <span className="text-[13px] text-white truncate">{highlightMatch(r.a.title, query)}</span>
                </div>
              ))}
            </div>
          )}
          {mediaResults.length > 0 && (
            <div className="px-4 mb-2">
              <div className="px-0 py-1 text-[10px] uppercase tracking-wide text-white/35">Media</div>
              <div className="flex gap-2 flex-wrap">
                {mediaResults.map((r) => (
                  <img key={r.m.id} src={r.m.url} alt={r.m.name} className="h-12 w-12 rounded-lg object-cover border border-white/10" />
                ))}
              </div>
            </div>
          )}
          {chatResults.length === 0 && artifactResults.length === 0 && mediaResults.length === 0 && (
            <div className="px-4 py-8 text-center text-[12px] text-white/30">No results</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Schedule picker (schedule skill)                                      */
/* --------------------------------------------------------------------- */

function SchedulePicker({ onPick, onClose }: { onPick: (label: string, runAt: number) => void; onClose: () => void }) {
  const [custom, setCustom] = useState("");
  const options: { label: string; getRunAt: () => number }[] = [
    { label: "Now", getRunAt: () => Date.now() },
    { label: "In 1 hour", getRunAt: () => Date.now() + 3600_000 },
    {
      label: "Tomorrow 9am EST",
      getRunAt: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d.getTime();
      },
    },
  ];
  return (
    <div className="absolute bottom-full mb-2 left-0 z-30 w-64 rounded-xl border border-white/10 bg-[#15151a] shadow-xl p-2" onClick={(e) => e.stopPropagation()}>
      <div className="px-2 py-1.5 text-[12px] text-white/70">When to run this build?</div>
      {options.map((o) => (
        <button
          key={o.label}
          onClick={() => {
            onPick(o.label, o.getRunAt());
            onClose();
          }}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] text-white hover:bg-[#FF0080]/10"
        >
          {o.label}
        </button>
      ))}
      <div className="px-2 pt-1.5 pb-1">
        <input
          type="datetime-local"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[12px] text-white outline-none"
        />
        <button
          disabled={!custom}
          onClick={() => {
            const t = new Date(custom).getTime();
            if (!Number.isNaN(t)) {
              onPick(`Custom · ${new Date(t).toLocaleString()}`, t);
              onClose();
            }
          }}
          className="mt-1.5 w-full rounded-lg bg-[#FF0080] disabled:opacity-30 disabled:cursor-not-allowed text-white text-[12px] font-medium py-1.5"
        >
          Schedule custom time
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Media tray + attach / skills menus (media skill)                      */
/* --------------------------------------------------------------------- */

function MediaTray({ items, onRemove }: { items: MediaItem[]; onRemove: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="flex gap-2 px-1 pb-2 overflow-x-auto">
      {items.map((m) => (
        <div key={m.id} className="relative shrink-0 group">
          {m.type === "image" ? (
            <img src={m.url} alt={m.name} className="h-16 w-16 rounded-xl object-cover border border-white/10" />
          ) : (
            <div className="h-16 w-16 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-[10px] text-white/60 text-center px-1">
              {m.type === "figma" ? "Figma" : m.type === "github" ? "GitHub" : m.type === "video" ? "Video" : m.name}
            </div>
          )}
          <button
            onClick={() => onRemove(m.id)}
            className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-black/80 border border-white/20 text-white text-[11px]"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}

function AttachMenu({
  onPickFiles,
  onAddLink,
}: {
  onPickFiles: () => void;
  onAddLink: (type: "figma" | "github") => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-7 w-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        title="Attach"
      >
        +
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-40 rounded-lg border border-white/10 bg-[#15151a] shadow-xl py-1 z-20">
          {[
            { label: "Upload file", action: onPickFiles },
            { label: "Image", action: onPickFiles },
            { label: "Code", action: onPickFiles },
            { label: "Figma", action: () => onAddLink("figma") },
            { label: "GitHub", action: () => onAddLink("github") },
          ].map((item) => (
            <button
              key={item.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                item.action();
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-white/80 hover:bg-white/5"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillsMenu({ onPick }: { onPick: (cmd: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-7 px-2 flex items-center gap-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 text-[12px] transition-colors"
        title="Skills"
      >
        @ Skills
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-60 rounded-lg border border-white/10 bg-[#15151a] shadow-xl py-1 z-20">
          {SKILLS.map((s) => (
            <button
              key={s.cmd}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(s.cmd);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-white/5"
            >
              <div className="text-[12px] text-white">{s.cmd}</div>
              <div className="text-[10px] text-white/40">{s.desc}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Artifact panel (Preview / Code / Deploy)                               */
/* --------------------------------------------------------------------- */

type DeviceMode = "desktop" | "tablet" | "mobile";

function ArtifactPanel({
  artifact,
  onClose,
  width,
  onStartResize,
  onPublished,
}: {
  artifact: Artifact | null;
  onClose: () => void;
  width: number;
  onStartResize: (e: React.MouseEvent) => void;
  onPublished: (artifactId: string) => void;
}) {
  const [tab, setTab] = useState<"preview" | "code" | "deploy">("preview");
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [activeFile, setActiveFile] = useState(0);
  const [copied, setCopied] = useState(false);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishTagline, setPublishTagline] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");

  const deviceWidths: Record<DeviceMode, string> = {
    desktop: "100%",
    tablet: "768px",
    mobile: "375px",
  };

  async function handlePublish() {
    if (!artifact?.projectId || !publishTitle.trim() || publishing) return;
    setPublishing(true);
    setPublishError("");
    try {
      await publishToBuildGuild(artifact.projectId, publishTitle.trim(), publishTagline.trim());
      onPublished(artifact.id);
    } catch (e: any) {
      setPublishError(e?.message || "Failed to publish.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div
      style={{ width }}
      className="hidden lg:flex shrink-0 flex-col bg-[#0f0f14] border-l border-white/8 relative"
    >
      <div
        onMouseDown={onStartResize}
        className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-[#FF0080]/40 z-10"
      />
      <div className="flex items-center justify-between px-4 h-14 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-4">
          {(["preview", "code", "deploy"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[12px] capitalize pb-1 border-b-2 transition-colors ${
                tab === t ? "border-[#FF0080] text-white" : "border-transparent text-white/40 hover:text-white/70"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              if (artifact) navigator.clipboard?.writeText(artifact.html).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="text-[11px] text-white/50 hover:text-white px-1.5"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          {artifact?.url && (
            <a
              href={`https://${artifact.url}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-white/50 hover:text-white px-1.5"
            >
              Open &#8599;
            </a>
          )}
          <button
            onClick={() => setTab("deploy")}
            className="rounded-lg bg-[#FF0080] text-white text-[11px] font-medium px-2.5 py-1 hover:brightness-110"
          >
            Publish
          </button>
          <button onClick={onClose} className="text-white/40 hover:text-white px-1.5 lg:hidden">
            &times;
          </button>
        </div>
      </div>

      {!artifact ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl mb-4">
            &#10024;
          </div>
          <p className="text-[13px] text-white/50 mb-1">Your build will appear here</p>
          <p className="text-[11px] text-white/30 max-w-[220px]">
            Try "Build a Stripe checkout for a coaching business" or "Booking app for a physio clinic".
          </p>
        </div>
      ) : tab === "preview" ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-center gap-1 py-2 border-b border-white/8 shrink-0">
            {(["desktop", "tablet", "mobile"] as DeviceMode[]).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className={`text-[10px] capitalize px-2 py-1 rounded-md ${
                  device === d ? "bg-[#FF0080]/15 text-[#FF0080]" : "text-white/40 hover:text-white/70"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto bg-black/20 flex justify-center p-3">
            <iframe
              title="artifact-preview"
              srcDoc={artifact.html}
              style={{ width: deviceWidths[device], maxWidth: "100%" }}
              className="h-full rounded-xl border border-white/10 bg-white"
            />
          </div>
          {artifact.progress < 100 && (
            <div className="h-1 bg-white/5 shrink-0">
              <div
                className="h-full bg-[#FF0080] transition-[width] duration-300"
                style={{ width: `${artifact.progress}%` }}
              />
            </div>
          )}
        </div>
      ) : tab === "code" ? (
        <div className="flex-1 flex min-h-0">
          <div className="w-36 shrink-0 border-r border-white/8 overflow-y-auto py-2">
            {artifact.files.map((f, i) => (
              <button
                key={f.name}
                onClick={() => setActiveFile(i)}
                className={`w-full text-left px-3 py-1.5 text-[11px] truncate ${
                  activeFile === i ? "bg-[#FF0080]/10 text-[#FF0080]" : "text-white/60 hover:bg-white/5"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
          <pre className="flex-1 overflow-auto p-3 text-[12px] leading-relaxed font-mono text-white/80">
            <code>{highlightCode(artifact.files[activeFile]?.content || "")}</code>
          </pre>
        </div>
      ) : (
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3">
            <div className="flex items-center gap-2 text-[12px] text-emerald-300 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live now
            </div>
            <div className="mt-1 text-[13px] text-white break-all">{artifact.url}</div>
            <p className="mt-1 text-[11px] text-white/40">
              Every GYSM build is live the moment it's generated -- no separate deploy step needed.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
            <div className="text-[12px] text-white font-medium">Publish to BuildGuild</div>
            <p className="text-[11px] text-white/40">
              List this build publicly in the BuildGuild marketplace.
            </p>
            {artifact.published ? (
              <div className="text-[12px] text-emerald-300">&#10003; Published</div>
            ) : (
              <>
                <input
                  value={publishTitle}
                  onChange={(e) => setPublishTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/30 outline-none"
                />
                <input
                  value={publishTagline}
                  onChange={(e) => setPublishTagline(e.target.value)}
                  placeholder="Tagline (optional)"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/30 outline-none"
                />
                {publishError && <p className="text-[11px] text-red-400">{publishError}</p>}
                <button
                  onClick={handlePublish}
                  disabled={!artifact.projectId || !publishTitle.trim() || publishing}
                  className="w-full rounded-xl bg-[#FF0080] text-white text-[13px] font-semibold py-2 disabled:opacity-40"
                >
                  {publishing ? "Publishing..." : "Publish"}
                </button>
              </>
            )}
          </div>

          {artifact.suggestions.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-1.5">
              <div className="text-[12px] text-white font-medium">Suggested next steps</div>
              {artifact.suggestions.map((s, i) => (
                <div key={i} className="text-[11px] text-white/50">&bull; {s}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Program builder + runner (program skill)                               */
/* --------------------------------------------------------------------- */

function ProgramPanel({
  program,
  onChange,
  width,
}: {
  program: Program;
  onChange: (p: Program) => void;
  width: number;
}) {
  const dragIndex = useRef<number | null>(null);

  function addStep(label: string) {
    onChange({ ...program, steps: [...program.steps, { id: uid("step"), label, status: "pending" }] });
  }

  function removeStep(id: string) {
    onChange({ ...program, steps: program.steps.filter((s) => s.id !== id) });
  }

  function reorder(from: number, to: number) {
    const steps = [...program.steps];
    const [moved] = steps.splice(from, 1);
    steps.splice(to, 0, moved);
    onChange({ ...program, steps });
  }

  function run() {
    const steps = program.steps.map((s) => ({ ...s, status: "pending" as const }));
    onChange({ ...program, steps, running: true, logs: [] });
    steps.forEach((step, i) => {
      setTimeout(() => {
        onChange({
          ...store!.get().programs[program.id],
          steps: store!.get().programs[program.id].steps.map((s, idx) => (idx === i ? { ...s, status: "running" } : s)),
        });
      }, i * 800);
      setTimeout(() => {
        const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const current = store!.get().programs[program.id];
        onChange({
          ...current,
          steps: current.steps.map((s, idx) => (idx === i ? { ...s, status: "done" } : s)),
          logs: [...current.logs, { id: uid("log"), time, text: `${step.label} ✓` }],
          running: i < steps.length - 1,
        });
      }, i * 800 + 700);
    });
  }

  return (
    <div style={{ width }} className="hidden lg:flex shrink-0 flex-col bg-[#0f0f14] border-l border-white/8">
      <div className="flex items-center justify-between px-4 h-14 border-b border-white/8 shrink-0">
        <span className="text-[13px] text-white font-medium">Program</span>
        <button
          onClick={run}
          disabled={program.running}
          className="rounded-lg bg-[#FF0080] text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-60"
        >
          {program.running ? "Running..." : "Run"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {program.steps.map((step, i) => (
          <div
            key={step.id}
            draggable
            onDragStart={() => (dragIndex.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex.current !== null && dragIndex.current !== i) reorder(dragIndex.current, i);
              dragIndex.current = null;
            }}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 cursor-move"
          >
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                step.status === "done" ? "bg-emerald-400" : step.status === "running" ? "bg-[#FF0080] animate-pulse" : "bg-white/20"
              }`}
            />
            <span className="text-[12px] text-white flex-1 truncate">{step.label}</span>
            {step.status === "done" && <span className="text-emerald-400 text-[11px]">&#10003;</span>}
            <button onClick={() => removeStep(step.id)} className="text-white/30 hover:text-white text-[12px]">
              &times;
            </button>
          </div>
        ))}
        <div className="relative">
          <select
            onChange={(e) => {
              if (e.target.value) addStep(e.target.value);
              e.target.value = "";
            }}
            defaultValue=""
            className="w-full rounded-xl border border-dashed border-white/15 bg-transparent px-3 py-2 text-[12px] text-white/40 outline-none"
          >
            <option value="" disabled>
              + Add step
            </option>
            {PROGRAM_ACTION_TYPES.map((a) => (
              <option key={a} value={a} className="text-black">
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="border-t border-white/8 p-3">
        <div className="text-[10px] uppercase tracking-wide text-white/35 mb-1.5">Logs</div>
        <div className="rounded-xl border border-white/10 bg-black/40 p-2.5 font-mono text-[11px] text-white/70 space-y-1 max-h-32 overflow-y-auto">
          {program.logs.length === 0 ? (
            <span className="text-white/30">Run the program to see logs.</span>
          ) : (
            program.logs.map((l) => (
              <div key={l.id}>
                [{l.time}] {l.text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Chat center                                                            */
/* --------------------------------------------------------------------- */

function ChatCenter({
  chat,
  media,
  onSend,
  onOpenArtifact,
  onOpenSearch,
  onOpenMobileSidebar,
  artifactOpen,
  onToggleArtifact,
  onAddMedia,
  onRemoveMedia,
  onSchedule,
  onOpenMobileArtifact,
  onOpenProgram,
  tier,
  onChangeTier,
  initialInput,
}: {
  chat: Chat | null;
  media: MediaItem[];
  onSend: (text: string, mediaIds: string[]) => void;
  onOpenArtifact: () => void;
  onOpenSearch: () => void;
  onOpenMobileSidebar: () => void;
  artifactOpen: boolean;
  onToggleArtifact: () => void;
  onAddMedia: (files: FileList) => void;
  onRemoveMedia: (id: string) => void;
  onSchedule: (label: string, runAt: number) => void;
  onOpenMobileArtifact: () => void;
  onOpenProgram: () => void;
  tier: ModelTier;
  onChangeTier: (t: ModelTier) => void;
  initialInput?: string;
}) {
  const [input, setInput] = useState(initialInput || "");
  const [showSchedule, setShowSchedule] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chatMedia = media.filter((m) => chat && m.chatId === chat.id && !chat.messages.some((msg) => msg.mediaIds?.includes(m.id)));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat?.messages.length, chat?.messages[chat.messages.length - 1]?.content]);

  function submit() {
    const text = input.trim();
    if (!text || !chat) return;
    if (text === "/schedule") {
      setShowSchedule(true);
      setInput("");
      return;
    }
    if (text === "/search") {
      onOpenSearch();
      setInput("");
      return;
    }
    if (text === "/program") {
      onOpenProgram();
      setInput("");
      return;
    }
    if (text === "/media") {
      fileInputRef.current?.click();
      setInput("");
      return;
    }
    onSend(text, chatMedia.map((m) => m.id));
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  return (
    <div
      className="flex-1 min-w-0 flex flex-col bg-[#08080a] relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) onAddMedia(e.dataTransfer.files);
      }}
    >
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-white/8">
        <button onClick={onOpenMobileSidebar} className="lg:hidden text-white/60 text-[18px]">
          &#9776;
        </button>
        <div className="min-w-0">
          <div className="text-[13px] text-white/40">
            Chats / {chat ? dayBucket(chat.timestamp) : "Today"} /{" "}
            <span className="text-white">{chat?.title || "New Build"}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="text-[12px] text-white/50 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5">
            Share
          </button>
          <button
            onClick={() => {
              onToggleArtifact();
              onOpenMobileArtifact();
            }}
            className={`text-[12px] px-2.5 py-1 rounded-lg border ${
              artifactOpen ? "border-[#FF0080]/40 text-[#FF0080] bg-[#FF0080]/10" : "border-white/10 text-white/50 hover:text-white"
            }`}
          >
            Artifact
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-4 py-6 space-y-5">
          {!chat || chat.messages.length === 0 ? (
            <div className="pt-16 text-center">
              <p className="text-white/40 text-[13px]">Describe an app, get a real one.</p>
            </div>
          ) : (
            chat.messages.map((m) => (
              <MessageBubble key={m.id} message={m} media={media} onOpenArtifact={onOpenArtifact} />
            ))
          )}
        </div>
      </div>

      {/* Input */}
      <div className="sticky bottom-0 bg-[#08080a]/80 backdrop-blur px-4 pb-4 pt-2">
        <div className="max-w-[720px] mx-auto">
          <MediaTray items={chatMedia} onRemove={onRemoveMedia} />
          <div
            className={`rounded-2xl border bg-white/[0.03] px-3 py-2.5 transition-shadow ${
              dragOver ? "border-[#FF0080]/60 shadow-[0_0_0_3px_rgba(255,0,128,0.15)]" : "border-white/10 focus-within:border-[#FF0080]/50 focus-within:shadow-[0_0_0_3px_rgba(255,0,128,0.12)]"
            }`}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Build something... Describe your idea, attach media, or @ a skill"
              className="w-full resize-none bg-transparent outline-none text-[14px] text-white placeholder:text-white/30 max-h-40"
            />
            <div className="flex items-center gap-1 mt-1 relative">
              <AttachMenu
                onPickFiles={() => fileInputRef.current?.click()}
                onAddLink={(type) => {
                  const url = window.prompt(`Paste a ${type === "figma" ? "Figma" : "GitHub"} link`);
                  if (url) onAddMedia({ 0: new File([url], url), length: 1, item: () => null } as unknown as FileList);
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => e.target.files && onAddMedia(e.target.files)}
              />
              <SkillsMenu
                onPick={(cmd) => {
                  if (cmd === "/schedule") setShowSchedule(true);
                  else if (cmd === "/search") onOpenSearch();
                  else if (cmd === "/program") onOpenProgram();
                  else if (cmd === "/media") fileInputRef.current?.click();
                  else setInput((v) => `${v ? v + " " : ""}${cmd} `);
                }}
              />
              {showSchedule && (
                <SchedulePicker
                  onClose={() => setShowSchedule(false)}
                  onPick={(label, runAt) => onSchedule(label, runAt)}
                />
              )}
              <select
                value={tier}
                onChange={(e) => onChangeTier(e.target.value as ModelTier)}
                className="ml-auto flex items-center gap-1 text-[11px] text-white/60 px-2 py-1 rounded-lg bg-white/5 border border-white/10 outline-none cursor-pointer"
                title="Model tier -- higher tiers cost more credits per build"
              >
                {(Object.keys(TIER_LABELS) as ModelTier[]).map((t) => (
                  <option key={t} value={t} className="text-black">
                    {TIER_LABELS[t]}
                  </option>
                ))}
              </select>
              <button
                onClick={submit}
                disabled={!input.trim()}
                className={`h-8 w-8 flex items-center justify-center rounded-full text-white transition-all ${
                  input.trim()
                    ? "bg-[#FF0080] shadow-[0_0_16px_rgba(255,0,128,0.45)] hover:brightness-110"
                    : "bg-white/10 cursor-not-allowed"
                }`}
              >
                &#8593;
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Top-level app                                                          */
/* --------------------------------------------------------------------- */

const MIN_PANEL = 340;
const MAX_PANEL = 720;
const DEFAULT_PANEL = 420;

interface LinearBuilderAppProps {
  initialHtml?: string | null;
  initialPrompt?: string;
  initialProjectId?: string | null;
  isAdmin?: boolean;
  /** Where this component is actually mounted -- used for the /sign-in
   *  redirect_url so a logged-out visitor comes back here. */
  builderPath?: string;
  /** Real signed-in identity + credit balance, from getUser()/
   *  getCreditBalance() in page.tsx -- see Sidebar's footer. */
  userName?: string;
  userEmail?: string | null;
  credits?: number;
}

export default function LinearBuilderApp({
  initialHtml = null,
  initialPrompt = "",
  initialProjectId = null,
  // isAdmin is accepted for parity with app/builder/page.tsx's props but
  // not yet wired to any admin-only UI here -- the old BuilderClient's
  // template-curation controls weren't ported in this pass. Flagged in
  // the handoff notes as a known gap.
  isAdmin: _isAdmin = false,
  builderPath = "/builder",
  userName = "there",
  userEmail = null,
  credits = 0,
}: LinearBuilderAppProps) {
  const [state, setState] = useLinearStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileArtifactOpen, setMobileArtifactOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightMode, setRightMode] = useState<"artifact" | "program">("artifact");
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL);
  const [tier, setTier] = useState<ModelTier>("fast");
  const resizing = useRef(false);
  const router = useRouter();
  const hydrated = useRef(false);

  const activeChat = state.chats.find((c) => c.id === state.activeChatId) || null;
  const activeArtifact = activeChat?.artifactId ? state.artifacts[activeChat.artifactId] : null;
  const activeProgram = activeChat ? state.programs[activeChat.id] : undefined;

  /* One-time hydration from server props: resume a saved project
   * (initialHtml + initialProjectId), or prefill a deep-linked prompt
   * (initialPrompt alone, never auto-submitted -- matches the production
   * builder's own "never surprise a credit spend" rule). */
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (initialHtml && initialProjectId) {
      const chatId = uid("chat");
      const artifactId = uid("art");
      const host = typeof window !== "undefined" ? window.location.host : "gysm.io";
      const chat: Chat = {
        id: chatId,
        title: titleFromPrompt(initialPrompt) || "Resumed build",
        preview: initialPrompt.slice(0, 60) || "Resumed build",
        timestamp: Date.now(),
        artifactId,
        messages: [
          ...(initialPrompt
            ? [{ id: uid("msg"), role: "user" as const, content: initialPrompt, createdAt: Date.now() - 1000 }]
            : []),
          {
            id: uid("msg"),
            role: "assistant" as const,
            content: `Welcome back -- here's where you left off. Built demo: ${host}/publish/${initialProjectId}`,
            createdAt: Date.now(),
          },
        ],
      };
      const artifact: Artifact = {
        id: artifactId,
        chatId,
        projectId: initialProjectId,
        title: titleFromPrompt(initialPrompt) || "Resumed build",
        html: initialHtml,
        files: [{ name: "index.html", language: "html", content: initialHtml }],
        url: `${host}/publish/${initialProjectId}`,
        progress: 100,
        deployed: true,
        published: false,
        suggestions: [],
      };
      setState((s) => ({
        ...s,
        chats: [chat, ...s.chats.filter((c) => c.messages.length > 0)],
        artifacts: { ...s.artifacts, [artifactId]: artifact },
        activeChatId: chatId,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Global Ctrl/Cmd+K for search */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Resizable artifact panel */
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizing.current) return;
      const fromRight = window.innerWidth - e.clientX;
      setPanelWidth(Math.min(MAX_PANEL, Math.max(MIN_PANEL, fromRight)));
    }
    function onUp() {
      resizing.current = false;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  function newChat() {
    const chat: Chat = {
      id: uid("chat"),
      title: "New Build",
      preview: "Just started",
      timestamp: Date.now(),
      messages: [],
    };
    setState((s) => ({ ...s, chats: [chat, ...s.chats], activeChatId: chat.id }));
    setRightMode("artifact");
    setMobileSidebarOpen(false);
  }

  function selectChat(id: string) {
    setState((s) => ({ ...s, activeChatId: id }));
    setRightMode("artifact");
    setMobileSidebarOpen(false);
  }

  function togglePin(id: string) {
    setState((s) => ({
      ...s,
      chats: s.chats.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)),
    }));
  }

  function deleteChat(id: string) {
    setState((s) => {
      const chats = s.chats.filter((c) => c.id !== id);
      const activeChatId = s.activeChatId === id ? chats[0]?.id ?? null : s.activeChatId;
      return { ...s, chats, activeChatId };
    });
  }

  function renameChat(id: string, title: string) {
    setState((s) => ({ ...s, chats: s.chats.map((c) => (c.id === id ? { ...c, title } : c)) }));
  }

  function addMedia(files: FileList) {
    if (!activeChat) return;
    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      const reader = new FileReader();
      reader.onload = () => {
        const item: MediaItem = {
          id: uid("media"),
          chatId: activeChat.id,
          url: typeof reader.result === "string" ? reader.result : "",
          type: isImage ? "image" : isVideo ? "video" : file.name.includes("figma") ? "figma" : "github",
          name: file.name,
        };
        setState((s) => ({ ...s, media: [...s.media, item] }));
      };
      if (isImage || isVideo) reader.readAsDataURL(file);
      else {
        setState((s) => ({
          ...s,
          media: [
            ...s.media,
            {
              id: uid("media"),
              chatId: activeChat.id,
              url: "",
              type: file.name.startsWith("http") ? (file.name.includes("figma.com") ? "figma" : "github") : "github",
              name: file.name,
            },
          ],
        }));
      }
    });
  }

  function removeMedia(id: string) {
    setState((s) => ({ ...s, media: s.media.filter((m) => m.id !== id) }));
  }

  function scheduleChat(label: string, runAt: number) {
    if (!activeChat) return;
    const item: ScheduleItem = {
      id: uid("sched"),
      chatId: activeChat.id,
      chatTitle: activeChat.title,
      runAt,
      label,
      status: "queued",
    };
    setState((s) => ({
      ...s,
      schedules: [...s.schedules, item],
      chats: s.chats.map((c) =>
        c.id === activeChat.id
          ? {
              ...c,
              messages: [
                ...c.messages,
                { id: uid("msg"), role: "system", content: `Scheduled for ${label}`, createdAt: Date.now() },
              ],
            }
          : c
      ),
    }));
  }

  function openProgram() {
    if (!activeChat) return;
    setState((s) => {
      if (s.programs[activeChat.id]) return s;
      const program: Program = {
        id: uid("prog"),
        chatId: activeChat.id,
        running: false,
        logs: [],
        steps: [
          { id: uid("step"), label: "Find leads on Twitter", status: "pending" },
          { id: uid("step"), label: "Build demo", status: "pending" },
          { id: uid("step"), label: "Send email", status: "pending" },
          { id: uid("step"), label: "Collect $79", status: "pending" },
        ],
      };
      return { ...s, programs: { ...s.programs, [activeChat.id]: program } };
    });
    setRightMode("program");
    setRightOpen(true);
    setMobileArtifactOpen(true);
  }

  function updateProgram(p: Program) {
    setState((s) => ({ ...s, programs: { ...s.programs, [p.chatId]: p } }));
  }

  function openArtifactPanel() {
    setRightMode("artifact");
    setRightOpen(true);
    setMobileArtifactOpen(true);
  }

  function markPublished(artifactId: string) {
    setState((s) => ({
      ...s,
      artifacts: { ...s.artifacts, [artifactId]: { ...s.artifacts[artifactId], published: true } },
    }));
  }

  /** Sends a prompt to the real /api/generate endpoint, shows live stage
   *  text in the assistant bubble while it streams, and on success turns
   *  the response into a real artifact (real html, real projectId, a
   *  real gysm.io/publish/<id> url). Redirects on 401/402 exactly like
   *  the production builder does. */
  async function runGeneration(chatId: string, prompt: string, image: string | undefined) {
    const chatForRequest = store!.get().chats.find((c) => c.id === chatId);
    const existingArtifact = chatForRequest?.artifactId ? store!.get().artifacts[chatForRequest.artifactId] : null;

    const msgId = uid("msg");
    setState((s) => ({
      ...s,
      chats: s.chats.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, { id: msgId, role: "assistant", content: "", createdAt: Date.now(), streaming: true }] }
          : c
      ),
    }));

    const setStreamingText = (text: string) => {
      setState((s) => ({
        ...s,
        chats: s.chats.map((c) =>
          c.id === chatId ? { ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, content: text } : m)) } : c
        ),
      }));
    };
    const finalizeText = (text: string) => {
      setState((s) => ({
        ...s,
        chats: s.chats.map((c) =>
          c.id === chatId
            ? { ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, content: text, streaming: false } : m)) }
            : c
        ),
      }));
    };

    try {
      const result = await runRealGeneration({
        prompt,
        previousHtml: existingArtifact?.html ?? null,
        projectId: existingArtifact?.projectId ?? null,
        image,
        tier,
        onStage: setStreamingText,
        onAuthRequired: () => router.push(`/sign-in?redirect_url=${encodeURIComponent(builderPath)}`),
        onNoCredits: () => router.push("/pricing?reason=no_credits"),
      });

      const host = typeof window !== "undefined" ? window.location.host : "gysm.io";
      const url = `${host}/publish/${result.projectId ?? ""}`;
      finalizeText(`Here it is -- built demo: ${url}`);

      const artifactId = existingArtifact?.id ?? uid("art");
      const artifact: Artifact = {
        id: artifactId,
        chatId,
        projectId: result.projectId ?? null,
        title: existingArtifact?.title ?? titleFromPrompt(prompt),
        html: result.html,
        files: [{ name: "index.html", language: "html", content: result.html }],
        url,
        progress: 100,
        deployed: true,
        published: existingArtifact?.published ?? false,
        suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
      };
      setState((s) => ({
        ...s,
        artifacts: { ...s.artifacts, [artifactId]: artifact },
        chats: s.chats.map((c) => (c.id === chatId ? { ...c, artifactId } : c)),
      }));
      setRightMode("artifact");
      setRightOpen(true);
    } catch (err: any) {
      if (err?.message === "__redirecting__") return;
      finalizeText(err?.message || "Something went wrong. Try again.");
    }
  }

  function sendMessage(text: string, mediaIds: string[]) {
    if (!activeChat) return;
    const chatId = activeChat.id;
    const userMsg: ChatMessage = {
      id: uid("msg"),
      role: "user",
      content: text,
      createdAt: Date.now(),
      mediaIds: mediaIds.length ? mediaIds : undefined,
    };
    const isFirstMessage = activeChat.messages.length === 0;
    setState((s) => ({
      ...s,
      chats: s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              title: isFirstMessage ? titleFromPrompt(text) || c.title : c.title,
              preview: text.slice(0, 60),
              timestamp: Date.now(),
              messages: [...c.messages, userMsg],
            }
          : c
      ),
    }));

    // Only the first attached image is sent -- that's the real backend's
    // reference-image capability (a single optional image per generation;
    // see app/api/generate/route.ts's MAX_IMAGE_BYTES handling).
    const firstImage = mediaIds
      .map((id) => state.media.find((m) => m.id === id))
      .find((m) => m?.type === "image")?.url;

    if (mediaIds.length > 0) {
      setState((s) => ({
        ...s,
        chats: s.chats.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  {
                    id: uid("msg"),
                    role: "system",
                    content:
                      mediaIds.length > 1
                        ? `Added ${mediaIds.length} assets to build context (only the first image is sent to the model)`
                        : "Added 1 asset to build context",
                    createdAt: Date.now(),
                  },
                ],
              }
            : c
        ),
      }));
    }

    runGeneration(chatId, text, firstImage);
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#08080a] text-white antialiased">
      <Sidebar
        chats={state.chats}
        schedules={state.schedules}
        activeChatId={state.activeChatId}
        onSelectChat={selectChat}
        onNewChat={newChat}
        onOpenSearch={() => setSearchOpen(true)}
        onTogglePin={togglePin}
        onDeleteChat={deleteChat}
        onRenameChat={renameChat}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        userName={userName}
        userEmail={userEmail}
        credits={credits}
      />

      <ChatCenter
        chat={activeChat}
        media={state.media}
        onSend={sendMessage}
        onOpenArtifact={openArtifactPanel}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        artifactOpen={rightOpen}
        onToggleArtifact={() => setRightOpen((o) => !o)}
        onAddMedia={addMedia}
        onRemoveMedia={removeMedia}
        onSchedule={scheduleChat}
        onOpenMobileArtifact={() => setMobileArtifactOpen(true)}
        onOpenProgram={openProgram}
        tier={tier}
        onChangeTier={setTier}
        initialInput={!initialHtml ? initialPrompt : undefined}
      />

      {rightOpen &&
        (rightMode === "program" && activeProgram ? (
          <ProgramPanel program={activeProgram} onChange={updateProgram} width={panelWidth} />
        ) : (
          <ArtifactPanel
            artifact={activeArtifact || null}
            onClose={() => setRightOpen(false)}
            width={panelWidth}
            onStartResize={(e) => {
              e.preventDefault();
              resizing.current = true;
            }}
            onPublished={markPublished}
          />
        ))}

      {/* Mobile artifact bottom sheet */}
      {mobileArtifactOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex flex-col justify-end bg-black/60" onClick={() => setMobileArtifactOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-[75vh] rounded-t-2xl overflow-hidden bg-[#0f0f14] border-t border-white/10 flex flex-col"
          >
            <div className="flex justify-center py-2">
              <span className="h-1 w-10 rounded-full bg-white/20" />
            </div>
            {rightMode === "program" && activeProgram ? (
              <ProgramPanel program={activeProgram} onChange={updateProgram} width={"100%" as unknown as number} />
            ) : (
              <ArtifactPanel
                artifact={activeArtifact || null}
                onClose={() => setMobileArtifactOpen(false)}
                width={"100%" as unknown as number}
                onStartResize={() => {}}
                onPublished={markPublished}
              />
            )}
          </div>
        </div>
      )}

      {searchOpen && (
        <CommandPalette
          chats={state.chats}
          artifacts={state.artifacts}
          media={state.media}
          onClose={() => setSearchOpen(false)}
          onSelectChat={selectChat}
        />
      )}
    </div>
  );
}
