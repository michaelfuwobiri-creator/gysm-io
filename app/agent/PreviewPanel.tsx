"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bundlePreview, resolveRef, type PreviewFile } from "@/lib/previewBundle";

// Preview panel: shows the site the agent built, from the user's workspace,
// before anything is deployed. The page runs in a sandboxed iframe with no
// access to GYSM (no same-origin, no cookies).

export default function PreviewPanel({
  project,
  refreshKey,
  canDeploy,
  onDeploy,
  onClose,
}: {
  project: string;
  refreshKey: number;
  canDeploy: boolean;
  onDeploy: () => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<PreviewFile[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [entry, setEntry] = useState<string | undefined>(undefined);
  const [phone, setPhone] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/agent/preview?project=${encodeURIComponent(project)}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFiles(null);
        setError(j?.error || "Couldn't load the preview.");
      } else setFiles(Array.isArray(j.files) ? j.files : []);
    } catch {
      setFiles(null);
      setError("Couldn't load the preview. Check your connection and refresh.");
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => {
    setEntry(undefined);
    setFiles(null);
  }, [project]);
  useEffect(() => {
    void load();
  }, [load, refreshKey, tick]);

  const bundle = useMemo(() => (files ? bundlePreview(files, entry) : null), [files, entry]);

  // Links between pages of the site arrive here from the iframe.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const href = e.data?.gysmPreviewNav;
      if (typeof href !== "string" || !bundle || !("html" in bundle)) return;
      const dir = bundle.entry.includes("/") ? bundle.entry.slice(0, bundle.entry.lastIndexOf("/")) : "";
      let target = resolveRef(dir, href);
      if (target && !bundle.pages.includes(target) && bundle.pages.includes(`${target}/index.html`)) target = `${target}/index.html`;
      if (target && bundle.pages.includes(target)) setEntry(target);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [bundle]);

  return (
    <aside className="gb-preview" aria-label={`Preview of ${project}`}>
      <div className="gb-pv-head">
        <div className="gb-pv-title">
          <b>Preview</b>
          <span title={project}>{project}</span>
        </div>
        <div className="gb-pv-tools">
          {bundle && "pages" in bundle && bundle.pages.length > 1 && (
            <select aria-label="Page" value={bundle.entry} onChange={(e) => setEntry(e.target.value)} className="gb-pv-select">
              {bundle.pages.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
          <div className="gb-seg" role="group" aria-label="Screen size">
            <button type="button" aria-pressed={!phone} onClick={() => setPhone(false)}>
              Desktop
            </button>
            <button type="button" aria-pressed={phone} onClick={() => setPhone(true)}>
              Phone
            </button>
          </div>
          <button type="button" className="gb-ghost" onClick={() => setTick((t) => t + 1)} disabled={loading} aria-label="Refresh preview">
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button type="button" className="gb-ghost" onClick={onClose} aria-label="Close preview">
            Close
          </button>
        </div>
      </div>

      <div className="gb-pv-body">
        {error ? (
          <div className="gb-pv-msg">{error}</div>
        ) : bundle && "error" in bundle ? (
          <div className="gb-pv-msg">{bundle.error}</div>
        ) : bundle && "html" in bundle ? (
          <div className={`gb-pv-stage${phone ? " phone" : ""}`}>
            <iframe ref={frameRef} title={`Preview of ${project}`} sandbox="allow-scripts allow-forms allow-popups" srcDoc={bundle.html} />
          </div>
        ) : (
          <div className="gb-pv-msg">Loading your site…</div>
        )}
      </div>

      <div className="gb-pv-foot">
        <span>This is your workspace copy. It is not live yet.</span>
        {canDeploy ? (
          <button type="button" className="gb-primary" onClick={onDeploy}>
            Deploy this site
          </button>
        ) : (
          <span className="gb-pv-hint">Approve the deploy in the chat when you are happy.</span>
        )}
      </div>
    </aside>
  );
}
