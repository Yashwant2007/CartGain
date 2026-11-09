/**
 * Centralized WhatsApp message decision engine for CartGain recovery.
 *
 * Decides, for a given cart/customer, what kind of WhatsApp message (if any)
 * to send. The decision is based purely on:
 *   - Valid explicit WhatsApp consent (opt-in)
 *   - Valid phone number
 *   - Approved template availability
 *   - Merchant WhatsApp account operational status
 *   - Opt-out / suppression state
 *   - Meta delivery restrictions (e.g. 131049 per-user marketing limit)
 *
 * The 24-hour customer-service window is NOT a prerequisite for business-
 * initiated template delivery. It only governs free-form conversational
 * messaging after the customer has replied.
 *
 * This module is pure (no I/O) so it is unit-testable and can be used by the
 * recovery sweep job, the WhatsApp webhook, and any future send path without
 * duplicating eligibility logic.
 */

import { evaluateWhatsAppEligibility, WhatsAppEligibilityResult } from '@/lib/recovery/eligibility'
import { isEngagementLimitedWhatsAppFailure, isPermanentWhatsAppFailure, isConfigWhatsAppFailure } from '@/lib/whatsapp/errors'
import { resolveWhatsAppPhoneNumberId, isWhatsAppConfigured } from '@/lib/whatsapp/config'

/**
 * The action the caller should take for WhatsApp.
 */
export type WhatsAppMessageAction =
  | { kind: 'send_template'; templateName: string }
  | { kind: 'send_free_form'; content: string }
  | { kind: 'skip'; reason: string }

export type WhatsAppMessageDecision = {
  /** What to do. */
  action: WhatsAppMessageAction
  /** Human-readable reason for logging / analytics. */
  reason: string
  /** True if WhatsApp is blocked for this customer entirely (not just this round). */
  whatsAppBlocked: boolean
  /** True if the caller should fall back to email for this recovery round. */
  fallbackToEmail: boolean
  /** Meta error code if the decision was driven by a provider failure. */
  metaErrorCode?: number
}

/**
 * Input to the decision engine. All fields optional; missing fields result in
 * a conservative (block) decision.
 */
export type WhatsAppDecisionInput = {
  /** Customer's phone number (any format; normalized internally). */
  phone?: string | null
  /** Consent / identity record from the customer registry. */
  identity?: {
    consentWhatsApp?: boolean | null
    optedOutAt?: Date | string | null
    suppressed?: boolean | null
    lastInboundAt?: Date | string | null
    phone?: string | null
  } | null
  /** Whether the cart has already been purchased. */
  cartConverted?: boolean
  /** Whether the store is active. */
  storeActive?: boolean
  /** Whether WhatsApp credentials are configured in the environment. */
  whatsappConfigured?: boolean
  /** Whether the phone is on the global opt-out list. */
  onOptOutList?: boolean
  /** Previous send failure, if this is a retry. */
  previousFailure?: {
    errorCode?: number
    errorSubcode?: number
    error?: string
    errorDetails?: string
  } | null
  /** Current recovery step (0-based). */
  step?: number
  /** Maximum recovery rounds for this campaign. */
  maxRounds?: number
}

/**
 * Evaluate whether WhatsApp can be used for this customer and what message
 * kind to send.
 *
 * Rules:
 *   1. Cart converted / store inactive / WhatsApp not configured → skip.
 *   2. Missing / invalid phone → skip.
 *   3. Opted out / suppressed / on opt-out list → skip, block future sends.
 *   4. No explicit WhatsApp consent → no business-initiated template.
 *   5. Consent + no prior inbound message → attempt approved template (business-initiated).
 *   6. Consent + open 24h service window → free-form is allowed; template also allowed.
 *   7. Consent + closed window → template only (no free-form).
 *   8. Previous 131049 (engagement limited) → skip WhatsApp, fallback to email.
 *   9. Previous permanent failure → skip WhatsApp, fallback to email.
 *   10. Previous config failure → skip WhatsApp, fallback to email (credential issue).
 */
