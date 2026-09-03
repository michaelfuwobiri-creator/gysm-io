"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/voiie/_components/icons";
import { apiPost } from "@/app/voiie/_components/api";
import { TOTAL_QUESTIONS, getQuestionAt } from "@/lib/voiie/consultation";
import type { Toast } from "@/app/voiie/_components/useToasts";
import type { LeadDetail } from "@/app/voiie/_components/types";
import type { VoiieQuestion } from "@/types/voiie";

const PLATFORM_META: Record<string, { color: string; Icon: typeof Icon.twitter }> = {
  twitter: { color: "#1d9bf0", Icon: Icon.twitter },
  threads: { color: "#f8fafc", Icon: Icon.threads },
  manual: { color: "#8b5cf6", Icon: Icon.bolt },
};

function QuestionInput({ q, submitting, onSubmit }: { q: VoiieQuestion; submitting: boolean; onSubmit: (value: string) => void }) {
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [domainStatus, setDomainStatus] = useState<"first-timer" | "existing">("first-timer");
  const [domainVal, setDomainVal] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name: string; dataUrl: string } | null>(null);
  const [colorsVal, setColorsVal] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMultiSel([]);
    setText("");
    setDomainStatus("first-timer");
    setDomainVal("");
    setFileInfo(null);
    setColorsVal("");
  }, [q.key]);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFileInfo({ name: file.name, dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  // The server-side parser (lib/voiie/consultation.ts's parseChatReply)
  // re-derives structured answers from plain text, the same way a real
  // WhatsApp/Twitter reply would arrive -- so every input type here just
  // needs to produce a reasonable plain-text reply, not a structured
  // payload.

  if (q.type === "single") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {q.options!.map((opt) => (
          <button key={opt} className="qbtn" disabled={submitting} onClick={() => onSubmit(opt)}>
            {opt}
          </button>
        ))}
      </div>
    );
  }

  if (q.type === "multi") {
    const toggle = (opt: string) => setMultiSel((s) => (s.includes(opt) ? s.filter((x) => x !== opt) : [...s, opt]));
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          {q.options!.map((opt) => (
            <div key={opt} className={"chip " + (multiSel.includes(opt) ? "active" : "")} onClick={() => toggle(opt)}>
              {opt}
            </div>
          ))}
        </div>
        <button
          disabled={multiSel.length === 0 || submitting}
          onClick={() => onSubmit(multiSel.join(", "))}
          className="grad-fv"
          style={{ alignSelf: "flex-start", fontSize: 11.5, fontWeight: 700, padding: "7px 16px", borderRadius: 9999, color: "#fff", opacity: multiSel.length === 0 ? 0.35 : 1 }}
        >
          Confirm selection ({multiSel.length})
        </button>
      </div>
    );
  }

  if (q.type === "domain") {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2">
          <button
            className="qbtn"
            style={{ flex: 1, background: domainStatus === "first-timer" ? "var(--fuchsia-soft)" : undefined, borderColor: domainStatus === "first-timer" ? "rgba(255,0,128,.5)" : undefined }}
            onClick={() => setDomainStatus("first-timer")}
          >
            First-timer, no site yet
          </button>
          <button
            className="qbtn"
            style={{ flex: 1, background: domainStatus === "existing" ? "var(--fuchsia-soft)" : undefined, borderColor: domainStatus === "existing" ? "rgba(255,0,128,.5)" : undefined }}
            onClick={() => setDomainStatus("existing")}
          >
            Already have a site
          </button>
        </div>
        {domainStatus === "existing" && (
          <input
            value={domainVal}
            onChange={(e) => setDomainVal(e.target.value)}
            placeholder="yourcurrentsite.com"
            style={{ background: "#08080a", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, color: "var(--text)" }}
          />
        )}
        <button
          disabled={submitting}
          onClick={() => onSubmit(domainStatus === "existing" ? domainVal || "existing site" : "no site yet")}
          className="grad-fv"
          style={{ alignSelf: "flex-start", fontSize: 11.5, fontWeight: 700, padding: "7px 16px", borderRadius: 9999, color: "#fff" }}
        >
          Continue
        </button>
      </div>
    );
  }

  if (q.type === "file") {
    return (
      <div className="flex flex-col gap-2.5">
        <div
          className={"drop-zone " + (dragging ? "drag" : "")}
          style={{ padding: 18, textAlign: "center", cursor: "pointer" }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files[0]);
          }}
        >
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
          {fileInfo ? (
            <div className="flex items-center gap-3" style={{ justifyContent: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileInfo.dataUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", border: "1px solid var(--border)" }} />
              <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{fileInfo.name}</div>
            </div>
          ) : (
            <>
              <Icon.upload style={{ width: 20, height: 20, color: "var(--fuchsia)", margin: "0 auto 6px" }} />
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Drop logo / photos here, or click to browse</div>
            </>
          )}
        </div>
        <input
          value={colorsVal}
          onChange={(e) => setColorsVal(e.target.value)}
          placeholder="Brand colors or sites you like (optional)"
          style={{ background: "#08080a", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, color: "var(--text)" }}
        />
        <button
          disabled={submitting}
          onClick={() => onSubmit(fileInfo ? `Uploaded ${fileInfo.name}${colorsVal ? `, colors: ${colorsVal}` : ""}` : "no file uploaded")}
          className="grad-fv"
          style={{ alignSelf: "flex-start", fontSize: 11.5, fontWeight: 700, padding: "7px 16px", borderRadius: 9999, color: "#fff" }}
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) onSubmit(text.trim());
        }}
        placeholder={q.placeholder || "Type your answer..."}
        style={{ flex: 1, background: "#08080a", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, color: "var(--text)" }}
      />
      {q.type === "contact" && <Icon.whatsapp style={{ width: 18, height: 18, color: "var(--fuchsia)", alignSelf: "center" }} />}
      <button
        disabled={!text.trim() || submitting}
        onClick={() => text.trim() && onSubmit(text.trim())}
        style={{ width: 36, height: 36, borderRadius: 9999, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: text.trim() ? 1 : 0.35 }}
        className="grad-fv"
      >
        <Icon.send style={{ width: 14, height: 14, color: "#fff" }} />
      </button>
    </div>
  );
}

