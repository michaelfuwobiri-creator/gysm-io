"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import ShareButton from "@/app/components/ShareButton";
import GitHubPushPanel from "./GitHubPushPanel";
import DataImportPanel from "./DataImportPanel";
import IntegrationsPanel from "./IntegrationsPanel";
import GradientMesh from "@/app/components/GradientMesh";

type Status = "idle" | "loading" | "error";
type View = "preview" | "code";

const STAGE_LABELS: Record<string, string> = {
  structure: "Reading your prompt and planning the build",
  structure_done: "Structure, content, and interactivity written",
  design: "Applying a visual design pass",
  design_done: "Design polish complete",
  saving: "Saving your build",
};

const STAGE_ORDER = ["structure", "structure_done", "design", "design_done", "saving"];

// Hard client-side cap on attached reference images. Vercel's serverless
// request body limit is a hard ~4.5MB platform ceiling (not something we
// can raise), and base64 inflates a file by ~33% -- 3MB raw keeps the
// encoded payload, plus the prompt JSON wrapper, safely under that with
// room to spare. app/api/generate/route.ts enforces the same ceiling
// server-side too, since client-side validation alone is never trustworthy.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

type Props = {
  initialHtml?: string | null;
  initialPrompt?: string;
  initialProjectId?: string | null;
  isAdmin?: boolean;
};

