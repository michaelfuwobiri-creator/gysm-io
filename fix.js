const fs = require('fs');

fs.writeFileSync('app/api/billing/checkout/route.ts', `
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
export async function POST(req: NextRequest) {
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
    const { plan } = await req.json().catch(()=>({plan:"starter"}));
    const p = (plan||"").toLowerCase();
    let priceId = process.env.STRIPE_PLUS_PRICE_ID;
    if(p.includes("agency") || p.includes("300")) priceId = process.env.STRIPE_AGENCY_PRICE_ID || priceId;
    if(p.includes("flex")) priceId = process.env.STRIPE_CREDITS_10_PRICE_ID || priceId;
    if(!priceId) throw new Error("No price configured");
    const priceData = await stripe.prices.retrieve(priceId);
    const isRecurring = !!priceData.recurring;
    const session = await stripe.checkout.sessions.create({
      mode: isRecurring ? "subscription" : "payment",
      line_items:[{ price: priceId }],
      success_url: \`\${siteUrl}/builder?paid=1&plan=\${p}&session_id={CHECKOUT_SESSION_ID}\`,
      cancel_url: \`\${siteUrl}/builder?canceled=1\`,
    });
    return NextResponse.json({ url: session.url });
  } catch(e){ return NextResponse.json({ error: e.message }, {status:500}); }
}
`);

fs.writeFileSync('app/builder/page.tsx', `
"use client";
import { useState, useEffect } from "react";
const PLANS = [
  { id:"flex", name:"FLEX", price:"$0 to start", sub:"Then $0.05/app", desc:"Pay as you ship. Perfect to test GYSM.", cta:"Start Flex" },
  { id:"starter", name:"STARTER", price:"$29", sub:"/month", desc:"1 Pro SaaS — a complete working product, not just code.", cta:"Get Starter", highlight:true },
  { id:"agency", name:"AGENCY", price:"$300", sub:"/month", desc:"Unlimited client SaaS factory. Build empires.", cta:"Go Agency" },
];
export default function Builder(){
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState("starter");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const checkout=async(p)=>{
    try{
      setPlan(p);
      const r=await fetch("/api/billing/checkout",{method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({plan:p})});
      const d=await r.json();
      if(d.url) window.location.href=d.url;
      else alert("Checkout failed: "+(d.error||JSON.stringify(d)));
    }catch(e){ alert("Error: "+e.message); }
  };
  const generate=async()=>{
    if(!prompt) return;
    setLoading(true);
    const res=await fetch("/api/generate",{method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({prompt, plan})});
    const data=await res.json();
    setCode(data.code||"");
    setLoading(false);
  };
  return(
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-black mb-10">GYSM.IO</h1>
        <div className="grid md:grid-cols-3 gap-4 mb-12">
          {PLANS.map(pl=>(
            <div key={pl.id} className={\`rounded-3xl p-6 border \${pl.highlight?'bg-white text-black':'bg-white/5 border-white/10'}\`}>
              <div className="text-xs opacity-50">{pl.name}</div>
              <div className="flex gap-1 items-baseline"><span className="text-4xl font-black">{pl.price}</span><span>{pl.sub}</span></div>
              <p className="mt-3 text-sm opacity-80">{pl.desc}</p>
              <button onClick={()=>checkout(pl.id)} className={\`mt-6 w-full h-11 rounded-full font-bold \${pl.highlight?'bg-black text-white':'bg-white text-black'}\`}>{pl.cta}</button>
            </div>
          ))}
        </div>
        <div className="rounded-3xl bg-white/5 border border-white/10 p-6 flex gap-3">
          <input value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe your SaaS" className="flex-1 h-14 rounded-full bg-black border border-white/10 px-6" />
          <button onClick={generate} className="h-14 px-8 rounded-full bg-white text-black font-black">{loading?"Building...":"Generate"}</button>
        </div>
        {code && <iframe srcDoc={code} className="w-full h- mt-6 bg-white rounded-2xl" />}
      </div>
    </div>
  );
}
`);
console.log("Fixed!");
`);
