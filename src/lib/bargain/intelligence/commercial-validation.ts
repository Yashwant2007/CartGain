import { buildExecutablePrice } from '@/lib/financial-safety'
import type { ProductContext } from '../product-context'
import type { OfferValidationReason } from '../offer-validation'
import { validateOffer } from '../offer-validation'
import type { CommercialValidationView } from './types'

interface CommercialValidationInput {
  customerOffer?: number | null
  proposedPrice?: number | null
  originalPrice: number
  minPrice: number
  attemptsUsed: number
  maxAttempts: number
  product?: ProductContext | null
  sessionStatus?: string | null
  emergencyPaused?: boolean
  campaignActive?: boolean | null
  offerQuantity?: number | null
  couponMentioned?: boolean
  couponsAllowed?: boolean
  dealAccepted?: boolean
  offerClarificationNeeded?: boolean
}

function executableReason(reason: string | undefined): OfferValidationReason {
  switch (reason) {
    case 'invalid_original_price':
    case 'invalid_final_price':
    case 'final_price_exceeds_original':
      return 'INVALID_PRICE'
    case 'below_floor':
    case 'charge_below_floor_unresolvable':
      return 'BELOW_FLOOR_REJECTED'
    default:
      return 'INVALID_PRICE'
  }
}

export function validateCommercialTurn(input: CommercialValidationInput): CommercialValidationView {
  if (input.offerClarificationNeeded === true) {
    return {
      checked: true,
      ok: false,
      reason: 'AMBIGUOUS_OFFER_BASIS',
      floorSafe: true,
      math: 'not_applicable',
      executable: false,
    }
  }

  const requestedPrice = input.proposedPrice ?? input.customerOffer
  if (requestedPrice == null || !Number.isFinite(requestedPrice)) {
    return {
      checked: false,
      ok: true,
      reason: null,
      floorSafe: true,
      math: 'not_applicable',
      executable: false,
    }
  }

  const validation = validateOffer({
    requestedPrice,
    originalPrice: input.originalPrice,
    floorPrice: input.minPrice,
    attemptsUsed: input.attemptsUsed,
    maxAttempts: input.maxAttempts,
    variantAvailable: input.product?.selectedVariant?.available ?? null,
    productAvailable: input.product?.available ?? null,
    campaignActive: input.campaignActive ?? null,
    sessionExpired: input.sessionStatus === 'expired',
    emergencyPaused: input.emergencyPaused === true,
    couponMentioned: input.couponMentioned === true,
    couponsAllowed: input.couponsAllowed !== false,
  })

  if (!validation.ok) {
    return {
      checked: true,
      ok: false,
      reason: validation.reason,
      floorSafe: validation.reason !== 'BELOW_FLOOR_REJECTED' && validation.reason !== 'INVALID_PRICE',
      math: 'minor_units',
      executable: false,
    }
  }

  const executable = buildExecutablePrice({
    originalPrice: input.originalPrice,
    finalPrice: requestedPrice,
    floorPrice: input.minPrice,
    bulkQuantity: input.offerQuantity ?? null,
  })

  return {
    checked: true,
    ok: executable.ok,
    reason: executable.ok ? 'OFFER_ACCEPTED' : executableReason(executable.reason),
    floorSafe: executable.ok,
    math: 'minor_units',
    executable: executable.ok,
  }
}
