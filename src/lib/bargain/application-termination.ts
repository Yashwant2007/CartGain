import type { PublicEngineResponse } from './engine-contract'
import { uiText } from './i18n'

export type ApplicationTerminationKind = 'opt_out' | 'human_support'

export interface ApplicationTerminationBody {
  message: string
  terminal: true
  status: 'abandoned'
  terminationKind: ApplicationTerminationKind
  conversationState: 'CANCELLED' | 'HUMAN_SUPPORT_REQUIRED'
  escalation?: 'human_support_required'
  engineResponse: PublicEngineResponse
}

export function applicationTerminationBody(
  kind: ApplicationTerminationKind,
  lang: string | undefined | null,
): ApplicationTerminationBody {
  const human = kind === 'human_support'
  const conversationState = human ? 'HUMAN_SUPPORT_REQUIRED' as const : 'CANCELLED' as const
  const message = uiText(lang, human ? 'human_support' : 'opt_out')
  const engineResponse: PublicEngineResponse = {
    message,
    decision: human ? 'escalate' : 'no_offer',
    proposedOffer: { kind: 'none', reason: human ? 'escalation' : 'no_offer' },
    cta: null,
    conversationState,
  }
  return {
    message,
    terminal: true,
    status: 'abandoned',
    terminationKind: kind,
    conversationState,
    ...(human ? { escalation: 'human_support_required' as const } : {}),
    engineResponse,
  }
}
