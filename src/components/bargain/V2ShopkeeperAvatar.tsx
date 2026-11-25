'use client'

import { useEffect, useState } from 'react'
import type { AvatarState } from '@/lib/bargain/experience/avatar-state'
import type { ExpressionState } from '@/lib/bargain/experience/expressions'
import {
  isV2AvatarVariant,
  V2_AVATARS,
  V2_CELL_POSITIONS,
  v2CellForExpression,
  v2MotionForState,
  type V2AvatarVariant,
} from '@/lib/bargain/experience/v2-shopkeepers'
import { isVrmAvatarVariant } from '@/lib/bargain/experience/vrm-shopkeepers'
import { REACTION_MOTION, v2ReactionCell, v2ReactionSheet, type BargainReaction } from '@/lib/bargain/experience/reactions'
import VrmShopkeeperAvatar from './VrmShopkeeperAvatar'

interface Props {
  variant: V2AvatarVariant | string
  expression: ExpressionState
  state?: AvatarState
  eventSequence?: number
  motionEnabled?: boolean
  essentialMotionOnly?: boolean
  reaction?: BargainReaction | null
}

const V2_CSS = `
.cg-v2 { position: relative; width: 168px; height: 194px; flex-shrink: 0; pointer-events: none; }
.cg-v2-glow { position: absolute; inset: 6px 4px 26px; border-radius: 50%; background: radial-gradient(ellipse at center, color-mix(in srgb, var(--cg-v2-accent) 22%, transparent), transparent 68%); opacity: .75; }
.cg-v2-shadow { position: absolute; left: 50%; bottom: 1px; width: 70px; height: 9px; transform: translateX(-50%); border-radius: 50%; background: rgba(15,118,110,.16); filter: blur(5px); }
.cg-v2-art { position: absolute; left: 0; top: 13px; width: 168px; height: 168px; background-repeat: no-repeat; background-size: 200% 200%; border-radius: 50%; clip-path: ellipse(50% 50% at 50% 50%); transform-origin: 50% 84%; will-change: transform; filter: drop-shadow(0 5px 9px rgba(15,23,42,.08)); }
.cg-v2-art--reaction { clip-path: none; border-radius: 18px; mix-blend-mode: multiply; }
.cg-v2--soft .cg-v2-art { transition: transform 420ms cubic-bezier(.2,.8,.2,1), background-position 180ms ease-out; }
.cg-v2--bouncy .cg-v2-art { transition: transform 300ms cubic-bezier(.2,1.4,.35,1), background-position 160ms ease-out; }
.cg-v2--precise .cg-v2-art { transition: transform 260ms cubic-bezier(.4,0,.2,1), background-position 140ms linear; }
.cg-v2--motion-listen .cg-v2-art { animation: cgV2Breathe 3.4s ease-in-out infinite; }
.cg-v2--motion-think .cg-v2-art { animation: cgV2Tilt 2.4s ease-in-out infinite; }
.cg-v2--motion-present .cg-v2-art { animation: cgV2Lean 1.6s ease-in-out infinite; }
.cg-v2--motion-guide .cg-v2-art { animation: cgV2Guide 1.4s ease-in-out infinite; }
.cg-v2--motion-enter .cg-v2-art { animation: cgV2Enter .5s cubic-bezier(.2,.9,.3,1.2) 1; }
.cg-v2--motion-celebrate .cg-v2-art { animation: cgV2Celebrate .8s cubic-bezier(.2,1.3,.3,1) 1; }
.cg-v2--motion-recede .cg-v2-art { animation: cgV2Recede .45s ease-out 1; }
.cg-v2--essential .cg-v2-art { animation: none; }
.cg-v2--essential.cg-v2--motion-enter .cg-v2-art { animation: cgV2Enter .5s cubic-bezier(.2,.9,.3,1.2) 1; }
.cg-v2--essential.cg-v2--motion-celebrate .cg-v2-art { animation: cgV2Celebrate .8s cubic-bezier(.2,1.3,.3,1) 1; }
.cg-v2--essential.cg-v2--motion-recede .cg-v2-art { animation: cgV2Recede .45s ease-out 1; }
.cg-v2[data-v2-reaction-motion="listen"] .cg-v2-art { animation: cgV2ReactSettle .5s ease-out 1; }
.cg-v2[data-v2-reaction-motion="settle"] .cg-v2-art { animation: cgV2ReactSettle .5s ease-out 1; }
.cg-v2[data-v2-reaction-motion="pop"] .cg-v2-art { animation: cgV2ReactPop .46s cubic-bezier(.2,.9,.3,1.4) 1; }
.cg-v2[data-v2-reaction-motion="shake"] .cg-v2-art { animation: cgV2ReactShake .5s ease-in-out 1; }
.cg-v2[data-v2-reaction-motion="nod"] .cg-v2-art { animation: cgV2ReactNod .56s ease-in-out 1; }
.cg-v2[data-v2-reaction-motion="bounce"] .cg-v2-art { animation: cgV2ReactBounce .7s ease-in-out 1; }
.cg-v2[data-v2-reaction-motion="wave"] .cg-v2-art { animation: cgV2ReactWave .7s ease-in-out 1; }
.cg-v2[data-v2-reaction-motion="tilt"] .cg-v2-art { animation: cgV2ReactTilt .62s ease-in-out 1; }
.cg-v2[data-v2-reaction-motion="lean"] .cg-v2-art { animation: cgV2ReactLean .62s ease-out 1; }
.cg-v2[data-v2-reaction-motion="present"] .cg-v2-art { animation: cgV2ReactPresent .62s cubic-bezier(.2,.9,.3,1.2) 1; }
.cg-v2[data-v2-reaction-motion="recede"] .cg-v2-art { animation: cgV2ReactRecede .62s ease-out 1; }
.cg-v2[data-v2-reaction-motion="celebrate"] .cg-v2-art { animation: cgV2Celebrate .8s cubic-bezier(.2,1.3,.3,1) 1; }
.cg-v2[data-expression="disappointed"] .cg-v2-art,
.cg-v2[data-expression="error"] .cg-v2-art { filter: saturate(.86) drop-shadow(0 4px 8px rgba(15,23,42,.06)); }
@keyframes cgV2Breathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-1px) scale(1.012); } }
@keyframes cgV2Tilt { 0%,100% { transform: rotate(-1deg) translateY(0); } 50% { transform: rotate(2.4deg) translateY(-1px); } }
@keyframes cgV2Lean { 0%,100% { transform: translateX(0) scale(1); } 50% { transform: translateX(3px) scale(1.025); } }
@keyframes cgV2Guide { 0%,100% { transform: translateX(0) rotate(0deg); } 50% { transform: translateX(5px) rotate(-1deg); } }
@keyframes cgV2Enter { 0% { transform: translateX(22px) scale(.92); opacity: .25; } 70% { transform: translateX(-3px) scale(1.03); opacity: 1; } 100% { transform: translateX(0) scale(1); opacity: 1; } }
@keyframes cgV2Celebrate { 0%,100% { transform: translateY(0) scale(1) rotate(0deg); } 40% { transform: translateY(-6px) scale(1.06) rotate(-2deg); } 70% { transform: translateY(-2px) scale(1.03) rotate(2deg); } }
@keyframes cgV2Recede { 0% { transform: translateX(0) scale(1); opacity: 1; } 100% { transform: translateX(-4px) scale(.96); opacity: .72; } }
@keyframes cgV2ReactSettle { 0% { transform: translateY(2px) scale(.985); } 100% { transform: translateY(0) scale(1); } }
@keyframes cgV2ReactPop { 0% { transform: scale(.92); } 55% { transform: scale(1.07); } 100% { transform: scale(1); } }
@keyframes cgV2ReactShake { 0%,100% { transform: translateX(0) rotate(0deg); } 25% { transform: translateX(-3px) rotate(-1.5deg); } 60% { transform: translateX(3px) rotate(1.5deg); } }
@keyframes cgV2ReactNod { 0%,100% { transform: rotate(0deg) translateY(0); } 45% { transform: rotate(2deg) translateY(2px); } }
@keyframes cgV2ReactBounce { 0%,100% { transform: translateY(0) scale(1); } 40% { transform: translateY(-5px) scale(1.035); } 72% { transform: translateY(0) scale(.985); } }
@keyframes cgV2ReactWave { 0%,100% { transform: rotate(0deg); } 35% { transform: rotate(-3deg); } 70% { transform: rotate(3deg); } }
@keyframes cgV2ReactTilt { 0%,100% { transform: rotate(0deg) translateY(0); } 50% { transform: rotate(2deg) translateY(-2px); } }
@keyframes cgV2ReactLean { 0%,100% { transform: translateX(0) scale(1); } 50% { transform: translateX(4px) scale(1.02); } }
@keyframes cgV2ReactPresent { 0% { transform: translateX(-4px) scale(.97); opacity: .75; } 65% { transform: translateX(3px) scale(1.03); opacity: 1; } 100% { transform: translateX(0) scale(1); } }
@keyframes cgV2ReactRecede { 0% { transform: translateX(0) scale(1); } 55% { transform: translateX(-4px) scale(.97); } 100% { transform: translateX(0) scale(1); } }
@media (max-width: 480px) { .cg-v2 { width: 134px; height: 158px; } .cg-v2-art { width: 134px; height: 134px; top: 10px; } .cg-v2-shadow { width: 58px; } }
@media (prefers-reduced-motion: reduce) { .cg-v2, .cg-v2 * { animation: none !important; transition: none !important; } }
`