export default function BuilderClient({
  initialHtml = null,
  initialPrompt = "",
  initialProjectId = null,
  isAdmin = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [prompt, setPrompt] = useState(initialPrompt);
  const [html, setHtml] = useState<string | null>(initialHtml);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [view, setView] = useState<View>("preview");
  const [log, setLog] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishTagline, setPublishTagline] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishError, setPublishError] = useState("");

  // Reference photo/illustration a user can attach to show the builder
  // what they want -- a mood board of one image, not a stored asset. Sent
  // alongside the prompt as a data: URL and passed straight through to
  // the vision-capable model in lib/ai/orchestrator.ts.
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  // Model tier -- "fast" (Terra, default) or "best" (Sol, costs 2x
  // credits). Kept in component state rather than a URL/localStorage
  // setting since it's a per-build choice, not a standing preference.
  const [tier, setTier] = useState<"fast" | "best">("fast");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // "Quick edit" -- click-to-edit overlay directly on the live preview,
  // for the common case of a one-word copy fix or a color tweak that
  // doesn't need a full AI re-generation. Plain click + type edits text
  // in place (browser-native contentEditable); alt/option-click selects
  // an element to recolor via the swatch bar below the preview. Saves
  // in place via /api/projects/[id]/quick-edit, which does NOT create a
  // new History version the way a normal AI edit does. See that route's
  // comment for why.
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const quickEditSelectedRef = useRef<HTMLElement | null>(null);
  const quickEditCleanupRef = useRef<(() => void) | null>(null);
  const [quickEdit, setQuickEdit] = useState(false);
  const [quickEditSaving, setQuickEditSaving] = useState(false);
  const [quickEditMsg, setQuickEditMsg] = useState("");
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [quickEditSelection, setQuickEditSelection] = useState<{ tag: string; color: string; background: string } | null>(null);
  const [githubPanelOpen, setGithubPanelOpen] = useState(false);
  const [dataImportOpen, setDataImportOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  // Formatted as a block to prepend to the very next prompt sent to
  // /api/generate -- see app/builder/DataImportPanel.tsx and
  // app/api/connectors/data/*. Cleared after that one generation so a
  // user's later, unrelated edits don't keep re-sending the whole
  // dataset on every request.
  const [pendingDataBlock, setPendingDataBlock] = useState<string | null>(null);

  function handleDataConnected(provider: "airtable" | "google_sheets", rows: Record<string, string>[]) {
    if (!rows.length) {
      setPendingDataBlock(null);
      return;
    }
    setPendingDataBlock(
      `REAL DATA (imported from ${provider === "airtable" ? "Airtable" : "Google Sheets"}, ${rows.length} row${rows.length === 1 ? "" : "s"}) -- use these exact records as the app's real content instead of inventing placeholder items:\n${JSON.stringify(rows)}`
    );
  }

  // Picks up a reference image attached on the dashboard's PromptHero
  // before this build existed (see app/dashboard/PromptHero.tsx) -- a
  // data: URL is too large for the ?prompt= query string, so it's handed
  // off via sessionStorage instead and read exactly once here.
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("gysm:pendingImage");
      if (pending) {
        setImageDataUrl(pending);
        sessionStorage.removeItem("gysm:pendingImage");
      }
    } catch {
      // Storage access can throw in some private-browsing contexts --
      // non-critical, the build just proceeds without the image.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Voice dictation for the prompt box -- browser-native Web Speech API,
  // no server round-trip or new API cost. Feature-detected on mount since
  // it's Chrome/Edge/Safari only (no Firefox support as of this writing);
  // the mic button simply doesn't render when unsupported rather than
  // showing a broken control.
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setVoiceSupported(!!SpeechRecognition);
  }, []);

  function toggleVoice() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) {
        setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      }
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    setIsRecording(true);
    recognition.start();
  }

  // "Connect database" -- links this build to a real Supabase project
  // (the user's own, via OAuth) so it gets a real Postgres database and
  // real auth instead of the mocked/in-memory state every build starts
  // with. See app/api/backend/* and lib/backendStore.ts.
  type BackendStatus = "none" | "connecting" | "provisioning" | "active" | "error" | "disconnected";
  const [backend, setBackend] = useState<{
    status: BackendStatus;
    api_url?: string | null;
    error_message?: string | null;
  } | null>(null);
  const [backendBanner, setBackendBanner] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  // Version history -- every edit made via a suggestion chip saves as a
  // new project row chained back to this build's root (see
  // db/migrations/0004 and app/api/generate/route.ts). This panel lists
  // that chain so a user can jump back to an earlier version instead of
  // only ever being able to move forward.
  type HistoryVersion = { id: string; prompt: string; created_at: string };
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyVersions, setHistoryVersions] = useState<HistoryVersion[]>([]);
  const [historyError, setHistoryError] = useState("");

  // Custom domain -- lets a user point a domain they own at this build
  // (see db/migrations/0006, app/api/projects/[id]/domain/route.ts,
  // lib/vercelDomains.ts, and middleware.ts for the request-routing side).
  type DomainState = {
    domain: string | null;
    status: "none" | "pending" | "verified";
    verification: { type: string; domain: string; value: string }[];
  };
  const [domainOpen, setDomainOpen] = useState(false);
  const [domainState, setDomainState] = useState<DomainState>({ domain: null, status: "none", verification: [] });
  const [domainInput, setDomainInput] = useState("");
  const [domainLoading, setDomainLoading] = useState(false);
  const [domainError, setDomainError] = useState("");

  // Admin-only template curation (see app/api/projects/[id]/template) --
  // lets Mike flag a build as a public /templates gallery entry. Hidden
  // entirely for non-admins; isAdmin comes from the server (lib/isAdmin)
  // since it's derived from the signed-in user's email, not something the
  // client should decide on its own.
  const [isTemplate, setIsTemplate] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  // Curated gallery metadata for a featured template (see
  // app/templates/page.tsx): `name` reuses the existing rename column
  // (0004_project_extras.sql) via PATCH /api/projects/[id]; `blurb` is a
  // template-specific one-liner (0008_template_metadata.sql) saved
  // through the template route alongside `featured`.
  const [templateName, setTemplateName] = useState("");
  const [templateBlurb, setTemplateBlurb] = useState("");
  const [templateMetaSaving, setTemplateMetaSaving] = useState(false);
  const [templateMetaSaved, setTemplateMetaSaved] = useState(false);

  const lastPromptRef = useRef("");

  // Toast after a successful Stripe redirect (?builder?success=true), then
  // strip the query params so a refresh doesn't re-show it.
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 5000);
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      url.searchParams.delete("session_id");
      router.replace(url.pathname + (url.search ? url.search : ""));
      return () => clearTimeout(t);
    }
  }, [searchParams, router]);

  // Landed back here from the Supabase OAuth callback
  // (app/api/backend/callback/route.ts) -- surface the outcome, then
  // strip the query params.
  useEffect(() => {
    const connecting = searchParams.get("backendConnecting");
    const error = searchParams.get("backendError");
    if (!connecting && !error) return;
    if (connecting) setBackendBanner({ kind: "info", text: "Setting up your database\u2026" });
    if (error) setBackendBanner({ kind: "error", text: error });
    const dismiss = setTimeout(() => setBackendBanner(null), 6000);
    const url = new URL(window.location.href);
    url.searchParams.delete("backendConnecting");
    url.searchParams.delete("backendError");
    router.replace(url.pathname + (url.search ? url.search : ""));
    return () => clearTimeout(dismiss);
  }, [searchParams, router]);

  // Poll connection status while a project is loaded -- provisioning a
  // fresh Supabase project takes roughly 1-2 minutes, so this keeps
  // polling (every 4s) until it lands on active/error/none.
  useEffect(() => {
    if (!projectId) {
      setBackend(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/backend/status?projectId=${projectId}`);
        const data = await res.json();
        if (cancelled) return;
        setBackend(data);
        if (data.status === "connecting" || data.status === "provisioning") {
          timer = setTimeout(poll, 4000);
        }
      } catch {
        // transient -- next mount/poll will retry
      }
    };
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId]);

  const connectDatabase = useCallback(() => {
    if (!projectId) return;
    window.location.href = `/api/backend/connect?projectId=${projectId}`;
  }, [projectId]);

  const disconnectDatabase = useCallback(async () => {
    if (!projectId) return;
    await fetch("/api/backend/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    setBackend({ status: "disconnected" });
  }, [projectId]);

  const fetchHistory = useCallback(async () => {
    if (!projectId) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/history`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load history.");
      setHistoryVersions(Array.isArray(data.versions) ? data.versions : []);
    } catch (e: any) {
      setHistoryError(e?.message || "Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  // Keeps the always-visible conversation sidebar populated -- previously
  // this only fetched on-demand when the "History" button was clicked, so
  // the running thread of past prompts wasn't visible by default the way
  // Lovable's chat panel is.
  useEffect(() => {
    if (projectId) fetchHistory();
  }, [projectId, fetchHistory]);

  const toggleHistory = useCallback(() => {
    setHistoryOpen((v) => !v);
  }, []);

  // Jump the builder to an earlier version -- doesn't delete or overwrite
  // anything; it just loads that version's saved html/prompt into view.
  // Editing from there saves a new row chained to the same root, same as
  // editing from the latest version would.
  const openVersion = useCallback(async (versionId: string) => {
    try {
      const res = await fetch(`/api/projects/${versionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load that version.");
      setHtml(data.html);
      setPrompt(data.prompt || "");
      setProjectId(data.id);
      setView("preview");
      setHistoryOpen(false);
    } catch (e: any) {
      setHistoryError(e?.message || "Failed to load that version.");
    }
  }, []);

  const toggleDomainPanel = useCallback(async () => {
    if (!projectId) return;
    if (domainOpen) {
      setDomainOpen(false);
      return;
    }
    setDomainOpen(true);
    setDomainError("");
    setDomainLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/domain`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load domain status.");
      setDomainState({ domain: data.domain, status: data.status, verification: data.verification || [] });
      if (data.domain) setDomainInput(data.domain);
    } catch (e: any) {
      setDomainError(e?.message || "Failed to load domain status.");
    } finally {
      setDomainLoading(false);
    }
  }, [projectId, domainOpen]);

  const connectDomain = useCallback(async () => {
    if (!projectId || !domainInput.trim()) return;
    setDomainLoading(true);
    setDomainError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to connect domain.");
      setDomainState({ domain: data.domain, status: data.verified ? "verified" : "pending", verification: data.verification || [] });
    } catch (e: any) {
      setDomainError(e?.message || "Failed to connect domain.");
    } finally {
      setDomainLoading(false);
    }
  }, [projectId, domainInput]);

  const disconnectDomain = useCallback(async () => {
    if (!projectId) return;
    setDomainLoading(true);
    setDomainError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/domain`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to disconnect domain.");
      setDomainState({ domain: null, status: "none", verification: [] });
      setDomainInput("");
    } catch (e: any) {
      setDomainError(e?.message || "Failed to disconnect domain.");
    } finally {
      setDomainLoading(false);
    }
  }, [projectId]);

  // Load current is_template state whenever the open build changes, so the
  // toggle reflects reality instead of always starting unfeatured.
  useEffect(() => {
    if (!isAdmin || !projectId) {
      setIsTemplate(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/template`);
        const data = await res.json();
        if (!cancelled && res.ok) {
          setIsTemplate(Boolean(data.isTemplate));
          setTemplateName(data.name || "");
          setTemplateBlurb(data.blurb || "");
        }
      } catch {
        // non-critical -- toggle just won't reflect state until next load
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, projectId]);

  const toggleTemplate = useCallback(async () => {
    if (!projectId || templateLoading) return;
    const next = !isTemplate;
    setTemplateLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/template`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to update template status.");
      setIsTemplate(Boolean(data.isTemplate));
    } catch {
      // leave state unchanged on failure
    } finally {
      setTemplateLoading(false);
    }
  }, [projectId, isTemplate, templateLoading]);

  // Saves the curated display name + one-line blurb for a featured
  // template. Name goes through the existing owner-scoped rename route;
  // blurb (and re-affirming featured=true) goes through the template
  // route. Both are admin-only actions gated upstream by the UI only
  // rendering this when isAdmin && isTemplate.
  const saveTemplateMeta = useCallback(async () => {
    if (!projectId || templateMetaSaving) return;
    setTemplateMetaSaving(true);
    setTemplateMetaSaved(false);
    try {
      await Promise.all([
        templateName.trim()
          ? fetch(`/api/projects/${projectId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: templateName.trim() }),
            })
          : Promise.resolve(),
        fetch(`/api/projects/${projectId}/template`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ featured: true, blurb: templateBlurb }),
        }),
      ]);
      setTemplateMetaSaved(true);
      setTimeout(() => setTemplateMetaSaved(false), 2000);
    } catch {
      // non-critical -- fields just keep their unsaved values on failure
    } finally {
      setTemplateMetaSaving(false);
    }
  }, [projectId, templateName, templateBlurb, templateMetaSaving]);

  // Prompt typed on the logged-out landing page, carried across sign-up via
  // localStorage (see app/page.tsx). Skipped if we're resuming a saved build.
  useEffect(() => {
    if (initialHtml) return;
    const pending = window.localStorage.getItem("gysm_pending_prompt");
    if (pending) {
      setPrompt(pending);
      window.localStorage.removeItem("gysm_pending_prompt");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live "Xs" counter while a build is running -- the first stage (the
  // OpenAI structure call) is the vast majority of total build time and,
  // without this, the log just sits on one line with no visible motion
  // for 30-60+ seconds, which reads as frozen even when it's working.
  useEffect(() => {
    if (status !== "loading") {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [status]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError("");
    if (!file.type.startsWith("image/")) {
      setImageError("Attach an image file (PNG, JPG, etc.).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("That image is too large -- keep it under 3MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.onerror = () => setImageError("Couldn't read that image. Try another file.");
    reader.readAsDataURL(file);
  }

  const generate = useCallback(
    async (promptOverride?: string, opts?: { asEdit?: boolean }) => {
      const p = (promptOverride ?? prompt).trim();
      if (!p) return;
      lastPromptRef.current = p;
      setStatus("loading");
      setErrorMsg("");
      setLog([]);
      setSuggestions([]);
      if (!opts?.asEdit) {
        setPrompt(p);
      }

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: p,
            previousHtml: opts?.asEdit ? html : undefined,
            image: imageDataUrl ?? undefined,
            projectId: opts?.asEdit ? projectId : undefined,
            // A connected data source (see DataImportPanel) is sent as a
            // separate field, once, so the server can fold it into what
            // the AI sees without it ever polluting the saved prompt/title
            // or the History panel with a wall of imported JSON.
            dataContext: pendingDataBlock ?? undefined,
            tier,
          }),
        });
        if (pendingDataBlock) setPendingDataBlock(null);

        if (res.status === 401) {
          router.push("/sign-in?redirect_url=/builder");
          return;
        }
        if (res.status === 402) {
          router.push("/pricing?reason=no_credits");
          return;
        }
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Something went wrong (${res.status}).`);
        }

        // Read the NDJSON stream: one JSON object per line, updating the
        // live build log as each stage lands instead of one opaque spinner.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finished = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const evt = JSON.parse(line);

            if (evt.type === "stage") {
              const label = STAGE_LABELS[evt.stage] ?? evt.stage;
              setLog((prev) => [...prev, label]);
            } else if (evt.type === "error") {
              if (evt.code === "NO_CREDITS") {
                router.push("/pricing?reason=no_credits");
                return;
              }
              throw new Error(evt.error || "Something went wrong.");
            } else if (evt.type === "done") {
              setHtml(evt.html);
              setProjectId(evt.projectId ?? null);
              setSuggestions(Array.isArray(evt.suggestions) ? evt.suggestions : []);
              setView("preview");
              setPublishOpen(false);
              setPublished(false);
              setPublishTitle("");
              setPublishTagline("");
              setPublishError("");
              setImageDataUrl(null);
              setImageError("");
              finished = true;
            }
          }
        }

        if (!finished) throw new Error("No preview came back. Try again.");
        setStatus("idle");
      } catch (e: any) {
        setErrorMsg(e?.message || "Something went wrong.");
        setStatus("error");
      }
    },
    [prompt, html, router, imageDataUrl, pendingDataBlock, tier]
  );

  // Fire the initial generate automatically only if a pending prompt was
  // carried over from the landing page and nothing's loaded yet.
  useEffect(() => {
    if (!initialHtml && prompt && status === "idle" && !html) {
      // no-op: user still has to hit Generate. Auto-firing here would
      // surprise someone who edited the carried-over prompt first.
    }
  }, [initialHtml, prompt, status, html]);

  function copyCode() {
    if (!html) return;
    navigator.clipboard.writeText(html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  function rgbToHex(rgb: string): string {
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return "#000000";
    const [r, g, b] = m.map(Number);
    return "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
  }

  // Wires up the click-to-edit overlay directly on the loaded iframe
  // document -- called on toggle-on and again on every iframe reload
  // while quick edit is active. Plain click scopes contentEditable to
  // just the clicked element (not the whole document -- an earlier
  // version used `document.designMode = "on"`, which makes the entire
  // page one giant editable canvas; a plain Ctrl+A + keystroke there
  // selects and overwrites the whole body, which is exactly what
  // happened in testing and would have silently destroyed a user's
  // build with no undo). Alt/option-click selects an element for
  // recoloring instead, surfaced in the swatch bar below the preview so
  // that doesn't need any floating-popup coordinate math against the
  // iframe's viewport.
  function activateQuickEdit() {
    const doc = previewIframeRef.current?.contentDocument;
    if (!doc || !doc.body) return;

    let editingEl: HTMLElement | null = null;
    const stopEditing = () => {
      if (editingEl) {
        editingEl.removeAttribute("contenteditable");
        editingEl = null;
      }
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || target === doc.body || target === doc.documentElement) return;

      // Always prevent the browser's default action first. Generated
      // builds routinely wrap headings/logos/nav items in <a href="...">
      // or put buttons in <form>s -- without this, a plain click during
      // quick edit would fall through to real navigation (confirmed live:
      // clicking a logo link whose href="/" navigated the preview iframe
      // to gysm.io's own homepage instead of entering edit mode, since
      // "/" resolves against the parent app's origin) or a form submit,
      // instead of just editing the clicked element in place.
      e.preventDefault();

      if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        stopEditing();
        quickEditSelectedRef.current = target;
        const computed = doc.defaultView?.getComputedStyle(target);
        setQuickEditSelection({
          tag: target.tagName.toLowerCase() + (target.className && typeof target.className === "string" ? `.${target.className.split(" ")[0]}` : ""),
          color: rgbToHex(computed?.color || "rgb(0,0,0)"),
          background: rgbToHex(computed?.backgroundColor || "rgb(255,255,255)"),
        });
        return;
      }

      if (target === editingEl) return; // already editing this one, let the click place the caret normally
      stopEditing();
      target.setAttribute("contenteditable", "true");
      editingEl = target;
      target.focus();
    };
    doc.addEventListener("click", onClick, true);
    quickEditCleanupRef.current = () => {
      doc.removeEventListener("click", onClick, true);
      stopEditing();
    };
  }

  function deactivateQuickEdit() {
    quickEditCleanupRef.current?.();
    quickEditCleanupRef.current = null;
    quickEditSelectedRef.current = null;
    setQuickEditSelection(null);
  }

  function applySelectionColor(kind: "color" | "background", hex: string) {
    const el = quickEditSelectedRef.current;
    if (!el) return;
    el.style[kind === "color" ? "color" : "backgroundColor"] = hex;
    setQuickEditSelection((prev) => (prev ? { ...prev, [kind === "color" ? "color" : "background"]: hex } : prev));
  }

  function toggleQuickEdit() {
    setQuickEdit((prev) => {
      const next = !prev;
      if (next) {
        // Iframe is already loaded at this point (button only shows once
        // html exists) -- activate immediately rather than waiting for
        // an onLoad that won't fire again.
        setTimeout(activateQuickEdit, 0);
      } else {
        deactivateQuickEdit();
      }
      return next;
    });
  }

  function discardQuickEdit() {
    deactivateQuickEdit();
    setQuickEdit(false);
    // Force the iframe to remount from the original, unedited html --
    // any DOM changes made while quick-editing only ever lived in the
    // iframe's live document, never in React state, so remounting
    // discards them for free.
    setPreviewReloadKey((k) => k + 1);
  }

  async function saveQuickEdit() {
    const doc = previewIframeRef.current?.contentDocument;
    if (!doc || !projectId || quickEditSaving) return;
    setQuickEditSaving(true);
    deactivateQuickEdit();
    try {
      const newHtml = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
      const res = await fetch(`/api/projects/${projectId}/quick-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: newHtml }),
      });
      const data = await res.json();
      if (res.ok) {
        setHtml(newHtml);
        setQuickEdit(false);
        setQuickEditMsg(data.checkStatus === "pass" ? "Saved" : "Saved -- a couple of checks flagged, see Publish page");
      } else {
        setQuickEditMsg(data.error || "Failed to save.");
      }
    } catch {
      setQuickEditMsg("Failed to save. Check your connection and try again.");
    } finally {
      setQuickEditSaving(false);
      setTimeout(() => setQuickEditMsg(""), 4000);
    }
  }

  async function publishToBuildGuild() {
    if (!projectId || !publishTitle.trim() || publishing) return;
    setPublishing(true);
    setPublishError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: publishTitle.trim(), tagline: publishTagline.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPublishError(data?.error || "Failed to publish.");
        return;
      }
      setPublished(true);
    } catch {
      setPublishError("Failed to publish. Check your connection and try again.");
    } finally {
      setPublishing(false);
    }
  }

  const isLoading = status === "loading";
  const shareUrl =
    projectId && typeof window !== "undefined" ? `${window.location.origin}/publish/${projectId}` : "";

  return (
    <div className="h-screen flex flex-col bg-white text-[#0A0A0A] overflow-hidden">
      {/* Soft ambient glow behind the whole page -- same violet/fuchsia
          identity as the marketing site, so the builder doesn't feel like
          a separate, plainer tool bolted onto a polished landing page. */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-gradient-to-r from-violet-600/10 to-fuchsia-600/10 blur-[120px]" />
      </div>

      {showToast && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-black px-4 py-2 rounded-full text-sm font-bold shadow-lg">
          Payment successful — you're unlocked
        </div>
      )}
      {copied && (
        <div className="fixed top-4 right-4 z-50 bg-white text-black px-4 py-2 rounded-full text-sm font-bold shadow-lg">
          Copied code to clipboard
        </div>
      )}
      {backendBanner && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-full text-sm font-bold shadow-lg ${
            backendBanner.kind === "error" ? "bg-red-500 text-white" : "bg-emerald-500 text-black"
          }`}
        >
          {backendBanner.text}
        </div>
      )}

      {/* Top bar -- full width, fixed height, sits above the two-pane body */}
        <div className="flex justify-between items-center h-14 px-6 border-b border-black/10">
          <h1 className="text-2xl font-black">
            GYSM<span className="text-fuchsia-500">.IO</span>
          </h1>
          <div className="flex items-center gap-2">
            {html && !isLoading && (
              <button
                onClick={() => {
                  setHtml(null);
                  setProjectId(null);
                  setPrompt("");
                  setSuggestions([]);
                  setLog([]);
                  setView("preview");
                  setPublishOpen(false);
                  setPublished(false);
                  setPublishTitle("");
                  setPublishTagline("");
                  setPublishError("");
                  setImageDataUrl(null);
                  setImageError("");
                }}
                className="text-[12px] font-medium text-black/50 hover:text-black hover:bg-black/[0.05] px-3 py-1.5 rounded-full transition"
              >
                New build
              </button>
            )}
            <a href="/buildguild" className="text-[12px] font-medium text-black/50 hover:text-black hover:bg-black/[0.05] px-3 py-1.5 rounded-full transition">
              BuildGuild
            </a>
            <a href="/dashboard" className="text-[12px] font-medium text-black/50 hover:text-black hover:bg-black/[0.05] px-3 py-1.5 rounded-full transition">
              My Builds
            </a>
            <div className="ml-1">
              <OrganizationSwitcher
                afterCreateOrganizationUrl="/dashboard"
                afterSelectOrganizationUrl="/dashboard"
                afterSelectPersonalUrl="/dashboard"
                afterLeaveOrganizationUrl="/dashboard"
                appearance={{ elements: { organizationSwitcherTrigger: "text-black" } }}
              />
            </div>
            <div className="ml-1">
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </div>

      {/* Two-pane body, Bolt/Lovable-style: chat + composer on the left,
          live preview/code filling the rest of the viewport on the right. */}
      <div className="flex-1 min-h-0 flex relative">
        {/* LEFT PANE -- conversation history + prompt composer */}
        <div className="w-full lg:w-[440px] shrink-0 flex flex-col border-r border-black/10 min-h-0 bg-white relative z-10">
        {!html && !isLoading && (
          <div className="relative text-center px-5 pt-6 pb-2 rounded-[20px] overflow-hidden">
            <GradientMesh />
            <div className="relative">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-fuchsia-700 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-full px-3 py-1 mb-4">
                Prompt to product
              </div>
              <h2 className="text-2xl font-black tracking-tight leading-[1.05]">
                What do you want to{" "}
                <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">build</span>?
              </h2>
            </div>
          </div>
        )}

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-black/40 px-1 mb-1">Conversation</div>
        {status === "error" && (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 flex items-center justify-between gap-4">
            <span>{errorMsg}</span>
            <button
              onClick={() => generate(lastPromptRef.current)}
              className="shrink-0 px-4 py-2 rounded-full bg-white text-black text-xs font-bold"
            >
              Retry
            </button>
          </div>
        )}

        {/* Live build log -- shown while generating, replaces the old plain spinner */}
        {isLoading && (
          <div className="mt-6 rounded-[20px] border border-white/10 bg-zinc-950 p-5 font-mono text-[13px]">
            <div className="flex items-center justify-between mb-3 text-white/40">
              <span>{elapsed}s elapsed</span>
              {elapsed > 15 && (
                <span className="text-white/30">Full builds can take up to ~90s — still working</span>
              )}
            </div>
            <ul className="space-y-2">
              {STAGE_ORDER.map((key) => {
                const label = STAGE_LABELS[key];
                const idx = log.indexOf(label);
                const isDone = idx !== -1 && idx < log.length - 1;
                const isActive = idx === log.length - 1 && idx !== -1;
                const isPending = idx === -1;
                return (
                  <li
                    key={key}
                    className={
                      isPending
                        ? "text-white/25"
                        : isActive
                        ? "text-white"
                        : "text-white/50"
                    }
                  >
                    <span className="inline-block w-5">
                      {isDone ? "✓" : isActive ? "…" : "·"}
                    </span>
                    {label}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
            <div className="px-4 py-3 border-b border-black/10 shrink-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-black/40">Conversation</div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
              {historyVersions.length === 0 && !historyLoading && (
                <p className="text-[12px] text-black/40 px-1">Your edits will show up here as you go.</p>
              )}
              {historyLoading && historyVersions.length === 0 && (
                <p className="text-[12px] text-black/40 px-1">Loading…</p>
              )}
              {historyVersions
                .slice()
                .reverse()
                .map((v) => (
                  <button
                    key={v.id}
                    onClick={() => openVersion(v.id)}
                    className={`text-left px-3 py-2 rounded-xl border text-[12px] transition ${
                      v.id === projectId
                        ? "border-fuchsia-500/40 bg-fuchsia-500/10 text-black"
                        : "border-black/10 bg-black/[0.02] text-black/60 hover:bg-black/[0.05] hover:text-black/90"
                    }`}
                  >
                    <div className="line-clamp-2">{v.prompt}</div>
                    <div className="text-[10px] text-black/40 mt-1">
                      {new Date(v.created_at).toLocaleString()}
                      {v.id === projectId ? " • current" : ""}
                    </div>
                  </button>
                ))}
              {isLoading && (
                <div className="px-3 py-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 text-[12px] text-fuchsia-700 animate-pulse">
                  <div className="line-clamp-2">{lastPromptRef.current}</div>
                  <div className="text-[10px] text-fuchsia-600/70 mt-1">Building…</div>
                </div>
              )}
            </div>
        {/* Post-build "what's next" suggestions -- click one to iterate on
            this exact build (edit pass) instead of starting from scratch. */}
        {!isLoading && html && suggestions.length > 0 && (
          <div className="mt-6">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-40 mb-3">
              What do you want to add next?
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => generate(s, { asEdit: true })}
                  className="px-4 py-2 rounded-full border border-black/10 bg-black/[0.03] hover:bg-black/[0.06] text-[13px] font-medium transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
          </div>

          {/* Composer -- pinned at the bottom of the left pane, chat-app style */}
          <div className="shrink-0 border-t border-black/10 p-4">
        <div className="relative rounded-[26px] p-[1.5px] bg-gradient-to-r from-violet-600/40 via-fuchsia-500/40 to-violet-600/40">
          <div className="bg-white border border-black/5 rounded-[24.5px] p-4 flex flex-col gap-3 shadow-sm">
            {imageDataUrl && (
              <div className="flex items-center gap-3 bg-black/[0.03] border border-black/10 rounded-2xl px-3 py-2 self-start">
                <img src={imageDataUrl} alt="Attached reference" className="w-12 h-12 rounded-xl object-cover" />
                <span className="text-[12px] text-black/50">Reference image attached</span>
                <button
                  onClick={() => setImageDataUrl(null)}
                  className="text-black/40 hover:text-black text-[13px] font-bold px-2"
                  aria-label="Remove attached image"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex gap-3 min-w-0">
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  title="Attach a photo or illustration for reference"
                  className="h-[48px] w-[48px] sm:h-[56px] sm:w-[56px] shrink-0 grid place-items-center rounded-full bg-black/[0.04] border border-black/10 hover:bg-black/[0.08] disabled:opacity-40 transition"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && generate()}
                  placeholder="What do you want to build? e.g. a food delivery app with 6 dishes"
                  className="min-w-0 flex-1 h-[48px] sm:h-[56px] bg-white rounded-full px-5 sm:px-6 outline-none border border-black/10 focus:border-fuchsia-500/40 transition"
                  disabled={isLoading}
                />
              </div>
              {voiceSupported && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  disabled={isLoading}
                  title={isRecording ? "Stop dictating" : "Dictate your prompt"}
                  className={`h-[48px] w-[48px] sm:h-[56px] sm:w-[56px] shrink-0 grid place-items-center rounded-full border transition disabled:opacity-40 ${
                    isRecording
                      ? "bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-300 animate-pulse"
                      : "bg-black/[0.04] border-black/10 hover:bg-black/[0.08]"
                  }`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                    <path d="M19 10v2a7 7 0 01-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                  </svg>
                </button>
              )}
              <div
                role="group"
                aria-label="Model quality"
                title="Fast: default model, 1 credit. Best: flagship model, 2 credits -- for prompts that need a stronger attempt."
                className="hidden sm:flex items-center h-[56px] shrink-0 rounded-full border border-black/10 bg-black/[0.03] p-1 gap-0.5"
              >
                <button
                  type="button"
                  onClick={() => setTier("fast")}
                  disabled={isLoading}
                  className={`h-[40px] px-4 rounded-full text-[13px] font-bold transition disabled:opacity-40 ${
                    tier === "fast" ? "bg-white shadow-sm text-black" : "text-black/40 hover:text-black/70"
                  }`}
                >
                  Fast
                </button>
                <button
                  type="button"
                  onClick={() => setTier("best")}
                  disabled={isLoading}
                  className={`h-[40px] px-4 rounded-full text-[13px] font-bold transition disabled:opacity-40 ${
                    tier === "best" ? "bg-white shadow-sm text-black" : "text-black/40 hover:text-black/70"
                  }`}
                >
                  Best · 2×
                </button>
              </div>
              <button
                onClick={() => generate()}
                disabled={isLoading || !prompt.trim()}
                className="w-full sm:w-auto h-[48px] sm:h-[56px] px-6 sm:px-8 rounded-full bg-black text-white font-black disabled:opacity-40 shrink-0 hover:opacity-90 transition"
              >
                {isLoading ? "Building…" : html ? "Rebuild →" : "Generate →"}
              </button>
            </div>
            {imageError && <p className="text-[12px] text-red-600 px-2">{imageError}</p>}
            {tier === "best" && (
              <p className="text-[11px] text-black/35 px-2">Best quality uses the flagship model and costs 2× credits for this build.</p>
            )}
          </div>
          </div>
        </div>

        {/* RIGHT PANE -- live preview / code, fills remaining height */}
        <div className="hidden lg:flex flex-1 min-w-0 min-h-0 flex-col bg-white">
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {!isLoading && html && (
            <>
              <div className="flex items-center justify-between gap-2 px-4 py-2 bg-zinc-100 border-b border-black/10 flex-wrap">
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => setView("preview")}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                      view === "preview" ? "bg-black text-white" : "text-black/50"
                    }`}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setView("code")}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                      view === "code" ? "bg-black text-white" : "text-black/50"
                    }`}
                  >
                    Code
                  </button>
                  {view === "preview" && projectId && !quickEdit && (
                    <button
                      onClick={toggleQuickEdit}
                      title="Click text to edit it directly, or alt/option-click an element to recolor it"
                      className="px-3 py-1.5 rounded-full text-xs font-bold border border-black/15 text-black/70 hover:bg-black/5 transition"
                    >
                      Quick edit
                    </button>
                  )}
                  {view === "preview" && quickEdit && (
                    <div className="flex items-center gap-1.5">
                      <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">
                        Editing -- click text to edit, alt-click to recolor
                      </span>
                      <button
                        onClick={saveQuickEdit}
                        disabled={quickEditSaving}
                        className="px-3 py-1.5 rounded-full text-xs font-bold bg-black text-white disabled:opacity-40"
                      >
                        {quickEditSaving ? "Saving…" : "Save changes"}
                      </button>
                      <button
                        onClick={discardQuickEdit}
                        disabled={quickEditSaving}
                        className="px-3 py-1.5 rounded-full text-xs font-bold border border-black/15 text-black/60 hover:bg-black/5 disabled:opacity-40"
                      >
                        Discard
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {view === "code" && (
                    <button
                      onClick={copyCode}
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-black text-white"
                    >
                      Copy code
                    </button>
                  )}
                  {projectId && (
                    <a
                      href={`/publish/${projectId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-violet-600 text-white"
                    >
                      Publish / view live →
                    </a>
                  )}
                  {projectId && shareUrl && (
                    <ShareButton url={shareUrl} title={prompt} variant="light" />
                  )}
                  {projectId && (
                    <button
                      onClick={() => setGithubPanelOpen(true)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold border border-black/15 text-black/70 hover:bg-black/5 transition"
                    >
                      Push to GitHub
                    </button>
                  )}
                  {projectId && (
                    <button
                      onClick={() => setDataImportOpen(true)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                        pendingDataBlock
                          ? "border-emerald-600/30 text-emerald-700 bg-emerald-50"
                          : "border-black/15 text-black/70 hover:bg-black/5"
                      }`}
                    >
                      {pendingDataBlock ? "Data ready \u2713" : "Import data"}
                    </button>
                  )}
                  {projectId && (
                    <button
                      onClick={() => setIntegrationsOpen(true)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold border border-black/15 text-black/70 hover:bg-black/5 transition"
                    >
                      Integrations
                    </button>
                  )}
                  {projectId && (
                    <button
                      onClick={toggleHistory}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                        historyOpen ? "bg-black text-white border-black" : "border-black/15 text-black/70 hover:bg-black/5"
                      }`}
                    >
                      History
                    </button>
                  )}
                  {projectId && isAdmin && (
                    <button
                      onClick={toggleTemplate}
                      disabled={templateLoading}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition disabled:opacity-40 ${
                        isTemplate
                          ? "border-fuchsia-600/30 text-fuchsia-700 bg-fuchsia-50"
                          : "border-black/15 text-black/70 hover:bg-black/5"
                      }`}
                    >
                      {isTemplate ? "Featured as template" : "Feature as template"}
                    </button>
                  )}
                  {projectId && (
                    <button
                      onClick={toggleDomainPanel}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                        domainOpen
                          ? "bg-black text-white border-black"
                          : domainState.status === "verified"
                          ? "border-emerald-600/30 text-emerald-700 bg-emerald-50"
                          : domainState.status === "pending"
                          ? "border-amber-500/30 text-amber-700 bg-amber-50"
                          : "border-black/15 text-black/70 hover:bg-black/5"
                      }`}
                    >
                      {domainState.status === "verified" ? "Domain connected" : domainState.status === "pending" ? "Domain pending" : "Custom domain"}
                    </button>
                  )}
                  {projectId && (
                    <div className="relative group">
                      {(!backend || backend.status === "none" || backend.status === "disconnected") && (
                        <button
                          onClick={connectDatabase}
                          className="px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-600/30 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition"
                        >
                          Connect database
                        </button>
                      )}
                      {(backend?.status === "connecting" || backend?.status === "provisioning") && (
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold border border-amber-500/30 text-amber-700 bg-amber-50 inline-flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Setting up database…
                        </span>
                      )}
                      {backend?.status === "active" && (
                        <button
                          onClick={disconnectDatabase}
                          title="Click to disconnect"
                          className="px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-600/30 text-emerald-700 bg-emerald-50 inline-flex items-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Database connected
                        </button>
                      )}
                      {backend?.status === "error" && (
                        <button
                          onClick={connectDatabase}
                          title={backend.error_message || "Try again"}
                          className="px-3 py-1.5 rounded-full text-xs font-bold border border-red-500/30 text-red-700 bg-red-50 hover:bg-red-100 transition"
                        >
                          Database failed — retry
                        </button>
                      )}
                    </div>
                  )}
                  {projectId && (
                    <a
                      href={`/publish/${projectId}/app-stores`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-full text-xs font-bold border border-black/15 text-black/70"
                    >
                      App Store / Play Store →
                    </a>
                  )}
                  {projectId && !published && (
                    <button
                      onClick={() => {
                        if (!publishTitle) setPublishTitle(prompt.slice(0, 80));
                        setPublishOpen((v) => !v);
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-fuchsia-600 text-white"
                    >
                      Share to BuildGuild
                    </button>
                  )}
                  {projectId && published && (
                    <a
                      href={`/buildguild/${projectId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-600 text-white"
                    >
                      Live on BuildGuild →
                    </a>
                  )}
                </div>
              </div>

              {publishOpen && !published && (
                <div className="px-4 py-4 bg-fuchsia-50 border-b border-black/10 flex flex-col gap-2">
                  <input
                    value={publishTitle}
                    onChange={(e) => setPublishTitle(e.target.value)}
                    placeholder="Title (shown on BuildGuild)"
                    maxLength={120}
                    className="w-full h-10 px-4 rounded-full border border-black/10 text-black text-[13px] outline-none"
                  />
                  <input
                    value={publishTagline}
                    onChange={(e) => setPublishTagline(e.target.value)}
                    placeholder="One-line tagline (optional)"
                    maxLength={200}
                    className="w-full h-10 px-4 rounded-full border border-black/10 text-black text-[13px] outline-none"
                  />
                  {publishError && <p className="text-[12px] text-red-600">{publishError}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setPublishOpen(false)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold text-black/50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={publishToBuildGuild}
                      disabled={!publishTitle.trim() || publishing}
                      className="px-4 py-1.5 rounded-full text-xs font-bold bg-black text-white disabled:opacity-40"
                    >
                      {publishing ? "Publishing…" : "Publish to BuildGuild"}
                    </button>
                  </div>
                </div>
              )}
              {published && (
                <div className="px-4 py-2.5 bg-emerald-50 border-b border-black/10 text-emerald-700 text-[12px] font-semibold">
                  Live on BuildGuild — anyone can view and comment on it now.
                </div>
              )}

              {isAdmin && isTemplate && (
                <div className="px-4 py-4 bg-fuchsia-50 border-b border-black/10">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-black/40 mb-2">
                    Template gallery details
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Display name (shown on the template card)"
                      maxLength={120}
                      className="w-full h-10 px-4 rounded-full border border-black/10 text-black text-[13px] outline-none"
                    />
                    <input
                      value={templateBlurb}
                      onChange={(e) => setTemplateBlurb(e.target.value)}
                      placeholder="One-line description (optional)"
                      maxLength={160}
                      className="w-full h-10 px-4 rounded-full border border-black/10 text-black text-[13px] outline-none"
                    />
                    <div className="flex justify-end items-center gap-3">
                      {templateMetaSaved && (
                        <span className="text-[12px] text-fuchsia-700 font-semibold">Saved</span>
                      )}
                      <button
                        onClick={saveTemplateMeta}
                        disabled={templateMetaSaving}
                        className="px-4 py-1.5 rounded-full text-xs font-bold bg-black text-white disabled:opacity-40"
                      >
                        {templateMetaSaving ? "Saving…" : "Save details"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {domainOpen && (
                <div className="px-4 py-4 bg-zinc-50 border-b border-black/10">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-black/40 mb-2">
                    Custom domain
                  </div>
                  {domainError && <p className="text-[12px] text-red-600 mb-2">{domainError}</p>}
                  {!domainState.domain && (
                    <div className="flex gap-2">
                      <input
                        value={domainInput}
                        onChange={(e) => setDomainInput(e.target.value)}
                        placeholder="myapp.com"
                        className="flex-1 h-10 px-4 rounded-full border border-black/10 text-black text-[13px] outline-none"
                      />
                      <button
                        onClick={connectDomain}
                        disabled={!domainInput.trim() || domainLoading}
                        className="px-4 py-1.5 rounded-full text-xs font-bold bg-black text-white disabled:opacity-40"
                      >
                        {domainLoading ? "Connecting…" : "Connect"}
                      </button>
                    </div>
                  )}
                  {domainState.domain && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[13px] font-semibold text-black">{domainState.domain}</div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={toggleDomainPanel}
                            disabled={domainLoading}
                            className="text-[12px] text-black/50 hover:text-black underline"
                          >
                            Refresh status
                          </button>
                          <button
                            onClick={disconnectDomain}
                            disabled={domainLoading}
                            className="text-[12px] text-red-600 hover:text-red-700 underline"
                          >
                            Disconnect
                          </button>
                        </div>
                      </div>
                      {domainState.status === "verified" ? (
                        <p className="text-[12px] text-emerald-700">Verified -- this domain now serves this build.</p>
                      ) : (
                        <div className="text-[12px] text-black/60 flex flex-col gap-2">
                          <p>Not verified yet. Add this DNS record at your domain registrar, then click Refresh status:</p>
                          {domainState.verification.map((v, i) => (
                            <div key={i} className="bg-white border border-black/10 rounded-lg px-3 py-2 font-mono text-[11px] text-black/80">
                              <div>Type: {v.type}</div>
                              <div>Name: {v.domain}</div>
                              <div className="break-all">Value: {v.value}</div>
                            </div>
                          ))}
                          {domainState.verification.length === 0 && (
                            <p>Checking verification requirements…</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {historyOpen && (
                <div className="px-4 py-4 bg-zinc-50 border-b border-black/10">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-black/40 mb-2">
                    Version history
                  </div>
                  {historyLoading && <p className="text-[13px] text-black/50">Loading…</p>}
                  {historyError && <p className="text-[12px] text-red-600">{historyError}</p>}
                  {!historyLoading && !historyError && historyVersions.length === 0 && (
                    <p className="text-[13px] text-black/50">No earlier versions yet -- edits you make will show up here.</p>
                  )}
                  <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto">
                    {historyVersions
                      .slice()
                      .reverse()
                      .map((v) => (
                        <button
                          key={v.id}
                          onClick={() => openVersion(v.id)}
                          className={`text-left px-3 py-2 rounded-lg border text-[13px] transition ${
                            v.id === projectId
                              ? "border-black bg-white font-semibold text-black"
                              : "border-black/10 bg-white/60 text-black/70 hover:bg-white"
                          }`}
                        >
                          <div className="line-clamp-1">{v.prompt}</div>
                          <div className="text-[11px] text-black/40 mt-0.5">
                            {new Date(v.created_at).toLocaleString()}
                            {v.id === projectId ? " • currently viewing" : ""}
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {view === "preview" ? (
                <>
                  <iframe
                    key={previewReloadKey}
                    ref={previewIframeRef}
                    srcDoc={html}
                    sandbox="allow-scripts allow-same-origin"
                    className="w-full flex-1 min-h-0 border-0 bg-white"
                    title="Generated app preview"
                    onLoad={() => {
                      if (quickEdit) activateQuickEdit();
                    }}
                  />
                  {quickEdit && quickEditSelection && (
                    <div className="flex items-center gap-4 px-4 py-2.5 bg-fuchsia-50 border-t border-fuchsia-100 text-xs">
                      <span className="font-mono text-fuchsia-700/70">{quickEditSelection.tag}</span>
                      <label className="flex items-center gap-1.5 font-bold text-black/60">
                        Text
                        <input
                          type="color"
                          value={quickEditSelection.color}
                          onChange={(e) => applySelectionColor("color", e.target.value)}
                          className="w-6 h-6 rounded border border-black/10 cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 font-bold text-black/60">
                        Background
                        <input
                          type="color"
                          value={quickEditSelection.background}
                          onChange={(e) => applySelectionColor("background", e.target.value)}
                          className="w-6 h-6 rounded border border-black/10 cursor-pointer"
                        />
                      </label>
                    </div>
                  )}
                  {quickEditMsg && (
                    <div className="px-4 py-2 bg-black text-white text-xs font-bold">{quickEditMsg}</div>
                  )}
                </>
              ) : (
                <pre className="w-full flex-1 min-h-0 overflow-auto bg-zinc-950 text-zinc-200 text-[12px] leading-[1.6] p-5 m-0">
                  <code>{html}</code>
                </pre>
              )}
            </>
          )}

          {!isLoading && !html && (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-black/30 text-sm px-8 text-center gap-3">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-20">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <path d="M3 15l4.5-4.5a2 2 0 012.8 0L15 15" />
                <circle cx="9" cy="8.5" r="1.5" />
              </svg>
              Your preview shows up here once you generate something.
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
      {githubPanelOpen && projectId && (
        <GitHubPushPanel projectId={projectId} onClose={() => setGithubPanelOpen(false)} />
      )}
      {dataImportOpen && projectId && (
        <DataImportPanel projectId={projectId} onClose={() => setDataImportOpen(false)} onConnected={handleDataConnected} />
      )}
      {integrationsOpen && projectId && (
        <IntegrationsPanel projectId={projectId} onClose={() => setIntegrationsOpen(false)} />
      )}
    </div>
  );
}