export function CenterPanel({
  lead,
  loading,
  onAnswered,
  onLeadsChanged,
  pushToast,
}: {
  lead: LeadDetail | null;
  loading: boolean;
  onAnswered: () => void;
  onLeadsChanged: () => void;
  pushToast: (text: string, tone?: Toast["tone"]) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [freeText, setFreeText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [building, setBuilding] = useState(false);

  const answered = lead ? Object.keys(lead.consultation.answers ?? {}).length : 0;
  const pct = Math.round((answered / TOTAL_QUESTIONS) * 100);
  const currentQ = lead ? getQuestionAt(lead.consultation.currentQuestion) : undefined;
  const isComplete = answered >= TOTAL_QUESTIONS;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lead?.messages.length, lead?.lead.id]);

  const submitAnswer = async (value: string) => {
    if (!lead) return;
    setSubmitting(true);
    try {
      await apiPost(`/api/voiie/consultation/${lead.lead.id}`, { reply: value });
      onAnswered();
      onLeadsChanged();
    } catch (err) {
      pushToast((err as Error).message, "cyan");
    } finally {
      setSubmitting(false);
    }
  };

  const buildDemo = async () => {
    if (!lead) return;
    setBuilding(true);
    pushToast("Building free demo with the GYSM.IO builder...", "fuchsia");
    try {
      const result = await apiPost<{ publicUrl: string }>(`/api/voiie/demo/${lead.lead.id}`);
      pushToast(`Demo live: ${result.publicUrl}`, "fuchsia");
      onAnswered();
      onLeadsChanged();
    } catch (err) {
      pushToast((err as Error).message, "cyan");
    } finally {
      setBuilding(false);
    }
  };

  if (!lead) {
    return (
      <div style={{ width: 420, flexShrink: 0, background: "var(--bg)" }} className="flex items-center justify-center">
        <span style={{ color: "var(--text-ghost)", fontSize: 13 }}>{loading ? "Loading..." : "Select a lead to open consultation"}</span>
      </div>
    );
  }

  const meta = PLATFORM_META[lead.lead.platform] ?? PLATFORM_META.twitter;

  return (
    <div style={{ width: 420, flexShrink: 0, background: "var(--bg)", borderRight: "1px solid var(--border)" }} className="flex flex-col h-full">
      <div style={{ height: 59, flexShrink: 0, background: "var(--panel-2)", borderBottom: "1px solid var(--border)", padding: "0 16px" }} className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="avatar-grad" style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>
            {lead.lead.handle.replace("@", "")[0]?.toUpperCase() ?? "V"}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: 13, fontWeight: 700 }}>{lead.lead.handle}</span>
              <meta.Icon style={{ width: 11, height: 11, color: meta.color }} />
            </div>
            <span className={"status-pill status-" + lead.lead.status} style={{ marginTop: 2, display: "inline-block" }}>
              {lead.lead.status}
              {lead.lead.status === "consulting" ? ` ${answered}/12` : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {lead.lead.contact_phone && (
            <div title={lead.lead.contact_phone} style={{ width: 26, height: 26, borderRadius: 8, background: "var(--fuchsia-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon.phone style={{ width: 12, height: 12, color: "var(--fuchsia)" }} />
            </div>
          )}
          {lead.lead.contact_email && (
            <div title={lead.lead.contact_email} style={{ width: 26, height: 26, borderRadius: 8, background: "var(--fuchsia-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon.mail style={{ width: 12, height: 12, color: "var(--fuchsia)" }} />
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "10px 16px 0" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <span className="font-mono" style={{ fontSize: 10, color: "var(--text-ghost)", letterSpacing: ".03em" }}>
            CONSULTATION PROGRESS
          </span>
          <span className="font-mono grad-fv-text" style={{ fontSize: 11, fontWeight: 700 }}>
            {answered}/12 &middot; {pct}%
          </span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: pct + "%" }} />
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-3" style={{ padding: 16 }}>
        {lead.messages.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-ghost)", textAlign: "center", marginTop: 20 }}>
            No conversation yet. Hunter hasn&apos;t reached out to {lead.lead.handle}.
          </div>
        )}
        {lead.messages.map((m) =>
          m.direction === "outbound" ? (
            <div key={m.id} className="flex gap-2" style={{ maxWidth: "85%" }}>
              <div className="avatar-grad" style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, marginTop: 2 }}>
                G
              </div>
              <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "12px 12px 12px 4px", padding: "9px 12px", fontSize: 12.5, color: "rgba(248,250,252,.92)", lineHeight: 1.5 }}>
                {m.body}
              </div>
            </div>
          ) : (
            <div
              key={m.id}
              style={{ alignSelf: "flex-end", maxWidth: "75%", background: "#f8fafc", color: "#08080a", borderRadius: "12px 12px 4px 12px", padding: "9px 12px", fontSize: 12.5, lineHeight: 1.5, fontWeight: 500 }}
            >
              {m.body}
            </div>
          )
        )}

        {currentQ && !isComplete && (
          <div style={{ alignSelf: "stretch", marginTop: 2 }}>
            <QuestionInput q={currentQ} submitting={submitting} onSubmit={submitAnswer} />
          </div>
        )}

        {isComplete && !lead.lead.demo_project_id && (
          <button
            onClick={buildDemo}
            disabled={building}
            className="grad-fv animate-pulse-glow"
            style={{ alignSelf: "center", marginTop: 6, height: 44, padding: "0 22px", borderRadius: 9999, color: "#fff", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}
          >
            <Icon.sparkles style={{ width: 16, height: 16 }} /> {building ? "Building live demo..." : "Build Free Demo"}
          </button>
        )}
        {isComplete && lead.lead.demo_project_id && (
          <div style={{ alignSelf: "center", fontSize: 11.5, color: "var(--text-faint)", marginTop: 4 }}>Demo built &middot; see the Demo tab &rarr;</div>
        )}
      </div>

      <div style={{ flexShrink: 0, background: "var(--panel-2)", borderTop: "1px solid var(--border)", padding: "8px 12px" }}>
        <div className="flex items-center gap-2">
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && freeText.trim()) {
                e.preventDefault();
                submitAnswer(freeText.trim());
                setFreeText("");
              }
            }}
            placeholder="Answer on the client's behalf (relaying a call, WhatsApp, etc.)..."
            style={{ flex: 1, background: "#08080a", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: "10px 14px", fontSize: 13, color: "rgba(248,250,252,.7)", resize: "none", maxHeight: 80 }}
          />
          <button
            onClick={() => {
              if (freeText.trim()) {
                submitAnswer(freeText.trim());
                setFreeText("");
              }
            }}
            style={{ width: 40, height: 40, borderRadius: 9999, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            className="grad-fv"
          >
            <Icon.send style={{ width: 15, height: 15, color: "#fff" }} />
          </button>
        </div>
      </div>
    </div>
  );
}
