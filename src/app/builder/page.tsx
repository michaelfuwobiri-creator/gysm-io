'use client';
import { useState } from 'react';
import { generateApp } from './orchestrator';

export default function BuilderPage(){
  const [prompt, setPrompt] = useState('');
  const [active, setActive] = useState('clinic');
  const [project, setProject] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if(!prompt) return;
    setGenerating(true);
    setSteps([{ agent: 'Product Manager', status: 'running', msg: 'Understanding requirements...' }]);
    await new Promise(r=>setTimeout(r, 600));
    const app = generateApp(prompt);
    setSteps(s=>[...s, { agent: 'UX Designer', status: 'running', msg: `Designing ${app.pages.length} pages...` }]);
    await new Promise(r=>setTimeout(r, 600));
    setSteps(s=>s.map(x=>({...x, status:'done'})).concat([{ agent: 'Architect', status: 'running', msg: 'Creating DB...' }]));
    await new Promise(r=>setTimeout(r, 600));
    setSteps(s=>s.map(x=>({...x, status:'done'})).concat([{ agent: 'Developer', status: 'running', msg: 'Writing code...' }]));
    await new Promise(r=>setTimeout(r, 800));
    setProject(app);
    setActive(app.type);
    setSteps(s=>s.map(x=>({...x, status:'done'})));
    setGenerating(false);
  };

  return (
    <div className="flex h-screen bg-[#f8fafc]">
      <div className="w- bg-white border-r flex flex-col">
        <div className="p-6 border-b">
          <div className="font-black text-xl">GYSM.IO <span className="text-teal-500">AI</span></div>
          <div className="mt-4 bg-slate-50 p-4 rounded-2xl">
            <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Build me a food delivery app for Lagos with payments, tracking, admin..." className="w-full bg-white border rounded-xl p-3 text-sm h-24 outline-none"></textarea>
            <button onClick={handleGenerate} disabled={generating} className="w-full mt-3 bg-black text-white py-3 rounded-full font-bold disabled:opacity-50">{generating?'Generating...':'Generate App'}</button>
          </div>
        </div>
        <div className="flex-1 p-6 overflow-auto">
          {steps.map((s,i)=><div key={i} className="flex gap-3 text-sm mb-3"><div className={`w-2 h-2 rounded-full mt-1.5 ${s.status==='done'?'bg-green-500':'bg-yellow-500 animate-pulse'}`}></div><div><b>{s.agent}</b><div className="text-slate-500 text-xs">{s.msg}</div></div></div>)}
          {project && <div className="mt-4 bg-slate-900 text-white p-4 rounded-2xl"><div className="font-bold">{project.appName}</div><div className="text-xs opacity-60">{project.type} - {project.pages.length} pages</div></div>}
          <div className="mt-8 grid grid-cols-2 gap-2">{['clinic','zodiac','agency','stripe'].map(t=><button key={t} onClick={()=>setActive(t)} className={`p-3 rounded-xl border capitalize text-sm ${active===t?'bg-black text-white':'bg-white'}`}>{t}</button>)}</div>
        </div>
        <div className="p-6 border-t"><button className="w-full bg-black text-white py-3 rounded-full font-bold">Publish to gysm.io</button></div>
      </div>
      <div className="flex-1 p-6 bg-[#eef2f7] overflow-auto">
        <div className="bg-white rounded- shadow-2xl min-h-full p-12">
          {project? (
            <><div className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-bold inline-block">Generated: {project.prompt}</div><h1 className="text-5xl font-black mt-6">{project.appName}</h1><div className="mt-10 grid grid-cols-3 gap-4">{project.pages.map((p:string)=><div key={p} className="border-2 border-dashed rounded-2xl p-8 text-center font-bold">{p}</div>)}</div></>
          ) : (
            <div className="text-center py-32"><div className="text-6xl">✦</div><h2 className="text-3xl font-black mt-6 capitalize">{active} Canvas</h2><p className="text-slate-500 mt-3 max-w-sm mx-auto">This is where users build their apps. Type prompt left.</p></div>
          )}
        </div>
      </div>
    </div>
  )
}
