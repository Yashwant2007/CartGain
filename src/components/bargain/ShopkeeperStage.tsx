'use client'

import { useEffect, useState } from 'react'
import LivingShopkeeper3D from './LivingShopkeeper3D.lazy'
import V2ShopkeeperAvatar from './V2ShopkeeperAvatar'
import ShopkeeperAvatar from './ShopkeeperAvatar'
import { toCharacter3DState } from '@/lib/bargain/character3d/state-map'
import type { ExpressionState } from '@/lib/bargain/experience/expressions'
import type { AvatarState } from '@/lib/bargain/experience/avatar-state'
import type { GestureName } from '@/lib/bargain/experience/character'
import { POSITION_DESCRIPTORS, type AvatarPosition } from '@/lib/bargain/experience/positions'
import type { AvatarVariant, CharacterStyle, ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import type { LivingEvent, LivingEventContext } from '@/lib/bargain/experience/avatar-state'
import { isVrmAvatarVariant } from '@/lib/bargain/experience/vrm-shopkeepers'

interface Props {
  personality: ShopkeeperPersonality
  expression: ExpressionState
  /** Living Shopkeeper body state. */
  state?: AvatarState
  /** Real event and context for the shared 3D planner. */
  event?: LivingEvent
  eventSequence?: number
  eventContext?: LivingEventContext
  /** Body language for the current state. */
  gesture?: GestureName
  /** Where the character is standing (explicit position manager). */
  position?: AvatarPosition
  /** Merchant-selected avatar. Omitted means legacy robot when 3D is enabled. */
  avatarVariant?: AvatarVariant
  /** Visual rendering style of the character. */
  characterStyle?: CharacterStyle
  /** Disable decorative (nonessential) motion. */
  essentialMotionOnly?: boolean
  name: string
  status: string
  line: string
  motionEnabled?: boolean
  /** Normalised gaze target in [-1, 1]; eyes follow the shopper's cursor. */
  gaze?: { x: number; y: number } | null
  /**
   * Render the shared articulated Three.js robot when enabled.
   */
  enable3D?: boolean
  /** Active bargain card observed in viewport coordinates for spatial animation. */
  targetRef?: React.RefObject<HTMLElement | null> | null
  /** Interactive controls that the character must remain clear of. */
  forbiddenRefs?: (React.RefObject<HTMLElement | null> | null)[]
  /** Show an asset diagnostic in merchant previews, never to shoppers. */
  showUnavailable?: boolean
  onUnavailable?: () => void
}

const STAGE_CSS = `
.cg-stage {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 12px;
  overflow: hidden;
  flex-shrink: 0;
  width: 100%;
  height: 204px;
  min-height: 204px;
  border-bottom: 1px solid #eef2f7;
  pointer-events: none;
  background:
    radial-gradient(circle at 18% 50%, rgba(20,184,166,0.12), transparent 34%),
    linear-gradient(90deg, #f7fbfc 0%, #ffffff 70%);
}
.cg-stage::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.32;
  background-image: radial-gradient(#c7d2fe 0.75px, transparent 0.75px);
  background-size: 15px 15px;
}
.cg-stage-spot {
  position: absolute;
  left: -20px;
  top: 50%;
  width: 158px;
  height: 158px;
  transform: translateY(-50%);
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(circle, rgba(99,102,241,0.2), transparent 68%);
}
.cg-stage-avatar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 168px;
  height: 194px;
}
.cg-stage-avatar::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -7px;
  width: 58px;
  height: 8px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: rgba(15,118,110,0.18);
  filter: blur(4px);
}
.cg-stage[data-avatar-renderer="disabled"] .cg-stage-avatar::after,
.cg-stage[data-avatar-renderer="unavailable"] .cg-stage-avatar::after,
.cg-stage[data-avatar-renderer="disabled"] .cg-stage-halo,
.cg-stage[data-avatar-renderer="unavailable"] .cg-stage-halo { display: none; }
.cg-stage-halo {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  border: 1px solid rgba(99,102,241,0.45);
  pointer-events: none;
  opacity: 0;
}
.cg-stage[data-expression="thinking"] .cg-stage-halo,
.cg-stage[data-expression="curious"] .cg-stage-halo {
  opacity: 1;
  animation: cgStageHalo 1.15s ease-in-out infinite;
}
.cg-stage[data-expression="celebrating"] .cg-stage-halo {
  opacity: 1;
  border-color: rgba(22,163,74,0.4);
  box-shadow: 0 0 0 6px rgba(34,197,94,0.08);
  animation: cgStageHalo .9s ease-in-out 1;
}
.cg-stage-copy {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 5px;
  min-height: 0;
}
.cg-stage-name {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cg-stage-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 700;
  color: #059669;
}
.cg-stage-status::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 0 3px rgba(52,211,153,0.16);
}
.cg-stage-line {
  width: 100%;
  max-width: 32ch;
  font-size: 12px;
  line-height: 1.45;
  color: #475569;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  animation: cgStageSpeak .3s ease-out 1;
}
.cg-stage[data-character-style="minimal"] .cg-stage-line { color: #64748b; font-size: 11.5px; }
.cg-stage-unavailable {
  width: 100%;
  padding: 14px 16px;
  color: #8a4b12;
  background: #fff8e8;
  border: 1px solid #f2d398;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.45;
}
/* Contextual placement — the position manager decides where the character
   stands, never ad-hoc absolute coordinates. */
.cg-stage.cg-living--recommendation .cg-stage-avatar,
.cg-stage.cg-living--checkout .cg-stage-avatar { order: 2; }
.cg-stage.cg-living--celebration {
  background:
    radial-gradient(circle at 50% 20%, rgba(34,197,94,0.16), transparent 42%),
    linear-gradient(135deg, #f4fdf7 0%, #ffffff 70%);
}
.cg-stage.cg-living--celebration .cg-stage-copy { text-align: center; }
.cg-stage.cg-living--explanation .cg-stage-spot {
  background: radial-gradient(circle, rgba(14,165,233,0.2), transparent 68%);
}
.cg-stage[data-essential-motion="true"] .cg-stage-halo { opacity: 0; animation: none; }
@keyframes cgStageHalo {
  0%, 100% { transform: scale(0.97); opacity: 0.55; }
  50% { transform: scale(1.04); opacity: 1; }
}
@keyframes cgStageSpeak {
  from { opacity: 0; transform: translateY(4px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (max-width: 480px) {
  .cg-stage { gap: 6px; padding: 2px 8px; height: 170px; min-height: 170px; }
  .cg-stage-spot, .cg-stage::before { display: none; }
  .cg-stage-name { font-size: 13px; }
  .cg-stage-avatar { width: 134px; height: 158px; }
  .cg-stage-avatar::after { width: 56px; height: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .cg-stage-halo, .cg-stage-line { animation: none !important; }
}
`

export default function ShopkeeperStage({
  personality,
  expression,
  state,
  event,
  eventSequence,
  eventContext,
  gesture = 'rest',
  position = 'conversation',
  avatarVariant,
  characterStyle = 'signature',
  essentialMotionOnly = false,
  name,
  status,
  line,
  motionEnabled = true,
  gaze = null,
  enable3D = false,
  showUnavailable = false,
  onUnavailable,
  targetRef = null,
  forbiddenRefs = [],
}: Props) {
  const descriptor = POSITION_DESCRIPTORS[position] ?? POSITION_DESCRIPTORS.conversation
  const [webglAvailable, setWebglAvailable] = useState(true)
  const [spatialTarget, setSpatialTarget] = useState<DOMRectReadOnly | null>(null)
  useEffect(() => {
    const target = targetRef?.current
    if (!target) { setSpatialTarget(null); return }
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setSpatialTarget(target.getBoundingClientRect()))
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(target)
    window.addEventListener('resize', measure, { passive: true })
    window.addEventListener('scroll', measure, { passive: true, capture: true })
    measure()
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [targetRef])
  const selectedVariant = avatarVariant ?? (enable3D ? 'robot' : 'none')
  const useVrm = isVrmAvatarVariant(selectedVariant)
  const useV2 = selectedVariant === 'morgan' || selectedVariant === 'riley' || selectedVariant === 'alex' || useVrm
  const useInline = selectedVariant === 'signature' || selectedVariant === 'minimal'
  const render3D = selectedVariant === 'robot' && enable3D && webglAvailable
  const renderer = useVrm ? 'vrm' : useV2 ? 'v2-sprite' : useInline ? 'inline' : render3D ? '3d' : webglAvailable ? 'disabled' : 'unavailable'
  return (
    <div
      className={`cg-stage ${descriptor.className}`}
      data-expression={expression}
      data-avatar-personality={personality}
      data-avatar-state={state ?? ''}
      data-avatar-position={position}
      data-avatar-variant={selectedVariant}
      data-gesture={gesture}
      data-character-style={characterStyle}
      data-essential-motion={essentialMotionOnly ? 'true' : 'false'}
      data-avatar-renderer={renderer}
    >
      <style dangerouslySetInnerHTML={{ __html: STAGE_CSS }} />
      <span className="cg-stage-spot" aria-hidden="true" />
      <div className="cg-stage-avatar">
        <span className="cg-stage-halo" aria-hidden="true" />
        {useV2 ? (
          <V2ShopkeeperAvatar
            variant={selectedVariant as 'morgan' | 'riley' | 'alex'}
            expression={expression}
            state={state}
            eventSequence={eventSequence}
            motionEnabled={motionEnabled}
            essentialMotionOnly={essentialMotionOnly}
          />
        ) : useInline ? (
          <ShopkeeperAvatar
            personality={personality}
            expression={expression}
            state={state}
            gesture={gesture}
            characterStyle={useInline ? characterStyle : 'signature'}
            motionEnabled={motionEnabled}
            essentialMotionOnly={essentialMotionOnly}
            gaze={gaze}
          />
        ) : render3D ? (
          <LivingShopkeeper3D
            personality={personality}
            state={toCharacter3DState(state, personality)}
            event={event}
            eventSequence={eventSequence}
            eventContext={eventContext}
            motionEnabled={motionEnabled}
            essentialMotionOnly={essentialMotionOnly}
            quality="high"
            size={192}
            spatialTarget={spatialTarget ?? undefined}
            forbiddenRefs={forbiddenRefs}
            onUnavailable={() => {
              setWebglAvailable(false)
              onUnavailable?.()
            }}
          />
        ) : showUnavailable && !webglAvailable ? (
          <div className="cg-stage-unavailable" role="status">
            The interactive 3D robot could not load in this browser. The bargain chat remains available.
          </div>
        ) : null}
      </div>
      <div className="cg-stage-copy">
        <div className="cg-stage-name">
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>{name}</span>
          <span className="cg-stage-status">{status}</span>
        </div>
        <span className="cg-stage-line">{line}</span>
      </div>
    </div>
  )
}
