"use client";
import { useState } from "react";

export default function AuthPage(){
  const [mode,setMode]=useState<"login"|"signup">("signup");
  const [email,setEmail]=useState("");
  const [loading,setLoading]=useState(false);

  async function handleAuth(){
    setLoading(true);
    // Replace with real auth: Clerk / Supabase / NextAuth
    // For now mock -> redirects to dashboard
    await new Promise(r=>setTimeout(r,800));
    window.location.href="/dashboard";
  }

  return(
    <div style={{fontFamily:"Inter,sans-serif"}} className="min-h-screen bg-[#FCFCF9] grid md:grid-cols-2">
      <div className="hidden md:flex bg-black text-white p-10 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_0%_0%,rgba(124,58,237,0.4),transparent),radial-gradient(60%_60%_at_100%_100%,rgba(236,72,153,0.3),transparent)]" />
        <div className="relative"><div className="flex items-center gap-2"><div className="h-7 w-7 rounded-[8px] bg-white text-black grid place-items-center font-black">G</div><span className="font-black">GYSM.IO</span></div></div>
        <div className="relative">
          <h1 className="text-[48px] font-black leading-[0.85] tracking-[-0.04em]">Build your<br/><span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent">empire.</span></h1>
          <div className="mt-8 flex gap-3 overflow-x-auto">
            {[{n:"Sarah",t:"Made $40k"},{n:"Marcus",t:"$12k MRR"},{n:"Priya",t:"YC W24"}].map(u=><div key={u.n} className="shrink-0 rounded-full bg-white/10 border border-white/10 px-4 py-2 text-[12px]"><b>{u.n}</b> <span className="opacity-60">{u.t}</span></div>)}
          </div>
        </div>
        <div className="relative text-[11px] opacity-30">© 2026 GYSM.IO — 10k+ founders</div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-[380px]">
          <div className="md:hidden flex items-center gap-2 mb-8"><div className="h-7 w-7 rounded-[8px] bg-black text-white grid place-items-center font-black">G</div><span className="font-black">GYSM.IO</span></div>
          
          <h2 className="text-[28px] font-black tracking-[-0.02em]">{mode==="signup"?"Create your account":"Welcome back"}</h2>
          <p className="mt-2 text-[13px] opacity-60">{mode==="signup"?"Start building free — no credit card":"Sign in to your empire"}</p>

          <div className="mt-6 space-y-3">
            <button className="w-full h-[44px] rounded-full border border-black/10 bg-white text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-black hover:text-white transition"> <span>G</span> Continue with Google</button>
            <button className="w-full h-[44px] rounded-full border border-black/10 bg-white text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-black hover:text-white transition"> <span>◍</span> Continue with GitHub</button>
          </div>

          <div className="my-6 flex items-center gap-3"><div className="h-[1px] flex-1 bg-black/10"/><span className="text-[11px] opacity-30 uppercase tracking-widest">or</span><div className="h-[1px] flex-1 bg-black/10"/></div>

          <div className="space-y-3">
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com" className="w-full h-[44px] rounded-full border border-black/10 bg-[#FAFAF8] px-5 text-[14px] outline-none focus:ring-2 focus:ring-violet-600/20"/>
            <button onClick={handleAuth} disabled={loading} className="w-full h-[44px] rounded-full bg-black text-white text-[14px] font-bold disabled:opacity-50">{loading?"Loading...":mode==="signup"?"Create Account →":"Sign In →"}</button>
          </div>

          <div className="mt-6 text-center text-[12px] opacity-60">
            {mode==="signup"?<>Already have an account? <button onClick={()=>setMode("login")} className="font-bold underline">Log in</button></>:<>No account? <button onClick={()=>setMode("signup")} className="font-bold underline">Sign up</button></>}
          </div>

          <div className="mt-10 text-[11px] opacity-30 text-center leading-[1.5]">By continuing, you agree to GYSM's Terms and Privacy. Free forever, upgrade when you make money.</div>
        </div>
      </div>
    </div>
  )
}