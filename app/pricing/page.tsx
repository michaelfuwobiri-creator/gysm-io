"use client";
import { useState } from "react";

const PLANS = [
  { id:"flex", name:"FLEX", price:"$0", sub:" to start", desc:"Pay as you ship. $0.05 per generation. Perfect to test GYSM.", features:["5 free builds","Community support","Deploy to Vercel"], cta:"Start Free", highlight:false },
  { id:"starter", name:"STARTER", price:"$29", sub:"/month", desc:"1 Pro SaaS — full working product, not just code.", features:["1 Pro SaaS included","Stripe + Auth + DB ready","Private projects","Email support"], cta:"Get Starter", highlight:true, badge:"Most Popular" },
  { id:"agency", name:"AGENCY", price:"$300", sub:"/month", desc:"Unlimited SaaS factory. Build empires for clients.", features:["Unlimited Pro SaaS","White-label","Priority support","API access"], cta:"Go Agency", highlight:false },
];

export default function Pricing(){
  const [loading,setLoading]=useState<string| null>(null);

  async function checkout(plan:string){
    setLoading(plan);
    try{
      const r=await fetch("/api/billing/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan})});
      const d=await r.json();
      if(d.url){ window.location.href=d.url; }
      else if(plan==="flex"){ localStorage.setItem("gysm_paid","flex"); window.location.href="/builder"; }
      else alert(d.error||"Checkout failed - check Stripe keys");
    }catch(e:any){ alert(e.message); }
    finally{ setLoading(null); }
  }

  return(
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between py-6 border-b border-white/10">
          <h1 className="text-2xl font-black tracking-tighter">GYSM<span className="opacity-30">.IO</span></h1>
          <div className="flex gap-6 text-[11px] tracking-widest opacity-50"><a href="/" className="hover:opacity-100">HOME</a><a href="/builder" className="hover:opacity-100">BUILDER</a></div>
        </div>

        <div className="text-center mt-16">
          <h2 className="text-5xl md:text-6xl font-black tracking-tighter leading-[0.9]">Ship Pro SaaS.<br/>Keep the profit.</h2>
          <p className="opacity-50 mt-4 max-w-xl mx-auto">You build the idea. GYSM builds the working app with Stripe, Auth, DB. Pay once, keep 100% revenue.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mt-16">
          {PLANS.map(pl=>(
            <div key={pl.id} className={`rounded-[28px] p-8 border relative flex flex-col ${pl.highlight?'bg-white text-black border-white':'bg-white/[0.04] border-white/10'}`}>
              {pl.badge && <div className="absolute -top-3 left-6 bg-black text-white text-[10px] px-3 py-1 rounded-full font-bold border border-white/20">{pl.badge}</div>}
              <div className="text-[11px] tracking-widest opacity-50">{pl.name}</div>
              <div className="flex items-baseline gap-1 mt-2"><span className="text-5xl font-black">{pl.price}</span><span className="text-sm opacity-60">{pl.sub}</span></div>
              <p className="mt-3 text-[13px] leading-relaxed opacity-70">{pl.desc}</p>
              <div className="mt-6 space-y-2 flex-1">
                {pl.features.map((f,i)=><div key={i} className="text-[12px] flex gap-2"><span className="opacity-50">✓</span><span>{f}</span></div>)}
              </div>
              <button onClick={()=>checkout(pl.id)} disabled={!!loading} className={`mt-8 w-full h-12 rounded-full font-black text-sm ${pl.highlight?'bg-black text-white hover:bg-zinc-900':'bg-white text-black hover:bg-zinc-200'} disabled:opacity-50`}>
                {loading===pl.id?"Redirecting...":pl.cta}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center mt-16 opacity-30 text-[11px]">After payment you unlock /builder • No subscriptions for Flex</div>
        <div className="h-20" />
      </div>
    </div>
  );
}
