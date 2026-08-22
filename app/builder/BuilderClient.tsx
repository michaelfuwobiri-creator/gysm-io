"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import ShareButton from "@/app/components/ShareButton";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const toggleHistory = useCallback(async () => {
    if (!projectId) return;
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryOpen(true);
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
  }, [projectId, historyOpen]);

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
          }),
        });

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
    [prompt, html, router, imageDataUrl]
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
    <div className="min-h-screen bg-black text-white relative overflow-x-hidden">
      {/* Soft ambient glow behind the whole page -- same violet/fuchsia
          identity as the marketing site, so the builder doesn't feel like
          a separate, plainer tool bolted onto a polished landing page. */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 blur-[120px]" />
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

      <div className="max-w-6xl mx-auto p-6 relative">
        <div className="flex justify-between items-center py-4 border-b border-white/10 mb-8">
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
                className="text-[12px] font-medium text-white/50 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-full transition"
              >
                New build
              </button>
            )}
            <a href="/buildguild" className="text-[12px] font-medium text-white/50 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-full transition">
              BuildGuild
            </a>
            <a href="/dashboard" className="text-[12px] font-medium text-white/50 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-full transition">
              My Builds
            </a>
            <div className="ml-1">
              <OrganizationSwitcher
                afterCreateOrganizationUrl="/dashboard"
                afterSelectOrganizationUrl="/dashboard"
                afterSelectPersonalUrl="/dashboard"
                afterLeaveOrganizationUrl="/dashboard"
                appearance={{ elements: { organizationSwitcherTrigger: "text-white" } }}
              />
            </div>
            <div className="ml-1">
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </div>

        {!html && !isLoading && (
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-fuchsia-400/90 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-full px-3 py-1 mb-4">
              Prompt to product
            </div>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-[1.05]">
              What do you want to{" "}
              <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">build</span>?
            </h2>
          </div>
        )}

        <div className="relative rounded-[26px] p-[1.5px] bg-gradient-to-r from-violet-600/40 via-fuchsia-500/40 to-violet-600/40">
          <div className="bg-[#0A0A0A] border border-white/5 rounded-[24.5px] p-4 flex flex-col gap-3">
            {imageDataUrl && (
              <div className="flex items-center gap-3 bg-white/[0.04] border border-white/10 rounded-2xl px-3 py-2 self-start">
                <img src={imageDataUrl} alt="Attached reference" className="w-12 h-12 rounded-xl object-cover" />
                <span className="text-[12px] text-white/50">Reference image attached</span>
                <button
                  onClick={() => setImageDataUrl(null)}
                  className="text-white/40 hover:text-white text-[13px] font-bold px-2"
                  aria-label="Remove attached image"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
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
                  className="h-[48px] w-[48px] sm:h-[56px] sm:w-[56px] shrink-0 grid place-items-center rounded-full bg-white/[0.06] border border-white/10 hover:bg-white/10 disabled:opacity-40 transition"
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
                  className="min-w-0 flex-1 h-[48px] sm:h-[56px] bg-black rounded-full px-5 sm:px-6 outline-none border border-white/10 focus:border-fuchsia-500/40 transition"
                  disabled={isLoading}
                />
              </div>
              <button
                onClick={() => generate()}
                disabled={isLoading || !prompt.trim()}
                className="w-full sm:w-auto h-[48px] sm:h-[56px] px-6 sm:px-8 rounded-full bg-white text-black font-black disabled:opacity-40 shrink-0 hover:bg-fuchsia-50 transition"
              >
                {isLoading ? "Building…" : html ? "Rebuild →" : "Generate →"}
              </button>
            </div>
            {imageError && <p className="text-[12px] text-red-400 px-2">{imageError}</p>}
          </div>
        </div>

        {status === "error" && (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200 flex items-center justify-between gap-4">
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

        <div className="mt-6 rounded-[20px] overflow-hidden border border-white/10 bg-white min-h-[600px] shadow-[0_0_60px_-15px_rgba(217,70,239,0.15)]">
          {!isLoading && html && (
            <>
              <div className="flex items-center justify-between px-4 py-2 bg-zinc-100 border-b border-black/10">
                <div className="flex gap-1">
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
                </div>
                <div className="flex items-center gap-2">
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
                <iframe
                  srcDoc={html}
                  sandbox="allow-scripts allow-same-origin"
                  className="w-full h-[700px] border-0 bg-white"
                  title="Generated app preview"
                />
              ) : (
                <pre className="w-full h-[700px] overflow-auto bg-zinc-950 text-zinc-200 text-[12px] leading-[1.6] p-5 m-0">
                  <code>{html}</code>
                </pre>
              )}
            </>
          )}

          {!isLoading && !html && (
            <div className="h-[750px] flex flex-col items-center justify-center text-black/30 text-sm px-8 text-center gap-3">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-20">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <path d="M3 15l4.5-4.5a2 2 0 012.8 0L15 15" />
                <circle cx="9" cy="8.5" r="1.5" />
              </svg>
              Your preview shows up here once you generate something.
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
                  className="px-4 py-2 rounded-full border border-white/15 bg-white/[0.04] hover:bg-white/10 text-[13px] font-medium transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="h-20" />
      </div>
    </div>
  );
}
