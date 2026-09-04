"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useBuilderBlocksStore } from "@/store/builderBlocksStore";
import { generateHtml } from "@/lib/builderBlocks/codeGenerator";

// Heavy editor, loaded only when the Code modal actually opens -- no
// reason to ship Monaco's bundle to every visitor of the canvas.
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false, loading: () => <div className="p-6 text-[13px] opacity-40">Loading editor...</div> });

export default function TopBar() {
  const router = useRouter();
  const { projectId, projectName, blocks, isDirty, markSaved } = useBuilderBlocksStore();
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  async function save(): Promise<string | null> {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(projectId ? `/api/builder-blocks/${projectId}` : "/api/builder-blocks", {
        method: projectId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, blocks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      markSaved(data.id);
      return data.id as string;
    } catch (e: any) {
      setError(e?.message || "Save failed.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function deploy() {
    setDeploying(true);
    setError("");
    try {
      const id = projectId && !isDirty ? projectId : await save();
      if (!id) return;
      const res = await fetch(`/api/builder-blocks/${id}/export`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deploy failed.");
      router.push("/dashboard");
    } catch (e: any) {
      setError(e?.message || "Deploy failed.");
    } finally {
      setDeploying(false);
    }
  }

  const code = generateHtml(blocks, projectName);

  return (
    <>
      <div className="h-14 shrink-0 border-b border-black/10 bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <a href="/dashboard" className="text-[12px] font-semibold opacity-50 hover:opacity-100 mr-2">← Dashboard</a>
          <span className="text-[13px] font-bold">{projectName}</span>
          {isDirty && <span className="text-[10px] uppercase tracking-wide font-bold opacity-40">Unsaved</span>}
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-[12px] text-red-500 mr-2">{error}</span>}
          <button onClick={() => setShowPreview(true)} className="text-[13px] font-semibold px-3 py-1.5 rounded-full border border-black/15 hover:bg-black/5">
            Preview
          </button>
          <button onClick={() => setShowCode(true)} className="text-[13px] font-semibold px-3 py-1.5 rounded-full border border-black/15 hover:bg-black/5">
            Code
          </button>
          <button onClick={save} disabled={saving} className="text-[13px] font-semibold px-3 py-1.5 rounded-full border border-black/15 hover:bg-black/5 disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={deploy} disabled={deploying || blocks.length === 0} className="text-[13px] font-bold px-4 py-1.5 rounded-full bg-[#FF0080] text-white disabled:opacity-40">
            {deploying ? "Deploying..." : "Deploy"}
          </button>
        </div>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-[200] bg-black/60 grid place-items-center p-6" onClick={() => setShowPreview(false)}>
          <div className="w-full max-w-[900px] h-[80vh] bg-white rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="h-11 flex items-center justify-between px-4 border-b border-black/10">
              <span className="text-[12px] font-bold opacity-50">Preview</span>
              <button onClick={() => setShowPreview(false)} className="text-[12px] font-semibold opacity-50 hover:opacity-100">Close</button>
            </div>
            <iframe title="Preview" srcDoc={code} className="w-full h-[calc(100%-44px)]" sandbox="allow-scripts" />
          </div>
        </div>
      )}

      {showCode && (
        <div className="fixed inset-0 z-[200] bg-black/60 grid place-items-center p-6" onClick={() => setShowCode(false)}>
          <div className="w-full max-w-[900px] h-[80vh] bg-[#1e1e1e] rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="h-11 flex items-center justify-between px-4 border-b border-white/10">
              <span className="text-[12px] font-bold text-white/60">Generated code (read-only)</span>
              <button onClick={() => setShowCode(false)} className="text-[12px] font-semibold text-white/60 hover:text-white">Close</button>
            </div>
            <MonacoEditor
              height="calc(80vh - 44px)"
              defaultLanguage="html"
              value={code}
              theme="vs-dark"
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
            />
          </div>
        </div>
      )}
    </>
  );
}
