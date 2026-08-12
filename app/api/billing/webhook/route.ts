import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;
  const body = await req.text();
  try {
    const event = stripe.webhooks.constructEvent(body, sig!, secret);
    if (event.type === "checkout.session.completed") {
      console.log("PAYMENT OK:", (event.data.object as any).id);
    }
    return NextResponse.json({ received: true });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
