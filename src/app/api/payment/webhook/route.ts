import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, PLANS } from "@/lib/payment";
import prisma from "@/lib/db";

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";

    // Verify webhook signature
    const isValid = verifyWebhookSignature(body, signature);

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(body);

    switch (event.event) {
      case "payment.authorized":
      case "payment.captured":
        await handlePaymentCaptured(event.payload.payment.entity);
        break;

      case "payment.failed":
        await handlePaymentFailed(event.payload.payment.entity);
        break;

      case "order.paid":
        await handleOrderPaid(event.payload.payment.entity, event.payload.order.entity);
        break;

      case "subscription.activated":
        await handleSubscriptionActivated(event.payload.subscription.entity);
        break;

      case "subscription.paused":
      case "subscription.halted":
        await handleSubscriptionPaused(event.payload.subscription.entity);
        break;

      case "subscription.resumed":
        await handleSubscriptionResumed(event.payload.subscription.entity);
        break;

      case "subscription.completed":
      case "subscription.cancelled":
        await handleSubscriptionCancelled(event.payload.subscription.entity);
        break;

      default:
        console.log(`Unhandled event: ${event.event}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handlePaymentCaptured(payment: any) {
  const userId = payment.notes?.userId;
  const plan = payment.notes?.plan;

  if (!userId || !plan) return;

  const planConfig = Object.values(PLANS).find(
    (p) => p.id === plan || (plan === "credits")
  );
  const planSmsCredits = planConfig && "smsCredits" in planConfig ? (planConfig as any).smsCredits : 0;

  const isMonthlyPlan = plan !== "credits";
  const smsToAdd = isMonthlyPlan ? planSmsCredits : Math.round((payment.amount || 0) / 100);

  const existingSubscription = await prisma.subscription.findFirst({
    where: { userId },
  });

  if (existingSubscription) {
    const updateData: any = {
      status: "active",
    };

    if (isMonthlyPlan) {
      updateData.plan = plan;
      updateData.smsCredits = smsToAdd;
      updateData.smsCreditsUsed = 0;
      updateData.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else {
      updateData.smsCredits = { increment: smsToAdd };
    }

    await prisma.subscription.update({
      where: { id: existingSubscription.id },
      data: updateData,
    });
  } else {
    await prisma.subscription.create({
      data: {
        userId,
        customerId: payment.id || `customer_${userId}_${Date.now()}`,
        plan: isMonthlyPlan ? plan : "free",
        status: "active",
        smsCredits: smsToAdd,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  console.log(`✅ Payment captured for user ${userId}, plan: ${plan}, credits: ${smsToAdd}`);
}

async function handlePaymentFailed(payment: any) {
  const userId = payment.notes?.userId;
  console.log(`❌ Payment failed for user ${userId}, reason: ${payment.description}`);
}

async function handleOrderPaid(payment: any, order: any) {
  console.log(`✅ Order ${order.id} paid via ${payment.method}`);
}

async function handleSubscriptionActivated(subscription: any) {
  const userId = subscription.notes?.userId;
  const plan = subscription.notes?.plan || "starter";

  const planConfig = Object.values(PLANS).find((p) => p.id === plan);
  const smsCredits = planConfig && "smsCredits" in planConfig ? (planConfig as any).smsCredits : 2000;

  const existingSubscription = await prisma.subscription.findFirst({
    where: { userId },
  });

  if (existingSubscription) {
    await prisma.subscription.update({
      where: { id: existingSubscription.id },
      data: {
        status: "active",
        plan,
        subscriptionId: subscription.id,
        smsCredits,
        smsCreditsUsed: 0,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    });
  } else {
    await prisma.subscription.create({
      data: {
        userId,
        customerId: subscription.customer_id,
        subscriptionId: subscription.id,
        plan,
        status: "active",
        smsCredits,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    });
  }

  console.log(`✅ Subscription activated for user ${userId}, plan: ${plan}`);
}

async function handleSubscriptionPaused(subscription: any) {
  const userId = subscription.notes?.userId;

  const existingSubscription = await prisma.subscription.findFirst({
    where: { userId },
  });

  if (existingSubscription) {
    await prisma.subscription.update({
      where: { id: existingSubscription.id },
      data: { status: "paused" },
    });
  }

  console.log(`⏸️ Subscription paused for user ${userId}`);
}

async function handleSubscriptionResumed(subscription: any) {
  const userId = subscription.notes?.userId;

  const existingSubscription = await prisma.subscription.findFirst({
    where: { userId },
  });

  if (existingSubscription) {
    await prisma.subscription.update({
      where: { id: existingSubscription.id },
      data: { 
        status: "active",
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    });
  }

  console.log(`▶️ Subscription resumed for user ${userId}`);
}

async function handleSubscriptionCancelled(subscription: any) {
  const userId = subscription.notes?.userId;

  const existingSubscription = await prisma.subscription.findFirst({
    where: { userId },
  });

  if (existingSubscription) {
    await prisma.subscription.update({
      where: { id: existingSubscription.id },
      data: { status: "cancelled" },
    });
  }

  console.log(`❌ Subscription cancelled for user ${userId}`);
}