export default function V2ShopkeeperAvatar({
  variant,
  expression,
  state,
  eventSequence,
  motionEnabled = true,
  essentialMotionOnly = false,
  reaction = null,
}: Props) {
  const [reducedMotion, setReducedMotion] = useState(false)
  const resolved = isV2AvatarVariant(variant) ? variant : 'morgan'
  const meta = V2_AVATARS[resolved]
  const cell = v2CellForExpression(expression)
  const reactionCell = reaction ? v2ReactionCell(reaction) : null
  const artImage = reactionCell ? v2ReactionSheet(resolved, reactionCell.sheet) : meta.expressionSheet
  const artPosition = reactionCell?.position ?? V2_CELL_POSITIONS[cell]
  const motion = v2MotionForState(state)
  const animate = motionEnabled && !reducedMotion
  const reactionMotion = reaction && animate ? REACTION_MOTION[reaction] : null
  const rootClass = [
    'cg-v2',
    `cg-v2--${meta.motion}`,
    `cg-v2--motion-${motion}`,
    animate ? '' : 'cg-v2--essential',
    animate && essentialMotionOnly ? 'cg-v2--essential' : '',
    ['enter', 'celebrate', 'recede'].includes(motion) && animate ? 'cg-v2--finite' : '',
  ].filter(Boolean).join(' ')

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  if (isVrmAvatarVariant(variant)) {
    return (
      <VrmShopkeeperAvatar
        variant={variant}
        expression={expression}
        state={state}
        reaction={reaction}
        eventSequence={eventSequence}
        motionEnabled={motionEnabled}
        essentialMotionOnly={essentialMotionOnly}
      />
    )
  }

  return (
    <div
      className={rootClass}
      role="img"
      aria-label={`${meta.name}, ${meta.role}, ${reaction ? `${reaction.replace('_', ' ')} reaction` : `${expression} expression`}`}
      data-v2-variant={resolved}
      data-v2-cell={cell}
      data-v2-reaction={reaction ?? ''}
      data-v2-reaction-motion={reactionMotion ?? ''}
      data-v2-sheet={reactionCell ? 'reaction' : 'expression'}
      data-v2-state={state ?? ''}
      data-v2-motion={motion}
      style={{ '--cg-v2-accent': meta.accent } as React.CSSProperties}
    >
      <style dangerouslySetInnerHTML={{ __html: V2_CSS }} />
      <span className="cg-v2-glow" aria-hidden="true" />
      <span
        key={`${reaction ?? 'expression'}:${artPosition}:${eventSequence ?? 0}`}
        className={`cg-v2-art${reactionCell ? ' cg-v2-art--reaction' : ''}`}
        aria-hidden="true"
        style={{ backgroundImage: `url(${artImage})`, backgroundPosition: artPosition }}
      />
      <span className="cg-v2-shadow" aria-hidden="true" />
    </div>
  )
}
