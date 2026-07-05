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

      case "payment_link.paid":
        await handlePaymentLinkPaid(event.payload.payment_link.entity, event.payload.payment.entity);
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
  const period = payment.notes?.period || 'monthly';

  if (!userId || !plan) return;

  const planConfig = Object.values(PLANS).find(
    (p) => p.id === plan || (plan === "credits")
  );
  const planSmsCredits = planConfig && "smsCredits" in planConfig ? (planConfig as any).smsCredits : 0;

  const isMonthlyPlan = plan !== "credits";
  const smsToAdd = isMonthlyPlan ? planSmsCredits : Math.round((payment.amount || 0) / 100);
  const periodDays = period === 'yearly' ? 365 : 30;

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
      updateData.currentPeriodEnd = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000);
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
        currentPeriodEnd: new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000),
      },
    });
  }

  console.log(`✅ Payment captured for user ${userId}, plan: ${plan}, period: ${period}, credits: ${smsToAdd}`);
}

async function handlePaymentFailed(payment: any) {
  const userId = payment.notes?.userId;
  console.log(`❌ Payment failed for user ${userId}, reason: ${payment.description}`);
}

async function handleOrderPaid(payment: any, order: any) {
  console.log(`✅ Order ${order.id} paid via ${payment.method}`);
}

async function handleSubscriptionActivated(subscription: any) {
  const subId = subscription.id

  const existing = await prisma.subscription.findFirst({
    where: { subscriptionId: subId },
  })

  if (!existing) {
    console.log(`⚠️ No pending subscription found for Razorpay sub ${subId}, skipping`)
    return
  }

  const planConfig = Object.values(PLANS).find((p) => p.id === existing.plan)

  await prisma.subscription.update({
    where: { id: existing.id },
    data: {
      status: "active",
      customerId: subscription.customer_id,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  })

  console.log(`✅ Subscription ${subId} activated for user ${existing.userId}, plan: ${existing.plan}`)
}

async function handleSubscriptionPaused(subscription: any) {
  const subId = subscription.id
  const existing = await prisma.subscription.findFirst({ where: { subscriptionId: subId } })
  if (existing) {
    await prisma.subscription.update({ where: { id: existing.id }, data: { status: "paused" } })
    console.log(`⏸️ Subscription ${subId} paused for user ${existing.userId}`)
  }
}

async function handleSubscriptionResumed(subscription: any) {
  const subId = subscription.id
  const existing = await prisma.subscription.findFirst({ where: { subscriptionId: subId } })
  if (existing) {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: { status: "active", currentPeriodEnd: new Date(subscription.current_period_end * 1000) },
    })
    console.log(`▶️ Subscription ${subId} resumed for user ${existing.userId}`)
  }
}

async function handleSubscriptionCancelled(subscription: any) {
  const subId = subscription.id
  const existing = await prisma.subscription.findFirst({ where: { subscriptionId: subId } })
  if (existing) {
    await prisma.subscription.update({ where: { id: existing.id }, data: { status: "cancelled" } })
    console.log(`❌ Subscription ${subId} cancelled for user ${existing.userId}`)
  }
}

// Handles revenue-share invoice payments made via Razorpay Payment Link.
// Idempotent: a second call for the same invoice is a no-op.
async function handlePaymentLinkPaid(paymentLink: any, payment: any) {
  const paymentLinkId = paymentLink?.id
  const invoiceId = paymentLink?.notes?.invoiceId
  const paymentId = payment?.id

  if (!paymentLinkId || !invoiceId) {
    console.log('payment_link.paid: missing paymentLinkId or invoiceId in notes — skipping')
    return
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, razorpayPaymentLinkId: paymentLinkId },
  })

  if (!invoice) {
    console.log(`payment_link.paid: no invoice found for id=${invoiceId} linkId=${paymentLinkId}`)
    return
  }

  if (invoice.status === 'paid') {
    console.log(`payment_link.paid: invoice ${invoiceId} already paid — idempotent skip`)
    return
  }

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'paid',
        paidAt: new Date(),
        paidVia: 'razorpay',
        paymentRef: paymentId,
      },
    }),
    prisma.subscription.update({
      where: { id: invoice.subscriptionId },
      data: { revenueSharePaid: { increment: invoice.amount } },
    }),
  ])

  console.log(`✅ RevShare invoice ${invoice.id} paid: ₹${invoice.amount} via payment link ${paymentLinkId}`)
}
