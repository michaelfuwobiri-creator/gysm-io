"use client";

import { useEffect, useRef, useState } from "react";

// Connect-Supabase card. Stages:
//   connect: button that sends the user to Supabase to approve (they do that themselves)
//   pick:    after approving, choose one of their projects (or make a new one)
//   done:    linked
// The page reloads during the approval, so the stage lives in the chat item.

type Proj = { ref: string; name: string; region: string; status: string };

export default function ConnectCard({
  projectId,
  project,
  stage,
  onStage,
  onLinked,
}: {
  projectId: string;
  project: string;
  stage: "connect" | "pick" | "done";
  onStage: (s: "connect" | "pick" | "done") => void;
  onLinked: () => void;
}) {
  const [projects, setProjects] = useState<Proj[] | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (stage !== "pick" || projects) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/backend/projects?projectId=${encodeURIComponent(projectId)}`);
        const j = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) throw new Error(j?.error || "Couldn't list your Supabase projects.");
        setProjects(Array.isArray(j.projects) ? j.projects : []);
      } catch (e: any) {
        if (live) setError(String(e?.message || "Couldn't list your Supabase projects."));
      }
    })();
    return () => {
      live = false;
    };
  }, [stage, projectId, projects]);

  const finish = () => {
    onStage("done");
    onLinked();
  };

  const poll = (tries: number) => {
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/backend/status?projectId=${encodeURIComponent(projectId)}`);
        const j = await res.json().catch(() => ({}));
        if (j?.status === "active") return finish();
        if (j?.status === "error") {
          setWorking("");
          setError(j?.error_message || "Supabase couldn't set the project up.");
          return;
        }
      } catch {
        /* try again */
      }
      if (tries > 45) {
        setWorking("");
        setError("Supabase is taking a long time. Check your Supabase dashboard, then try again.");
      } else poll(tries + 1);
    }, 4000);
  };

  const link = async (body: { ref?: string; create?: boolean }, label: string) => {
    setError("");
    setWorking(label);
    try {
      const res = await fetch("/api/backend/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, ...body }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Couldn't link that project.");
      if (j.status === "active") finish();
      else poll(0);
    } catch (e: any) {
      setWorking("");
      setError(String(e?.message || "Couldn't link that project."));
    }
  };

  return (
    <div className="gb-approve" role="group" aria-label="Connect Supabase">
      <div className="gb-eyebrow">Connect a database</div>
      {stage === "connect" && (
        <>
          <h3>Connect your Supabase account{project ? ` for ${project}` : ""}</h3>
          <p className="gb-card-note">You approve this on Supabase yourself. GYSM never sees your password, and it can only add tables and security rules: it can never delete data.</p>
          <div className="gb-btns">
            <button className="gb-primary" onClick={() => (window.location.href = `/api/backend/connect?projectId=${encodeURIComponent(projectId)}`)}>
              Connect Supabase
            </button>
          </div>
        </>
      )}
      {stage === "pick" && (
        <>
          <h3>Which Supabase project should this app use?</h3>
          <p className="gb-card-note">Pick one of your existing projects, or make a new one. Free Supabase accounts only allow two active projects.</p>
          {error && <div className="gb-note error">{error}</div>}
          {!projects && !error && <div className="gb-note">Loading your projects…</div>}
          {working ? (
            <div className="gb-note">{working}</div>
          ) : (
            projects && (
              <div className="gb-sug">
                {projects.map((p) => (
                  <button key={p.ref} className="gb-chip" onClick={() => link({ ref: p.ref }, `Linking ${p.name}…`)} title={`${p.region} · ${p.status}`}>
                    Use {p.name}
                  </button>
                ))}
                <button className="gb-chip" onClick={() => link({ create: true }, "Creating a new project (about 2 minutes)…")}>
                  Create a new project
                </button>
              </div>
            )
          )}
        </>
      )}
      {stage === "done" && <div className="gb-resolved">Connected</div>}
    </div>
  );
}
