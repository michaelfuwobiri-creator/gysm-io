const fs=require('fs');
fs.writeFileSync('app/api/billing/checkout/route.ts', `
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
export async function POST(req: NextRequest) {
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
    const { plan } = await req.json().catch(()=>({plan:"starter"}));
    const p = (plan||"starter").toLowerCase();
    
    let amount = 2900;
    let name = "GYSM Starter - 1 Pro SaaS";
    let mode = "subscription";
    
    if(p.includes("agency") || p.includes("300")){
      amount = 30000;
      name = "GYSM Agency - Unlimited SaaS Factory";
    } else if(p.includes("flex") || p.includes("0.05")){
      amount = 500;
      name = "GYSM Flex - Pay As You Ship (100 builds credit)";
      mode = "payment";
    }

    const session = await stripe.checkout.sessions.create({
      mode: mode as any,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: name },
          unit_amount: amount,
          ...(mode==="subscription" ? { recurring: { interval: "month" } } : {}),
        },
        quantity: 1,
      }],
      success_url: \`\${siteUrl}/builder?paid=1&plan=\${p}&session_id={CHECKOUT_SESSION_ID}\`,
      cancel_url: \`\${siteUrl}/builder?canceled=1\`,
    });
    return NextResponse.json({ url: session.url });
  } catch(e:any){
    console.error(e);
    return NextResponse.json({ error: e.message }, {status:500});
  }
}
`);
console.log("fixed checkout to price_data - no more price ID needed");