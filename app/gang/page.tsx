"use client";
import { useState, useEffect } from "react";

type Build = {
  id: number;
  prompt: string;
  code?: string;
  likes: number;
  liked?: boolean;
  createdAt: string;
  author?: string;
  tags?: string[];
};

export default function Gang() {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [filter, setFilter] = useState("trending");
  const [loading, setLoading] = useState(true);
  const [submitPrompt, setSubmitPrompt] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      let list = data.projects || [];
      // merge local drafts
      try {
        const local = JSON.parse(localStorage.getItem("gysm_projects")||"[]");
        if(local.length && filter==="yours") list = local.map((s:any)=>({...s, author:"You", tags:["yours"]}));
      } catch {}
      setBuilds(list);
    } catch {} finally { setLoading(false); }
  }

  useEffect(()=>{ load(); }, [filter]);

  async function toggleLike(id:number, liked?:boolean){
    setBuilds(prev=>prev.map(b=> b.id===id ? {...b, likes: liked? b.likes-1:b.likes+1, liked: !liked} : b));
    await fetch("/api/projects", { method:"PATCH", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ id, action: liked?"unlike":"like" }) });
  }

  function remix(build:Build){
    localStorage.setItem("gysm_remix_prompt", build.prompt);
    if(build.code) localStorage.setItem("gysm_remix_code", build.code);
    window.location.href="/builder";
  }

  async function submitBuild(){
    if(!submitPrompt.trim()) return;
    const res = await fetch("/api/projects", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ prompt: submitPrompt, code:"", author:"@mikeal_kings" }) });
    const data = await res.json();
    if(data.project){
      setBuilds([data.project, ...builds]);
      setSubmitPrompt("");
      alert("🔥 Build added to Gang!");
    }
  }

  const filtered = filter==="trending" ? [...builds].sort((a,b)=>b.likes-a.likes) : filter==="newest" ? [...builds].sort((a,b)=> new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()) : builds;

  return (
    <div className="min-h-screen bg-[#FCFCF9] text-black">
      <div className="h-[64px] bg-white border-b border-black/5 flex items-center justify-between px-8 sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <a href="/" className="flex items-center gap-2"><div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-black">G</div><span className="font-black text-[17px]">GYSM.IO</span></a>
          <div className="h-6 w-px bg-black/10 hidden md:block"></div>
          <h1 className="font-black text-[18px] hidden md:block">Build Gang 🔥</h1>
        </div>
        <a href="/builder" className="text-[13px] font-bold px-5 py-2.5 rounded-full bg-black text-white">+ Build App</a>
      </div>

      <div className="max-w-[1280px] mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div>
            <h1 className="text-[42px] font-black leading-[0.9] tracking-tight">GYSM BUILD GANG</h1>
            <p className="text-[15px] text-black/60 mt-3 max-w-[520px]">Showcase builds, get likes, remix others. Every Export from builder auto-saves here. Now backed by API so all users see it.</p>
          </div>
          <div className="flex gap-2">
            {["trending","newest","yours"].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} className={`px-4 py-2 rounded-full text-[13px] font-bold capitalize border ${filter===f?"bg-black text-white border-black":"bg-white hover:bg-black hover:text-white"}`}>{f}</button>
            ))}
          </div>
        </div>

        {loading ? <div className="text-center py-20">Loading gang builds...</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(build=>(
              <div key={build.id} className="group bg-white rounded-[24px] border border-black/5 shadow-sm hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.2)] transition overflow-hidden flex flex-col">
                <div className="h-[200px] bg-gradient-to-br from-violet-100 via-white to-yellow-50 p-4 relative">
                  <div className="h-full w-full bg-white rounded-xl border shadow-sm flex items-center justify-center text-[11px] text-black/30 font-mono p-3 overflow-hidden text-left">
                    {build.code ? build.code.slice(0,320)+"..." : build.prompt}
                  </div>
                  <div className="absolute top-3 right-3 flex gap-1.5">
                    {build.tags?.map(t=><span key={t} className="text-[10px] font-bold bg-black text-white px-2 py-1 rounded-full uppercase">{t}</span>)}
                  </div>
                </div>
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[10px] font-black">{build.author?.[1]?.toUpperCase()||"G"}</div>
                    <span className="text-[12px] font-bold">{build.author}</span><span className="text-[11px] text-black/40">• now</span>
                  </div>
                  <h3 className="font-bold text-[15px] leading-tight line-clamp-2">{build.prompt}</h3>
                  <div className="mt-4 flex items-center justify-between">
                    <button onClick={()=>toggleLike(build.id, build.liked)} className={`flex items-center gap-1.5 text-[13px] font-bold px-3 py-1.5 rounded-full border ${build.liked?"bg-black text-white":"bg-[#FCFCF9] hover:bg-black hover:text-white"}`}><span>{build.liked?"❤️":"🤍"}</span> {build.likes}</button>
                    <button onClick={()=>remix(build)} className="text-[12px] font-black px-3 py-1.5 rounded-full bg-violet-600 text-white hover:bg-violet-700">Remix →</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-16 bg-black text-white rounded-[32px] p-8 lg:p-12 flex flex-col lg:flex-row items-center justify-between gap-6">
          <div><h2 className="text-[28px] font-black">Want to be featured?</h2><p className="text-white/60 text-[14px] mt-2">Top 3 builds each week get 10k views + $100 credits.</p></div>
          <div className="flex gap-3">
            <input value={submitPrompt} onChange={e=>setSubmitPrompt(e.target.value)} placeholder="Describe your build..." className="h-12 w-[280px] px-5 rounded-full bg-white/10 border border-white/10 outline-none text-[14px] placeholder:text-white/40" />
            <button onClick={submitBuild} className="h-12 px-6 rounded-full bg-white text-black font-bold text-[14px]">Submit to Gang</button>
          </div>
        </div>
      </div>
    </div>
  );
}