export function decideWhatsAppMessage(
  input: WhatsAppDecisionInput,
): WhatsAppMessageDecision {
  const {
    phone,
    identity,
    cartConverted = false,
    storeActive = true,
    whatsappConfigured = false,
    onOptOutList = false,
    previousFailure = null,
    step = 0,
    maxRounds = 3,
  } = input

  const eligibility = evaluateWhatsAppEligibility({
    phone,
    identity,
    cartConverted,
    storeActive,
    whatsappConfigured,
    onOptOutList,
  })

  // ── Hard blocks ─────────────────────────────────────────────────────────
  if (!eligibility.eligible) {
    return {
      action: { kind: 'skip', reason: eligibility.code },
      reason: eligibility.reason,
      whatsAppBlocked: true,
      fallbackToEmail: false,
    }
  }

  // ── Previous failure handling ───────────────────────────────────────────
  if (previousFailure) {
    const { errorCode, errorSubcode, error, errorDetails } = previousFailure

    // 131049 / 130472: per-user marketing limit. Do not retry immediately.
    // Fall back to email for this round.
    if (isEngagementLimitedWhatsAppFailure({ errorCode, error, errorDetails, errorSubcode })) {
      return {
        action: { kind: 'skip', reason: 'whatsapp_engagement_limited' },
        reason: `Meta marketing limit (${errorCode ?? 'unknown'}): ${error ?? errorDetails ?? ''}`,
        whatsAppBlocked: true,
        fallbackToEmail: true,
        metaErrorCode: errorCode,
      }
    }

    // Permanent failure (undeliverable, bad template, bad params) → block WhatsApp.
    if (isPermanentWhatsAppFailure({ errorCode, error, errorDetails, errorSubcode })) {
      return {
        action: { kind: 'skip', reason: 'whatsapp_permanent' },
        reason: `Permanent WhatsApp failure (${errorCode ?? 'unknown'}): ${error ?? errorDetails ?? ''}`,
        whatsAppBlocked: true,
        fallbackToEmail: true,
        metaErrorCode: errorCode,
      }
    }

    // Config failure (token, scopes, app restricted) → block WhatsApp this round.
    if (isConfigWhatsAppFailure({ errorCode, error, errorDetails, errorSubcode })) {
      return {
        action: { kind: 'skip', reason: 'whatsapp_config' },
        reason: `WhatsApp configuration failure (${errorCode ?? 'unknown'}): ${error ?? errorDetails ?? ''}`,
        whatsAppBlocked: true,
        fallbackToEmail: true,
        metaErrorCode: errorCode,
      }
    }

    // Transient failure (network, rate limit) → retry is allowed.
  }

  // ── Consent check ───────────────────────────────────────────────────────
  // If eligibility passed but consent is not explicit, block WhatsApp.
  // (This is a safety net; eligibility already returns not-eligible when
  // consentWhatsApp !== true, so this branch is rarely reached.)
  const hasConsent = Boolean(identity?.consentWhatsApp === true)
  if (!hasConsent) {
    return {
      action: { kind: 'skip', reason: 'no_whatsapp_consent' },
      reason: 'No explicit WhatsApp consent recorded',
      whatsAppBlocked: false,
      fallbackToEmail: false,
    }
  }

  // ── WhatsApp provider check ─────────────────────────────────────────────
  if (!whatsappConfigured || !resolveWhatsAppPhoneNumberId()) {
    return {
      action: { kind: 'skip', reason: 'whatsapp_not_configured' },
      reason: 'WhatsApp Business API is not configured',
      whatsAppBlocked: false,
      fallbackToEmail: false,
    }
  }

  // ── Round / step limits ─────────────────────────────────────────────────
  if (step >= Math.max(1, maxRounds)) {
    return {
      action: { kind: 'skip', reason: 'max_rounds_reached' },
      reason: 'Maximum recovery rounds reached',
      whatsAppBlocked: false,
      fallbackToEmail: false,
    }
  }

  // ── 24-hour service window check ────────────────────────────────────────
  // The window governs free-form conversational messaging, NOT business-
  // initiated templates. If the customer messaged us within the last 24h,
  // free-form is permitted. Otherwise we must use an approved template.
  const lastInboundAt = identity?.lastInboundAt
    ? new Date(identity.lastInboundAt).getTime()
    : 0
  const windowOpen =
    lastInboundAt > 0 && Date.now() - lastInboundAt < 24 * 60 * 60 * 1000

  if (windowOpen) {
    // Free-form conversational messaging is allowed inside the window.
    // The caller provides the content (composed by the AI layer).
    return {
      action: { kind: 'send_free_form', content: '' },
      reason: '24-hour customer-service window is open — free-form messaging allowed',
      whatsAppBlocked: false,
      fallbackToEmail: false,
    }
  }

  // ── Business-initiated template delivery ────────────────────────────────
  // Outside the window, Meta requires an approved template. The caller must
  // supply the template name and params. We do NOT require a prior inbound
  // message — explicit opt-in is sufficient.
  return {
    action: { kind: 'send_template', templateName: '' },
    reason: 'Business-initiated template delivery (no prior inbound message required)',
    whatsAppBlocked: false,
    fallbackToEmail: false,
  }
}

/**
 * Narrow a WhatsAppMessageDecision to a boolean "can send" answer, for
 * callers that only need eligibility (e.g. channel selection in the sweep).
 */
export function canSendWhatsApp(input: WhatsAppDecisionInput): boolean {
  const decision = decideWhatsAppMessage(input)
  return decision.action.kind === 'send_template' || decision.action.kind === 'send_free_form'
}

/**
 * Classify a Meta send failure into a decision-relevant category.
 */
export function classifyWhatsAppFailure(failure: {
  errorCode?: number
  errorSubcode?: number
  error?: string
  errorDetails?: string
}): {
  category: 'engagement_limited' | 'permanent' | 'config' | 'transient' | 'unknown'
  fallbackToEmail: boolean
} {
  if (isEngagementLimitedWhatsAppFailure(failure)) {
    return { category: 'engagement_limited', fallbackToEmail: true }
  }
  if (isPermanentWhatsAppFailure(failure)) {
    return { category: 'permanent', fallbackToEmail: true }
  }
  if (isConfigWhatsAppFailure(failure)) {
    return { category: 'config', fallbackToEmail: true }
  }
  return { category: 'transient', fallbackToEmail: false }
}
