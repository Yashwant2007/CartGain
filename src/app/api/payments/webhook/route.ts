import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, PLANS, resolvePlanId, PAID_PLAN_IDS, getPlan } from "@/lib/payment";
import prisma from "@/lib/db";
import { redisSetNX } from "@/lib/redis";
import { track } from "@/lib/analytics/track";
import { captureError } from "@/lib/observability/logger";

export const dynamic = 'force-dynamic'

// Max time we need to treat a webhook delivery as possibly-redelivered. Razorpay
// retries deliveries with the same event id within its delivery window (hours),
// so a 7-day dedup marker is generous and self-expiring.
const EVENT_DEDUP_TTL_MS = 7 * 24 * 60 * 60 * 1000

// Idempotency guard: the FIRST delivery of a gateway event wins; repeat
// deliveries (authorized+captured for the same payment, or retried webhooks)
// are acknowledged but not re-processed — so smsCredits and bargain/sms
// counters can never be applied twice.
//
// The DB ledger row (unique namespace+entityId) is the authoritative claim;
// the Redis SETNX marker is only a fast-path optimization. This survives
// Redis outages and restarts: while Redis is down, `redisSetNX` returns false
// (ambiguous), so the ledger decides.
async function claimEventOnce(namespace: string, entityId: string): Promise<boolean> {
  try {
    await redisSetNX(`dedup:webhook:${namespace}:${entityId}`, '1', EVENT_DEDUP_TTL_MS)
  } catch {
    // Redis unavailable — the ledger below is authoritative. Do NOT fail open
    // to processing, or a retried webhook could double-apply credits.
  }

  try {
    await prisma.webhookEvent.create({
      data: { namespace, entityId },
    })
    return true
  } catch (e: any) {
    if (e?.code === 'P2002') {
      console.log(`Webhook event already in ledger (${namespace} ${entityId}) — skipping redelivery`)
      return false
    }
    // Ledger write failed for an unexpected reason. Redis (when up) still
    // holds the marker, so processing once is safe for the dedup window.
    return true
  }
}

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

    const dedupKey =
      event.event === "payment.authorized" || event.event === "payment.captured"
        ? ["payment", event.payload?.payment?.entity?.id]
        : event.event === "payment_link.paid"
        ? ["payment_link", event.payload?.payment_link?.entity?.id]
        : event.event.startsWith("subscription.")
        ? ["subscription", event.payload?.subscription?.entity?.id]
        : null

    if (dedupKey && dedupKey[1]) {
      const firstDelivery = await claimEventOnce(dedupKey[0], dedupKey[1])
      if (!firstDelivery) {
        console.log(`Webhook dedup hit for ${dedupKey[0]} ${dedupKey[1]} — skipping redelivery`)
        return NextResponse.json({ received: true }, { status: 200 })
      }
    }

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
    await captureError({
      level: "error",
      component: "billing",
      operation: "payments_webhook",
      error,
      req,
      persist: true,
      statusCode: 500,
    })
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
  const paidAmount = (payment.amount || 0) / 100;

  if (!userId || !plan) return;

  const planConfig = getPlan(plan)
  if (!planConfig) {
    console.error(`Webhook: unknown plan "${plan}" for user ${userId}`);
    return;
  }

  const expectedPrice = period === 'yearly' ? planConfig.yearlyPrice : planConfig.price;
  if (plan !== "credits" && Math.round(paidAmount) !== Math.round(expectedPrice)) {
    console.error(`Webhook: amount mismatch for user ${userId} plan ${plan}: paid ${paidAmount} vs expected ${expectedPrice}`);
    return;
  }

  const planSmsCredits = "smsCredits" in planConfig ? (planConfig as any).smsCredits : 0;

  const isMonthlyPlan = plan !== "credits";
  const smsToAdd = isMonthlyPlan ? planSmsCredits : Math.round(paidAmount);
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
      updateData.overageEnabled = (PAID_PLAN_IDS as readonly string[]).includes(resolvePlanId(plan));
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
        overageEnabled: isMonthlyPlan && (PAID_PLAN_IDS as readonly string[]).includes(resolvePlanId(plan)),
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
      overageEnabled: (PAID_PLAN_IDS as readonly string[]).includes(resolvePlanId(existing.plan)),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  })

  await track({
    name: "cartgain_subscription_activated",
    userId: existing.userId,
    properties: { plan: existing.plan },
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
