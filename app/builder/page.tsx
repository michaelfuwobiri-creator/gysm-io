"use client";
import { useState, useRef, useEffect } from "react";

function makePreview(code: string){
  let clean = code.replace(/import\s+[^;]+;?/g,"").replace(/export\s+default\s+\w+;?/g,"").trim();
  const m = clean.match(/(?:const|function)\s+([A-Z]\w*)/);
  const name = m ? m[1] : "App";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><script src="https://cdn.tailwindcss.com"></script><style>#err{position:fixed;top:0;left:0;right:0;background:#ef4444;color:white;padding:12px;font-family:monospace;font-size:12px;z-index:9999;display:none;white-space:pre-wrap}</style></head><body><div id="err"></div><div id="root"></div><script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script><script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script><script src="https://unpkg.com/@babel/standalone@7.23.9/babel.min.js"></script><script>window.onerror=function(m,s,l,c,e){var el=document.getElementById('err');el.style.display='block';el.textContent='Error: '+m};window.addEventListener('unhandledrejection',function(e){var el=document.getElementById('err');el.style.display='block';el.textContent='Promise: '+e.reason;});</script><script type="text/babel" data-presets="react">${clean}
try{const root=ReactDOM.createRoot(document.getElementById('root'));const Comp=typeof ${name} !== 'undefined'?${name}:()=>React.createElement('div',null,'Component not found');root.render(React.createElement(Comp));}catch(err){document.getElementById('err').style.display='block';document.getElementById('err').textContent='Render: '+err.message;}</script></body></html>`;
}

export default function Builder(){
  const [prompt,setPrompt]=useState("");
  const [raw,setRaw]=useState("");
  const [html,setHtml]=useState("");
  const [loading,setLoading]=useState(false);
  const [tab,setTab]=useState<"preview"|"code">("preview");
  const [log,setLog]=useState("");
  const [paid,setPaid]=useState<boolean|null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // PAYWALL CHECK - client only builds after payment
  useEffect(()=>{
    const url = new URL(window.location.href);
    if(url.searchParams.get("success")==="1" || url.searchParams.get("paid")==="1"){
      localStorage.setItem("gysm_paid","starter");
      url.searchParams.delete("success");
      url.searchParams.delete("paid");
      window.history.replaceState({},'',url.toString());
    }
    const p = localStorage.getItem("gysm_paid");
    const hasPaid = p==="starter"||p==="agency"||p==="flex";
    if(!hasPaid){
      // Check server billing status as fallback
      fetch("/api/billing/status").then(r=>r.json()).then(d=>{
        if(d.paid){ localStorage.setItem("gysm_paid",d.plan||"starter"); setPaid(true); }
        else setPaid(false);
      }).catch(()=> setPaid(!!p));
    }else{
      setPaid(true);
    }
  },[]);

  async function gen(){
    if(!prompt.trim()) return;
    setLoading(true); setLog("Building..."); setRaw(""); setHtml("");
    try{
      const r=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt})});
      const d=await r.json();
      const code=d.code||"";
      if(!code){setLog("No code");return;}
      setRaw(code);
      setHtml(code.trim().startsWith("<")?code:makePreview(code));
      setLog("Built!");
      setTab("preview");
      fetch("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt,code,previewHtml:code,plan:"free"})}).catch(()=>{});
    }catch(e:any){setLog("Error: "+e.message);}finally{setLoading(false);}
  }

  // Loading paywall check
  if(paid===null){
    return <div className="min-h-screen bg-black text-white flex items-center justify-center"><div className="opacity-50 text-sm">Checking access...</div></div>;
  }

  // NOT PAID - BLOCK BUILDER, SHOW PRICING CTA
  if(paid===false){
    return(
      <div className="min-h-screen bg-black text-white">
        <div className="max-w-4xl mx-auto p-6 text-center">
          <div className="mt-20">
            <div className="inline-flex px-3 py-1 rounded-full bg-white/10 text-[10px] tracking-widest">PAYWALL ACTIVE</div>
            <h1 className="text-5xl font-black mt-6 leading-[0.9]">Builder locked.<br/>Pay to ship.</h1>
            <p className="opacity-50 mt-4 max-w-lg mx-auto">GYSM builder is for paying customers only. Choose a plan to unlock unlimited builds. $29 = 1 Pro SaaS, $300 = unlimited.</p>
            <div className="flex gap-3 justify-center mt-8">
              <a href="/pricing" className="h-12 px-8 rounded-full bg-white text-black font-black flex items-center">See Plans →</a>
              <button onClick={()=>{localStorage.setItem("gysm_paid","flex"); setPaid(true);}} className="h-12 px-6 rounded-full bg-white/10 text-sm">Test Flex Free (dev)</button>
            </div>
            <div className="mt-12 opacity-20 text-[10px]">After Stripe checkout you will be redirected to /builder?success=1 and unlock automatically</div>
          </div>
        </div>
      </div>
    );
  }

  // PAID - SHOW BUILDER ONLY (NO PRICING INSIDE)
  return(
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between py-4 border-b border-white/10 mb-6">
          <h1 className="text-2xl font-black">GYSM<span className="opacity-30">.IO</span> <span className="text-[10px] ml-2 px-2 py-1 rounded-full bg-green-500/20 text-green-400">PRO UNLOCKED</span></h1>
          <div className="flex gap-3"><a href="/pricing" className="text-[11px] opacity-50 hover:opacity-100">Plans</a><button onClick={()=>{localStorage.removeItem("gysm_paid"); setPaid(false);}} className="text-[11px] opacity-30">Lock (test)</button></div>
        </div>

        <div className="bg-white/[0.06] border border-white/10 rounded-[24px] p-4 flex gap-3">
          <input value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&gen()} placeholder="What Pro SaaS? e.g. food app with 6 dishes + price tags $14.99" className="flex-1 h-[56px] bg-black rounded-full px-6 outline-none border border-white/10" />
          <button onClick={gen} disabled={loading} className="h-[56px] px-8 rounded-full bg-white text-black font-black disabled:opacity-50">{loading?"Building...":"Generate →"}</button>
        </div>
        {log && <div className="mt-3 text-center text-xs opacity-60 bg-white/5 py-2 rounded-full">{log}</div>}

        {raw && (
          <div className="mt-6">
            <div className="flex gap-2 mb-3">
              <button onClick={()=>setTab("preview")} className={`px-4 py-2 rounded-full text-xs font-bold ${tab==="preview"?"bg-white text-black":"bg-white/10"}`}>Preview</button>
              <button onClick={()=>setTab("code")} className={`px-4 py-2 rounded-full text-xs font-bold ${tab==="code"?"bg-white text-black":"bg-white/10"}`}>Code</button>
              <button onClick={()=>iframeRef.current&&(iframeRef.current.srcdoc=html)} className="px-3 py-2 rounded-full text-xs bg-white/5">↻ Reload</button>
              <button onClick={()=>navigator.clipboard.writeText(raw)} className="ml-auto px-3 py-2 rounded-full text-xs bg-white/10">Copy</button>
            </div>
            <div className="rounded-[20px] overflow-hidden border border-white/10 bg-white min-h-[600px]">
              {tab==="preview"?<iframe ref={iframeRef} srcDoc={html} className="w-full h-[750px] border-0 bg-white" sandbox="allow-scripts allow-same-origin" />:<pre className="p-6 text-black text-[11px] overflow-auto h-[750px] whitespace-pre-wrap font-mono">{raw}</pre>}
            </div>
          </div>
        )}
        <div className="h-20" />
      </div>
    </div>
  );
}
