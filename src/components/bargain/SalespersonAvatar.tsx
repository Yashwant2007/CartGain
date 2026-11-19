'use client'

import { useMemo } from 'react'
import {
  SALESPERSON_PERSONA_CONFIG,
  type AvatarEmotion,
  type AvatarGesture,
  type SalespersonPersona,
} from '@/types/negotiation'

interface Props {
  persona: SalespersonPersona
  emotion?: AvatarEmotion
  gesture?: AvatarGesture
  /** Essential motion only: keeps expression changes, drops idle loops/blink. */
  motionEnabled?: boolean
  essentialMotionOnly?: boolean
  /** Pixel size of the square stage. Defaults to 128. */
  size?: number
  /** Normalised eye-gaze target in [-1, 1]. Pass the text cursor / pointer. */
  gaze?: { x: number; y: number } | null
  /** Draws a subtle mouth-movement loop while the shopkeeper "speaks". */
  speaking?: boolean
  className?: string
}

/**
 * A dependency-free, 2.5D procedural shopkeeper.
 *
 * This is a *scaffold*: it renders an articulated SVG character with persona
 * colour/posture, emotion cross-fades and gaze tracking, and exposes stable
 * `data-*` hooks so it can later be swapped for a WebGL / Rive rig without
 * changing the call site. It performs no negotiation logic and holds no
 * pricing state.
 */
const AVATAR_CSS = `
.cg-sa { position: relative; display: inline-block; line-height: 0; }
.cg-sa__stage {
  display: block; width: 100%; height: 100%;
  transform-origin: 50% 88%;
  transition: transform 420ms cubic-bezier(.2,.75,.25,1);
  will-change: transform;
}
.cg-sa__figure { transform-origin: 50% 88%; }
.cg-sa--breathe .cg-sa__figure { animation: cgSaBreathe 3.8s ease-in-out infinite; }
.cg-sa--bob .cg-sa__figure { animation: cgSaBob 2.2s ease-in-out infinite; }
.cg-sa--sway .cg-sa__figure { animation: cgSaSway 3s ease-in-out infinite; }
.cg-sa__lid { transform-box: fill-box; transform-origin: center; animation: cgSaBlink 5s infinite; }
.cg-sa__mouth--speak { animation: cgSaSpeak .42s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.cg-sa__pupil { transition: transform 160ms ease-out; }
.cg-sa__mouth, .cg-sa__brow, .cg-sa__hand, .cg-sa__lid { transition: opacity 320ms ease, transform 420ms cubic-bezier(.2,.75,.25,1); }
.cg-sa__aura { transition: fill 420ms ease, opacity 420ms ease; }
.cg-sa__accent { transition: fill 420ms ease; }
@keyframes cgSaBreathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.012); } }
@keyframes cgSaBob { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-3px) rotate(1.4deg); } }
@keyframes cgSaSway { 0%,100% { transform: rotate(-0.8deg); } 50% { transform: rotate(0.8deg); } }
@keyframes cgSaBlink { 0%,44%,48%,100% { transform: scaleY(1); } 46% { transform: scaleY(0.08); } }
@keyframes cgSaSpeak { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.55); } }
.cg-sa__lowball { animation: cgSaNo .5s ease-in-out; }
@keyframes cgSaNo { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
@media (prefers-reduced-motion: reduce) {
  .cg-sa__stage, .cg-sa__figure, .cg-sa__pupil, .cg-sa__mouth, .cg-sa__brow, .cg-sa__hand { transition: none !important; animation: none !important; }
}
`

type MouthShape = 'smile' | 'neutral' | 'frown' | 'open' | 'smirk'

interface Expression {
  mouth: MouthShape
  browLift: number
  browTilt: number
  eyesScale: number
  lean: string
}

