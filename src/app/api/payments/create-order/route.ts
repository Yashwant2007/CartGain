import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { razorpay, PLANS } from "@/lib/payment";

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { plan, amount: clientAmount, period } = await req.json();

    if (!plan) {
      return NextResponse.json(
        { error: "Plan is required" },
        { status: 400 }
      );
    }

    const planConfig = Object.values(PLANS).find(p => p.id === plan);
    if (!planConfig || planConfig.price === 0) {
      return NextResponse.json(
        { error: "Invalid plan" },
        { status: 400 }
      );
    }

    const billingPeriod = period || 'monthly';
    const expectedPrice = billingPeriod === 'yearly' ? planConfig.yearlyPrice : planConfig.price;
    const serverAmount = Math.round(expectedPrice * 100);

    // Validate client-provided amount against server-side plan pricing
    if (!clientAmount || Math.round(clientAmount * 100) !== serverAmount) {
      return NextResponse.json(
        { error: "Invalid amount" },
        { status: 400 }
      );
    }

    // Create Razorpay order
    const options = {
      amount: serverAmount, // Razorpay expects amount in paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        userId: session.user.id,
        plan,
        period: billingPeriod,
        email: session.user.email,
      },
    };

    const order = await razorpay.orders.create(options);

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Payment order creation error:", error);
    return NextResponse.json(
      { error: "Failed to create payment order" },
      { status: 500 }
    );
  }
}
