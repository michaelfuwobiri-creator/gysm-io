"use client";

import { useState } from "react";
import { VOIIE_QUESTIONS } from "@/lib/voiie/consultation";

type Phase = "form" | "building" | "done" | "error";

export default function IntakeForm({ leadId, sig, businessGuess, emailGuess }: { leadId: string; sig: string; businessGuess: string; emailGuess: string }) {
  const [values, setValues] = useState<string[]>(() =>
    VOIIE_QUESTIONS.map((q) => (q.key === "business" ? (businessGuess ? `${businessGuess} — ` : "") : q.key === "contact" ? emailGuess : ""))
  );
  const [phase, setPhase] = useState<Phase>("form");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ demoUrl: string; checkoutUrl: string | null } | null>(null);

  const set = (i: number, v: string) => setValues((prev) => prev.map((p, idx) => (idx === i ? v : p)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPhase("building");
    setMessage("");
    try {
      const res = await fetch(`/api/voiie/intake/${leadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sig, answers: values }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error || "Something went wrong.");
        setPhase(res.status >= 500 ? "done" : "error"); // 5xx: answers saved, demo will arrive by email
        if (res.status >= 500) setResult(null);
        return;
      }
      setResult({ demoUrl: json.demoUrl, checkoutUrl: json.checkoutUrl });
      setPhase("done");
    } catch {
      setMessage("Network error — please try again.");
      setPhase("error");
    }
  }

  const css = `
    .vi{--bg:#fff;--fg:#111;--mut:#666;--line:#ddd;--card:#fafafa;--acc:#ff0080}
    @media (prefers-color-scheme:dark){.vi{--bg:#0b0b0d;--fg:#f4f4f5;--mut:#a1a1aa;--line:#2a2a30;--card:#141417}}
    .vi{min-height:100vh;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,sans-serif;padding:32px 16px}
    .vi main{max-width:520px;margin:0 auto}
    .vi h1{font-size:26px;line-height:1.2;margin:0 0 8px}
    .vi p.sub{color:var(--mut);margin:0 0 24px}
    .vi label{display:block;font-weight:600;font-size:14px;margin:18px 0 6px}
    .vi input,.vi textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);font:inherit}
    .vi .opts{display:flex;flex-wrap:wrap;gap:8px}
    .vi .opt{padding:10px 14px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--fg);cursor:pointer;font:inherit}
    .vi .opt[aria-pressed=true]{border-color:var(--acc);background:var(--acc);color:#fff}
    .vi button.go,.vi a.go{display:block;width:100%;margin-top:26px;padding:14px;border:0;border-radius:10px;background:var(--acc);color:#fff;font:inherit;font-weight:700;text-align:center;text-decoration:none;cursor:pointer;box-sizing:border-box}
    .vi a.alt{display:block;text-align:center;margin-top:12px;color:var(--fg)}
    .vi .err{color:#d33;margin-top:12px}
    .vi .fine{color:var(--mut);font-size:12px;margin-top:20px}
  `;

  return (
    <div className="vi">
      <style>{css}</style>
      <main>
        {phase === "building" ? (
          <>
            <h1>Building your demo…</h1>
            <p className="sub">This takes about a minute or two. Keep this tab open — we&apos;ll also email you the link.</p>
          </>
        ) : phase === "done" ? (
          result ? (
            <>
              <h1>Your free demo is ready 🎉</h1>
              <p className="sub">We&apos;ve also emailed you the link.</p>
              <a className="go" href={result.demoUrl} target="_blank" rel="noopener noreferrer">View your demo</a>
              {result.checkoutUrl && <a className="alt" href={result.checkoutUrl}>Like it? Take it live →</a>}
            </>
          ) : (
            <>
              <h1>Thanks — we&apos;ve got your answers</h1>
              <p className="sub">{message || "Your demo is being finished and will arrive by email shortly."}</p>
            </>
          )
        ) : (
          <form onSubmit={submit}>
            <h1>Get your free website demo</h1>
            <p className="sub">Four quick questions. We&apos;ll build a demo of your site and email it to you — no signup, no cost.</p>
            {VOIIE_QUESTIONS.map((q, i) => (
              <div key={q.key}>
                <label htmlFor={`q-${q.key}`}>{q.prompt.replace(/^Last one — /, "")}</label>
                {q.type === "single" && q.options ? (
                  <div className="opts" role="group" aria-label={q.prompt}>
                    {q.options.map((o) => (
                      <button type="button" key={o} className="opt" aria-pressed={values[i] === o} onClick={() => set(i, o)}>
                        {o}
                      </button>
                    ))}
                  </div>
                ) : q.key === "business" ? (
                  <textarea id={`q-${q.key}`} rows={3} required value={values[i]} placeholder={q.placeholder} onChange={(e) => set(i, e.target.value)} />
                ) : (
                  <input id={`q-${q.key}`} required value={values[i]} placeholder={q.placeholder} onChange={(e) => set(i, e.target.value)} />
                )}
              </div>
            ))}
            {message && <div className="err">{message}</div>}
            <button className="go" type="submit" disabled={!values[1]}>Build my free demo</button>
            <p className="fine">We&apos;ll only use your details to send this demo. Unsubscribe any time.</p>
          </form>
        )}
      </main>
    </div>
  );
}