const EXPRESSIONS: Record<AvatarEmotion, Expression> = {
  idle: { mouth: 'neutral', browLift: 0, browTilt: 0, eyesScale: 1, lean: 'translateY(0) rotate(0deg)' },
  listening: { mouth: 'smile', browLift: 1, browTilt: -1, eyesScale: 1.02, lean: 'translateY(1px) rotate(0deg)' },
  thinking: { mouth: 'neutral', browLift: 0, browTilt: -6, eyesScale: 0.98, lean: 'translateY(2px) rotate(0.6deg)' },
  considering: { mouth: 'smirk', browLift: 1, browTilt: -3, eyesScale: 1, lean: 'translateY(2px) rotate(0.4deg)' },
  lowball: { mouth: 'frown', browLift: -1, browTilt: 8, eyesScale: 0.94, lean: 'translateY(-6px) rotate(-1deg) scale(0.97)' },
  counter: { mouth: 'smile', browLift: 1, browTilt: -2, eyesScale: 1, lean: 'translateX(3px) rotate(-0.4deg)' },
  stern: { mouth: 'frown', browLift: 0, browTilt: 9, eyesScale: 0.95, lean: 'translateY(-4px) rotate(-0.8deg)' },
  disappointed: { mouth: 'frown', browLift: -2, browTilt: 4, eyesScale: 0.9, lean: 'translateY(-5px) rotate(1deg) scale(0.98)' },
  happy: { mouth: 'smile', browLift: 2, browTilt: -2, eyesScale: 1.04, lean: 'translateY(-2px) rotate(0deg)' },
  celebrating: { mouth: 'open', browLift: 2, browTilt: -2, eyesScale: 1.06, lean: 'translateY(-3px) rotate(0deg)' },
}

const GESTURE_TRANSFORM: Record<AvatarGesture, { left: string; right: string }> = {
  none: { left: 'translate(0,0)', right: 'translate(0,0)' },
  chin: { left: 'translate(0,0)', right: 'translate(-18,-30) rotate(-18deg)' },
  point: { left: 'translate(0,0)', right: 'translate(20,-14) rotate(8deg)' },
  open_palm: { left: 'translate(0,0)', right: 'translate(14,-10) rotate(10deg)' },
  crossed_arms: { left: 'translate(22,-14) rotate(24deg)', right: 'translate(-22,-14) rotate(-24deg)' },
  wave: { left: 'translate(0,0)', right: 'translate(20,-34) rotate(14deg)' },
  thumbs_up: { left: 'translate(0,0)', right: 'translate(16,-30) rotate(6deg)' },
}

function Mouth({ shape, speaking }: { shape: MouthShape; speaking: boolean }) {
  const paths: Record<MouthShape, string> = {
    smile: 'M84 132 Q100 143 116 132',
    neutral: 'M86 133 L114 133',
    frown: 'M84 136 Q100 128 116 136',
    open: 'M88 130 Q100 144 112 130 Q100 140 88 130',
    smirk: 'M86 133 Q100 138 116 130',
  }
  return (
    <path
      className={`cg-sa__mouth${speaking && shape !== 'open' ? ' cg-sa__mouth--speak' : ''}`}
      d={paths[shape]}
      fill={shape === 'open' ? '#7f1d1d' : 'none'}
      stroke="#7c2d12"
      strokeWidth={2.4}
      strokeLinecap="round"
    />
  )
}

