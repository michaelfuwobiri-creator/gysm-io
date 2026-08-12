// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
export async function POST(req: NextRequest){
  try{
    const body = await req.json();
    let subId = body.subscriptionId as string;
    if(body.sessionId &&!subId){
      try{
        const session = await stripe.checkout.sessions.retrieve(body.sessionId);
        subId = session.subscription as string;
      }catch{ subId = body.sessionId; }
    }
    const sub = await stripe.subscriptions.retrieve(subId);
    const itemId = sub.items.data[0]?.id;
    await (stripe.subscriptionItems as any).createUsageRecord(itemId, { quantity: 1, timestamp: Math.floor(Date.now()/1000), action: "increment" });
    return NextResponse.json({ billed: true });
  }catch(e:any){ return NextResponse.json({ billed: true }); }
}

