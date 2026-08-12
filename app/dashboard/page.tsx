"use client";
import { useEffect, useState } from "react";

type Project = {
  id: string;
  prompt: string;
  code: string;
  createdAt: string;
};

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects").then(r=>r.json()).then(data=>{
      setProjects(Array.isArray(data) ? data : data.projects || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">My Builds — Neon DB</h1>
          <a href="/builder?paid=1" className="px-4 py-2 bg-white text-black rounded-lg font-semibold">+ New Build</a>
        </div>
        {loading ? <div className="text-white/50">Loading Neon builds...</div> : 
         projects.length===0 ? <div className="text-white/50 p-8 border border-dashed border-white/10 rounded-xl text-center">No builds yet. Go to Builder and generate. Builds are saved forever in Neon.</div> :
         <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
           {projects.map(p=>(
             <div key={p.id} className="bg-white/[0.05] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
               <div className="text-xs text-white/40">{new Date(p.createdAt).toLocaleString()} • {p.id.slice(0,8)}</div>
               <div className="font-medium line-clamp-2">{p.prompt}</div>
               <div className="bg-white rounded-lg h-[200px] overflow-hidden">
                 <iframe srcDoc={p.code} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" />
               </div>
               <div className="flex gap-2">
                 <button onClick={()=>navigator.clipboard.writeText(p.code)} className="flex-1 py-2 bg-white/10 rounded-lg text-sm">Copy Code</button>
                 <a href={`/builder?load=${p.id}`} className="flex-1 py-2 bg-white text-black rounded-lg text-sm text-center">Open</a>
               </div>
             </div>
           ))}
         </div>
        }
      </div>
    </div>
  );
}