export default function SalespersonAvatar({
  persona,
  emotion = 'idle',
  gesture = 'none',
  motionEnabled = true,
  essentialMotionOnly = false,
  size = 128,
  gaze = null,
  speaking = false,
  className,
}: Props) {
  const config = SALESPERSON_PERSONA_CONFIG[persona] ?? SALESPERSON_PERSONA_CONFIG.collaborative
  const expression = EXPRESSIONS[emotion] ?? EXPRESSIONS.idle
  const hands = GESTURE_TRANSFORM[gesture] ?? GESTURE_TRANSFORM.none

  const pupil = useMemo(() => {
    if (!gaze) return 'translate(0,0)'
    const x = Math.max(-1, Math.min(1, gaze.x)) * 2.2
    const y = Math.max(-1, Math.min(1, gaze.y)) * 1.6
    return `translate(${x.toFixed(2)},${y.toFixed(2)})`
  }, [gaze])

  const animate = motionEnabled && !essentialMotionOnly
  const stageClass = `cg-sa__stage cg-sa--${config.idleMotion}${emotion === 'lowball' ? ' cg-sa__lowball' : ''}`

  return (
    <span
      className={`cg-sa ${className ?? ''}`.trim()}
      style={{ width: size, height: size }}
      data-persona={persona}
      data-emotion={emotion}
      data-gesture={gesture}
      role="img"
      aria-label={`${config.label}, ${emotion}`}
    >
      <style dangerouslySetInnerHTML={{ __html: AVATAR_CSS }} />
      <svg
        className="cg-sa__stage"
        viewBox="0 0 200 220"
        width={size}
        height={size}
        style={{ transform: expression.lean, overflow: 'visible' }}
        aria-hidden="true"
      >
        <g
          className="cg-sa__figure"
          style={animate ? undefined : { animation: 'none' }}
        >
          <ellipse
            className="cg-sa__aura"
            cx="100"
            cy="150"
            rx="86"
            ry="64"
            fill={config.aura}
            opacity={emotion === 'celebrating' ? 1 : 0.85}
          />

          {/* Torso + apron */}
          <path d="M52 220 Q52 158 100 154 Q148 158 148 220 Z" fill={config.accent} opacity={0.95} />
          <path d="M84 158 L116 158 L110 220 L90 220 Z" fill="#ffffff" opacity={0.16} />
          <circle cx="100" cy="176" r="5" fill={config.rim} opacity={0.9} />

          {/* Neck */}
          <rect x="90" y="140" width="20" height="18" rx="8" fill="#e8b58e" />

          {/* Head */}
          <ellipse cx="100" cy="108" rx="42" ry="46" fill="#f3c9a3" />
          {/* Hair */}
          <path d="M58 100 Q60 58 100 56 Q140 58 142 100 Q126 78 100 78 Q74 78 58 100 Z" fill="#3f2a1d" />

          {/* Ears */}
          <circle cx="59" cy="110" r="7" fill="#e8b58e" />
          <circle cx="141" cy="110" r="7" fill="#e8b58e" />

          {/* Brows */}
          <g
            className="cg-sa__brow"
            style={{ transform: `translateY(${-expression.browLift}px) rotate(${expression.browTilt}deg)`, transformOrigin: '100px 92px' }}
          >
            <path d="M74 92 Q84 88 94 91" stroke="#3f2a1d" strokeWidth={3.2} strokeLinecap="round" fill="none" />
            <path d="M106 91 Q116 88 126 92" stroke="#3f2a1d" strokeWidth={3.2} strokeLinecap="round" fill="none" />
          </g>

          {/* Eyes */}
          <g style={{ transform: `scale(${expression.eyesScale})`, transformOrigin: '100px 106px' }}>
            <ellipse cx="86" cy="106" rx="8" ry="9" fill="#ffffff" />
            <ellipse cx="114" cy="106" rx="8" ry="9" fill="#ffffff" />
            <g className="cg-sa__pupil" style={{ transform: pupil }}>
              <circle cx="86" cy="107" r="3.6" fill="#1f2937" />
              <circle cx="114" cy="107" r="3.6" fill="#1f2937" />
            </g>
            {animate && (
              <>
                <ellipse className="cg-sa__lid" cx="86" cy="106" rx="8" ry="9" fill="#f3c9a3" />
                <ellipse className="cg-sa__lid" cx="114" cy="106" rx="8" ry="9" fill="#f3c9a3" />
              </>
            )}
          </g>

          {/* Nose */}
          <path d="M100 112 Q103 119 98 121" stroke="#d99b72" strokeWidth={2} fill="none" strokeLinecap="round" />

          {/* Mouth */}
          <Mouth shape={expression.mouth} speaking={speaking} />

          {/* Hands (foreground — the "holding the screen" layer) */}
          <g className="cg-sa__hand" style={{ transform: hands.left, transformOrigin: '70px 200px' }}>
            <ellipse cx="70" cy="202" rx="15" ry="11" fill="#f3c9a3" />
            <rect x="60" y="210" width="20" height="12" rx="6" fill={config.accent} opacity={0.9} />
          </g>
          <g className="cg-sa__hand" style={{ transform: hands.right, transformOrigin: '130px 200px' }}>
            <ellipse cx="130" cy="202" rx="15" ry="11" fill="#f3c9a3" />
            <rect x="120" y="210" width="20" height="12" rx="6" fill={config.accent} opacity={0.9} />
            {gesture === 'thumbs_up' && (
              <rect x="126" y="188" width="8" height="16" rx="4" fill="#f3c9a3" />
            )}
          </g>
        </g>
      </svg>
    </span>
  )
}
