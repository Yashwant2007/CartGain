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

export interface RestoredApplicationTermination {
  terminationKind: ApplicationTerminationKind | null
  conversationState: string | null
  escalation: 'human_support_required' | null
  engineResponse: PublicEngineResponse | null
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

export function restoredApplicationTerminationFromMessages(
  messages: Array<{ role?: unknown; metadata?: unknown }> | null | undefined,
): RestoredApplicationTermination {
  const empty: RestoredApplicationTermination = {
    terminationKind: null,
    conversationState: null,
    escalation: null,
    engineResponse: null,
  }
  if (!Array.isArray(messages)) return empty

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (!message || message.role !== 'ai') continue
    if (!message.metadata || typeof message.metadata !== 'object' || Array.isArray(message.metadata)) continue
    const metadata = message.metadata as Record<string, unknown>
    const kind = metadata.terminationKind
    if (kind !== 'opt_out' && kind !== 'human_support') continue
    const engineValue = metadata.engineResponse
    const engineResponse = engineValue && typeof engineValue === 'object' && !Array.isArray(engineValue)
      && typeof (engineValue as Record<string, unknown>).message === 'string'
      ? engineValue as unknown as PublicEngineResponse
      : null
    return {
      terminationKind: kind,
      conversationState: typeof metadata.conversationState === 'string' ? metadata.conversationState : null,
      escalation: metadata.escalation === 'human_support_required' ? 'human_support_required' : null,
      engineResponse,
    }
  }
  return empty
}
