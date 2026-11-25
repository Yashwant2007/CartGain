'use client'

import { useEffect, useState } from 'react'
import type { CharacterStyle, ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import type { ExpressionState } from '@/lib/bargain/experience/expressions'
import type { AvatarState } from '@/lib/bargain/experience/avatar-state'
import { characterProfile, supportsGestureLayer, type GestureName } from '@/lib/bargain/experience/character'
import { REACTION_EXPRESSION, REACTION_MOTION, REACTION_STATE, type BargainReaction } from '@/lib/bargain/experience/reactions'

interface Props {
  personality: ShopkeeperPersonality
  expression?: ExpressionState
  /** Living Shopkeeper body state. Falls back to the face when omitted. */
  state?: AvatarState
  reaction?: BargainReaction | null
  /** Body language for the current state. */
  gesture?: GestureName
  /** Visual rendering style of the character. */
  characterStyle?: CharacterStyle
  size?: 'sm' | 'md' | 'lg' | 'xl'
  motionEnabled?: boolean
  /** Disable decorative (nonessential) motion: idle loops, blink, confetti. */
  essentialMotionOnly?: boolean
  /** Normalised gaze target in [-1, 1]; eyes follow the shopper's cursor. */
  gaze?: { x: number; y: number } | null
  className?: string
}

const SIZE_MAP = { sm: 38, md: 48, lg: 64, xl: 96 }

/**
 * Expressions whose animation is an endless idle loop rather than a
 * state change. In "essential motion only" mode these are switched off so a
 * merchant can ship the calmest possible storefront without losing the
 * reactions that carry meaning.
 */
const LOOPING_EXPRESSIONS: ReadonlySet<ExpressionState> = new Set<ExpressionState>([
  'idle', 'listening', 'thinking', 'curious', 'negotiating', 'happy', 'amused',
  'focused', 'concerned', 'uncertain', 'determined', 'encouraging',
])

const AVATAR_CSS = `
.cg-avatar { transform-origin: 50% 78%; will-change: transform; }
.cg-avatar--idle, .cg-avatar--listening { animation: cgAvBreathe 3.6s ease-in-out infinite; }
.cg-avatar--thinking, .cg-avatar--curious { animation: cgAvSway 2.5s ease-in-out infinite; }
.cg-avatar--negotiating, .cg-avatar--happy { animation: cgAvBob 1.05s ease-in-out infinite; }
.cg-avatar--surprised { animation: cgAvPop .42s cubic-bezier(.2,.9,.3,1.4); }
.cg-avatar--amused { animation: cgAvBounce .8s ease-in-out infinite; }
.cg-avatar--celebrating { animation: cgAvCelebrate .9s ease-in-out 1; }
.cg-avatar--disappointed, .cg-avatar--declining, .cg-avatar--error { animation: cgAvShake .52s ease-in-out; }
.cg-avatar--focused { animation: cgAvFocus 1.8s ease-in-out infinite; }
.cg-avatar--concerned { animation: cgAvConcern 2.6s ease-in-out infinite; }
.cg-avatar--uncertain { animation: cgAvSway 2.8s ease-in-out infinite; }
.cg-avatar--determined { animation: cgAvLean 1.6s ease-in-out infinite; }
.cg-avatar--encouraging { animation: cgAvBob 1.2s ease-in-out infinite; }
.cg-avatar--impressed { animation: cgAvPop .5s cubic-bezier(.2,.9,.3,1.3) 1; }
.cg-avatar--relieved { animation: cgAvSettle .8s ease-out 1; }
.cg-avatar--warning { animation: cgAvShake .52s ease-in-out; }
.cg-avatar[data-reaction-motion="listen"] { animation: cgAvSettle .5s ease-out 1; }
.cg-avatar[data-reaction-motion="settle"] { animation: cgAvSettle .5s ease-out 1; }
.cg-avatar[data-reaction-motion="pop"] { animation: cgAvPop .46s cubic-bezier(.2,.9,.3,1.4) 1; }
.cg-avatar[data-reaction-motion="shake"] { animation: cgAvShake .5s ease-in-out 1; }
.cg-avatar[data-reaction-motion="nod"] { animation: cgAvNod .56s ease-in-out 1; }
.cg-avatar[data-reaction-motion="bounce"] { animation: cgAvBounce .7s ease-in-out 1; }
.cg-avatar[data-reaction-motion="wave"] { animation: cgAvGreet .7s ease-in-out 1; }
.cg-avatar[data-reaction-motion="tilt"] { animation: cgAvSway .62s ease-in-out 1; }
.cg-avatar[data-reaction-motion="lean"] { animation: cgAvLean .62s ease-out 1; }
.cg-avatar[data-reaction-motion="present"] { animation: cgAvPointIn .5s ease-out 1; }
.cg-avatar[data-reaction-motion="recede"] { animation: cgAvShrug .62s ease-out 1; }
.cg-avatar[data-reaction-motion="celebrate"] { animation: cgAvCelebrate .9s ease-in-out 1; }
.cg-av-blink { animation: cgAvBlink 4.6s infinite; transform-box: fill-box; transform-origin: center; }
.cg-av-gaze { transition: transform 160ms ease-out; will-change: transform; }
.cg-av-think-dot { animation: cgAvThink 1.2s ease-in-out infinite; }
.cg-av-confetti { animation: cgAvConfetti 1.4s ease-out 1 forwards; transform-box: fill-box; transform-origin: center; }
.cg-av-glow { animation: cgAvGlow 1.2s ease-in-out infinite; }
.cg-av-figure { display: block; transform-origin: 50% 80%; transform-box: fill-box; }
.cg-avatar--state-entering .cg-av-figure { animation: cgAvEnter .58s cubic-bezier(.2,.9,.3,1.1); }
.cg-avatar--state-greeting .cg-av-figure { animation: cgAvGreet 1.8s ease-in-out infinite; }
.cg-avatar--state-typing .cg-av-figure { animation: cgAvBob 1.2s ease-in-out infinite; }
.cg-avatar--state-walking .cg-av-figure { animation: cgAvStepBody .5s ease-in-out infinite; }
.cg-avatar--state-guiding_to_checkout .cg-av-figure { animation: cgAvGuideBody 1.6s ease-in-out infinite; }
.cg-avatar--state-goodbye .cg-av-figure { animation: cgAvBye .7s ease-in-out; }
.cg-gesture--wave .cg-gesture-wave { animation: cgAvWave 1.1s ease-in-out infinite; transform-box: fill-box; transform-origin: 15% 85%; }
.cg-gesture--crossed_arms .cg-gesture-cross { animation: cgAvCrossIn .45s ease-out; transform-box: fill-box; transform-origin: 50% 50%; }
.cg-gesture--point .cg-gesture-point { animation: cgAvPointIn .45s cubic-bezier(.2,.9,.3,1.3); transform-box: fill-box; transform-origin: 100% 50%; }
.cg-gesture--chin .cg-gesture-chin { animation: cgAvChin .95s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
.cg-gesture--thumbs_up .cg-gesture-thumbs { animation: cgAvThumbs .7s cubic-bezier(.2,.9,.3,1.4); transform-box: fill-box; transform-origin: 50% 100%; }
.cg-gesture--dance .cg-gesture-dance { animation: cgAvDance .55s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
.cg-gesture--open_palms .cg-gesture-open { animation: cgAvOpen 1.1s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
.cg-gesture--guide .cg-gesture-guide { animation: cgAvGuide .95s ease-in-out infinite; transform-box: fill-box; transform-origin: 0% 50%; }
.cg-gesture--shrug .cg-gesture-shrug { animation: cgAvShrug .85s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
.cg-gesture--walk .cg-gesture-walk { animation: cgAvStep .5s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
.cg-gesture--nod .cg-av-figure { animation: cgAvNod .6s ease-in-out; transform-box: fill-box; transform-origin: 50% 20%; }
.cg-gesture--lean_in .cg-av-figure { animation: cgAvLean 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 80%; }
@keyframes cgAvBreathe { 0%,100% { transform: scale(1) translateY(0); } 50% { transform: scale(1.025) translateY(-1px); } }
@keyframes cgAvSway { 0%,100% { transform: rotate(0deg) translateY(0); } 50% { transform: rotate(2.2deg) translateY(-1px); } }
@keyframes cgAvBob { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-2px) rotate(-1deg); } }
@keyframes cgAvBounce { 0%,100% { transform: translateY(0) scale(1); } 40% { transform: translateY(-2px) scale(1.04); } 70% { transform: translateY(0) scale(.99); } }
@keyframes cgAvCelebrate { 0%,100% { transform: translateY(0) scale(1); } 35% { transform: translateY(-4px) scale(1.07) rotate(-2deg); } 65% { transform: translateY(-1px) scale(1.03) rotate(2deg); } }
@keyframes cgAvPop { 0% { transform: scale(.9); } 55% { transform: scale(1.09); } 100% { transform: scale(1); } }
@keyframes cgAvShake { 0%,100% { transform: translateX(0) rotate(0deg); } 25% { transform: translateX(-1.5px) rotate(-1.5deg); } 50% { transform: translateX(1.5px) rotate(1.5deg); } 75% { transform: translateX(-1px) rotate(-1deg); } }
@keyframes cgAvFocus { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-1px) scale(1.01); } }
@keyframes cgAvConcern { 0%,100% { transform: rotate(-.8deg) translateY(0); } 50% { transform: rotate(.8deg) translateY(-1px); } }
@keyframes cgAvSettle { 0% { transform: translateY(2px) scale(.98); } 100% { transform: translateY(0) scale(1); } }
@keyframes cgAvBlink { 0%, 91%, 97%, 100% { transform: scaleY(1); } 94% { transform: scaleY(.08); } }
@keyframes cgAvThink { 0%,100% { opacity: .25; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-1px); } }
@keyframes cgAvConfetti { 0% { opacity: 1; transform: translate(0,0) scale(1); } 100% { opacity: 0; transform: translate(var(--cg-x), var(--cg-y)) scale(.35); } }
@keyframes cgAvGlow { 0%,100% { opacity: .35; } 50% { opacity: .9; } }
@keyframes cgAvEnter { 0% { transform: translateX(26px) scale(.9); opacity: .2; } 60% { transform: translateX(-4px) scale(1.04); opacity: 1; } 100% { transform: translateX(0) scale(1); opacity: 1; } }
@keyframes cgAvGreet { 0%,100% { transform: rotate(-1.5deg) translateY(0); } 50% { transform: rotate(1.5deg) translateY(-1px); } }
@keyframes cgAvWave { 0%,100% { transform: rotate(-12deg); } 50% { transform: rotate(14deg); } }
@keyframes cgAvCrossIn { 0% { transform: translateY(8px); opacity: .2; } 100% { transform: translateY(0); opacity: 1; } }
@keyframes cgAvPointIn { 0% { transform: translateX(-8px); opacity: .2; } 100% { transform: translateX(0); opacity: 1; } }
@keyframes cgAvChin { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-1.5px) rotate(-3deg); } }
@keyframes cgAvThumbs { 0% { transform: translateY(6px) scale(.8); opacity: .2; } 70% { transform: translateY(-2px) scale(1.08); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
@keyframes cgAvDance { 0%,100% { transform: rotate(-3deg) translateY(0); } 50% { transform: rotate(3deg) translateY(-2px); } }
@keyframes cgAvOpen { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
@keyframes cgAvGuide { 0%,100% { transform: translate(0,0); } 50% { transform: translate(3px,2px); } }
@keyframes cgAvShrug { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
@keyframes cgAvStep { 0%,100% { transform: translateX(0); opacity: .5; } 50% { transform: translateX(3px); opacity: 1; } }
@keyframes cgAvNod { 0%,100% { transform: rotate(0deg); } 40% { transform: rotate(4deg); } 70% { transform: rotate(-2deg); } }
@keyframes cgAvLean { 0%,100% { transform: scale(1) translateY(0); } 50% { transform: scale(1.06) translateY(-1px); } }
@keyframes cgAvStepBody { 0%,100% { transform: translateX(0) rotate(0deg); } 50% { transform: translateX(2px) rotate(1.5deg); } }
@keyframes cgAvGuideBody { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-1.5px) rotate(-1.5deg); } }
@keyframes cgAvBye { 0% { transform: translateY(0) scale(1); opacity: 1; } 100% { transform: translateY(4px) scale(.94); opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .cg-avatar, .cg-avatar * { animation: none !important; } }
`

function moodIndex(expression: ExpressionState): number {
  return [
    'idle', 'listening', 'thinking', 'curious', 'surprised', 'amused', 'skeptical',
    'negotiating', 'disappointed', 'happy', 'celebrating', 'declining', 'error',
    'focused', 'concerned', 'uncertain', 'determined', 'encouraging', 'impressed',
    'relieved', 'warning',
  ].indexOf(expression)
}

export function ShopkeeperAvatar({
  personality,
  expression: baseExpression,
  state: baseState,
  reaction = null,
  gesture = 'rest',
  characterStyle = 'signature',
  size = 'md',
  motionEnabled = true,
  essentialMotionOnly = false,
  gaze = null,
  className = '',
}: Props) {
  const expression = reaction && (!baseExpression || baseExpression === 'idle')
    ? REACTION_EXPRESSION[reaction]
    : baseExpression ?? 'idle'
  const state = reaction && (!baseState || baseState === 'idle')
    ? REACTION_STATE[reaction]
    : baseState
  const [reducedMotion, setReducedMotion] = useState(false)
  const px = SIZE_MAP[size]
  const profile = characterProfile(personality)
  const palette = profile.palette
  const character = {
    skin: profile.palette.skin,
    skinShade: profile.palette.skinShade,
    hair: profile.palette.hair,
    outfit: profile.palette.outfit,
    apron: profile.palette.apron,
    detail: profile.palette.detail,
    glasses: profile.accessory === 'glasses',
  }
  const animate = motionEnabled && !reducedMotion
  const reactionMotion = reaction && animate ? REACTION_MOTION[reaction] : null
  // Decorative motion (idle loops, blinking, confetti) is the first thing to
  // go when a merchant asks for essential-only motion.
  const decorative = animate && !essentialMotionOnly
  const showGestures = animate && supportsGestureLayer(characterStyle)
  const happyEyes = ['happy', 'celebrating', 'impressed', 'relieved'].includes(expression)
  const wink = expression === 'amused'
  const wideEyes = expression === 'surprised' || expression === 'encouraging'
  const narrowEyes = ['skeptical', 'declining', 'focused', 'determined', 'warning'].includes(expression)
  const sad = expression === 'disappointed' || expression === 'error' || expression === 'concerned'
  const thinking = expression === 'thinking' || expression === 'curious' || expression === 'uncertain' || expression === 'focused'
  const lookUp = thinking || expression === 'encouraging'
  const lookDown = sad
  // Subtle live gaze: the pupils drift toward the shopper's cursor/composer.
  const gazeStyle = gaze
    ? { transform: `translate(${(Math.max(-1, Math.min(1, gaze.x)) * 0.9).toFixed(2)}px, ${(Math.max(-1, Math.min(1, gaze.y)) * 0.7).toFixed(2)}px)` }
    : undefined
  const mouth =
    expression === 'surprised'
      ? { path: '', ellipse: { cy: 43, rx: 3.4, ry: 4.2 } }
      : expression === 'happy' || expression === 'celebrating' || expression === 'impressed'
        ? { path: 'M25 39 Q32 49 39 39', fill: '#7f1d1d' }
        : expression === 'relieved'
          ? { path: 'M28 41 Q32 44.5 36 41' }
          : expression === 'encouraging'
            ? { path: 'M26 39 Q32 47 38 39' }
            : expression === 'amused'
              ? { path: 'M26 40 Q33 46 39 39' }
              : expression === 'disappointed' || expression === 'error' || expression === 'concerned'
                ? { path: 'M27 44 Q32 38 37 44' }
                : expression === 'declining' || expression === 'skeptical' || expression === 'determined'
                  ? { path: 'M28 41 L36 41' }
                  : expression === 'warning'
                    ? { path: 'M28 42 L36 40' }
                    : expression === 'thinking'
                      ? { path: 'M28 41 Q32 42.2 36 40.5' }
                      : expression === 'focused'
                        ? { path: 'M29 41 Q32 40.3 35 41' }
                        : expression === 'uncertain'
                          ? { path: 'M28 41 Q30 39.5 32 41 Q34 42.5 36 40.5' }
                          : expression === 'curious'
                            ? { path: '', ellipse: { cy: 42, rx: 2.1, ry: 2.7 } }
                            : expression === 'negotiating'
                              ? { path: 'M27 40 Q32 46 37 40', fill: '#7f1d1d' }
                              : { path: 'M27 40 Q32 44 37 40' }

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const expressionClass = animate && (!LOOPING_EXPRESSIONS.has(expression) || !essentialMotionOnly)
    ? `cg-avatar--${expression}`
    : ''
  const rootClass = [
    'cg-avatar',
    expressionClass,
    state ? `cg-avatar--state-${state}` : '',
    showGestures && gesture !== 'rest' ? `cg-gesture--${gesture}` : '',
    className,
  ].filter(Boolean).join(' ')

  const gestureLayer = (() => {
    if (!showGestures || gesture === 'rest') return null
    const skin = character.skin
    const shade = character.skinShade
    const outfit = character.outfit
    switch (gesture) {
      case 'wave':
        return (
          <g className="cg-gesture-wave">
            <path d="M43 32 q4-7 8-10" stroke={outfit} strokeWidth="4.5" fill="none" strokeLinecap="round" />
            <rect x="49" y="17" width="9" height="12" rx="4.5" fill={skin} />
            <path d="M51.5 18v-3.2M54.5 17.6v-4M57.5 18.4v-3" stroke={shade} strokeWidth="1.3" strokeLinecap="round" fill="none" />
          </g>
        )
      case 'crossed_arms':
        return (
          <g className="cg-gesture-cross">
            <rect x="14" y="50" width="36" height="7" rx="3.5" fill={outfit} />
            <rect x="16" y="45" width="33" height="7" rx="3.5" fill={character.apron} transform="rotate(-9 32 48)" />
            <circle cx="14" cy="53" r="3.6" fill={skin} />
            <circle cx="50" cy="49" r="3.6" fill={skin} />
          </g>
        )
      case 'point':
        return (
          <g className="cg-gesture-point">
            <path d="M43 53 q8-2 12-8" stroke={outfit} strokeWidth="5" fill="none" strokeLinecap="round" />
            <path d="M54 46 l7-3.4" stroke={skin} strokeWidth="3" strokeLinecap="round" fill="none" />
            <circle cx="46" cy="51" r="3.8" fill={skin} />
          </g>
        )
      case 'chin':
        return (
          <g className="cg-gesture-chin">
            <path d="M34 42 q7 0 9 5" stroke={outfit} strokeWidth="5" fill="none" strokeLinecap="round" />
            <circle cx="40" cy="47" r="4.4" fill={skin} />
          </g>
        )
      case 'thumbs_up':
        return (
          <g className="cg-gesture-thumbs">
            <path d="M14 57 q-2-7 4-9" stroke={outfit} strokeWidth="4" fill="none" strokeLinecap="round" />
            <circle cx="17" cy="52" r="5" fill={skin} />
            <rect x="15" y="43" width="4" height="8" rx="2" fill={skin} transform="rotate(-16 17 47)" />
          </g>
        )
      case 'dance':
        return (
          <g className="cg-gesture-dance">
            <path d="M6 40 l4-3M58 40 l-4-3" stroke={palette.accent} strokeWidth="1.8" strokeLinecap="round" opacity=".7" fill="none" />
            <circle cx="11" cy="53" r="3.2" fill={skin} />
            <circle cx="53" cy="53" r="3.2" fill={skin} />
          </g>
        )
      case 'lean_in':
        return null
      case 'open_palms':
        return (
          <g className="cg-gesture-open">
            <circle cx="19" cy="54" r="4" fill={skin} />
            <circle cx="45" cy="54" r="4" fill={skin} />
            <path d="M19 54 q0-4 3-5.4M45 54 q0-4-3-5.4" stroke={shade} strokeWidth="1.3" fill="none" strokeLinecap="round" />
          </g>
        )
      case 'guide':
        return (
          <g className="cg-gesture-guide">
            <path d="M41 48 q9 4 13 10" stroke={outfit} strokeWidth="5" fill="none" strokeLinecap="round" />
            <path d="M53 57 l6 3" stroke={skin} strokeWidth="3" strokeLinecap="round" fill="none" />
          </g>
        )
      case 'shrug':
        return (
          <g className="cg-gesture-shrug">
            <path d="M12 57 q4-9 11-6M52 57 q-4-9-11-6" stroke={outfit} strokeWidth="4" fill="none" strokeLinecap="round" />
          </g>
        )
      case 'walk':
        return (
          <g className="cg-gesture-walk">
            <path d="M9 57h7M48 57h7" stroke={palette.accent} strokeWidth="2" strokeLinecap="round" opacity=".6" fill="none" />
          </g>
        )
      case 'nod':
        return null
      default:
        return null
    }
  })()

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: AVATAR_CSS }} />
      <div
        className={rootClass}
        data-personality={personality}
        data-expression={expression}
        data-mood={moodIndex(expression)}
        data-avatar-state={state ?? ''}
        data-avatar-reaction={reaction ?? ''}
        data-reaction-motion={reactionMotion ?? ''}
        data-gesture={gesture}
        data-character-style={characterStyle}
        role="img"
        aria-label={`Shopkeeper avatar - ${personality.replace(/_/g, ' ')}, ${expression}`}
        style={{
          width: px,
          height: px,
          borderRadius: '50%',
          background: `radial-gradient(circle at 32% 26%, #ffffff 0%, ${palette.bg} 72%, ${palette.accent}22 100%)`,
          border: `2px solid ${palette.accent}45`,
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
          boxShadow:
            expression === 'celebrating' && animate
              ? `0 0 0 4px ${palette.accent}22, 0 7px 18px ${palette.accent}35`
              : expression === 'error'
                ? '0 0 0 3px rgba(248,113,113,.18)'
                : `0 4px 12px ${palette.accent}22`,
          transition: 'box-shadow 180ms ease, border-color 180ms ease',
        }}
      >
        <span className="cg-av-figure">
        <svg width={px} height={px} viewBox="0 0 64 64" aria-hidden="true">
          <path d="M8 64c0-12 10-19 24-19s24 7 24 19" fill={character.outfit} />
          <path d="M23 49h18l-3 15H26z" fill={character.apron} opacity="0.95" />
          <path d="M27 44h10v8c0 3-2 5-5 5s-5-2-5-5z" fill={character.skinShade} />
          <circle cx="16" cy="33" r="4" fill={character.skin} />
          <circle cx="48" cy="33" r="4" fill={character.skin} />
          <ellipse cx="32" cy="31" rx="17" ry="19" fill={character.skin} />
          <ellipse cx="32" cy="30" rx="14.5" ry="15.5" fill={character.skin} opacity="0.35" />

          {profile.hair === 'swept_fringe' && (
            <>
              <path d="M15 29c0-11 7.5-18 17-18s17 7 17 18c-3.5-4.5-8.5-7-17-7s-13.5 2.5-17 7z" fill={character.hair} />
              <path d="M17 26c5-4.5 10-6.5 15-6.5S42 21.5 47 26" fill="none" stroke={character.hair} strokeWidth="3" strokeLinecap="round" />
            </>
          )}
          {profile.hair === 'side_part' && (
            <>
              <path d="M15 28c0-10 7.5-17 17-17 8 0 14 4.5 16 11-6-3-11-4.5-17-4.5-5 0-10 2-16 6.5z" fill={character.hair} />
              <path d="M17 27c7-3.5 13-4.5 19-4.5 4.5 0 8 1 12 3" fill="none" stroke={character.hair} strokeWidth="2.5" strokeLinecap="round" />
            </>
          )}
          {profile.hair === 'spiky_curls' && (
            <>
              <path d="M15 28c0-10.5 7.5-17 17-17s17 6.5 17 17c-3-4-8-6-17-6s-14 2-17 6z" fill={character.hair} />
              <circle cx="18" cy="23" r="3.7" fill={character.hair} />
              <circle cx="25" cy="17" r="3.7" fill={character.hair} />
              <circle cx="34" cy="15" r="3.7" fill={character.hair} />
              <circle cx="43" cy="18" r="3.7" fill={character.hair} />
              <circle cx="47" cy="24" r="3.5" fill={character.hair} />
              <path d="M14 27c5-6 12-9 19-9 7 0 13 3 18 9" fill="none" stroke={character.detail} strokeWidth="3.2" strokeLinecap="round" />
            </>
          )}

          {character.glasses && (
            <g fill="none" stroke={character.detail} strokeWidth="1.4" opacity="0.9">
              <rect x="19.5" y="28.5" width="10" height="8" rx="3" />
              <rect x="34.5" y="28.5" width="10" height="8" rx="3" />
              <path d="M29.5 32h5" />
            </g>
          )}

          <g className={decorative && !happyEyes && !wink && !wideEyes ? 'cg-av-blink' : undefined}>
            {happyEyes ? (
              <g fill="none" stroke="#1f2937" strokeWidth="2.1" strokeLinecap="round">
                <path d="M21.5 32.5q3.5-4 7 0" />
                <path d="M35.5 32.5q3.5-4 7 0" />
              </g>
            ) : wink ? (
              <>
                <path d="M21.5 32.5q3.5-3.5 7 0" fill="none" stroke="#1f2937" strokeWidth="2.1" strokeLinecap="round" />
                <ellipse cx="39" cy="33" rx="3.1" ry={narrowEyes ? 1.2 : 3.4} fill="#fff" />
                <g className="cg-av-gaze" style={gazeStyle}>
                  <circle cx={lookUp ? 39.6 : 39} cy={lookUp ? 31.7 : lookDown ? 34.4 : 33} r="1.5" fill="#1f2937" />
                </g>
              </>
            ) : (
              <>
                <ellipse cx="25" cy={wideEyes ? 32.5 : 33} rx={wideEyes ? 4 : 3.1} ry={wideEyes ? 4.2 : narrowEyes ? 1.2 : 3.5} fill="#fff" />
                <ellipse cx="39" cy={wideEyes ? 32.5 : 33} rx={wideEyes ? 4 : 3.1} ry={wideEyes ? 4.2 : narrowEyes ? 1.2 : 3.5} fill="#fff" />
                <g className="cg-av-gaze" style={gazeStyle}>
                  <circle cx={lookUp ? 25.8 : 25} cy={lookUp ? 31.3 : lookDown ? 34.6 : 33.3} r={wideEyes ? 1.9 : 1.5} fill="#1f2937" />
                  <circle cx={lookUp ? 39.8 : 39} cy={lookUp ? 31.3 : lookDown ? 34.6 : 33.3} r={wideEyes ? 1.9 : 1.5} fill="#1f2937" />
                </g>
              </>
            )}
          </g>

          <g fill="none" stroke="#3f2a22" strokeWidth="1.7" strokeLinecap="round">
            {expression === 'surprised' || expression === 'curious' ? (
              <>
                <path d="M21 25.5q3.5-3 7 0" />
                <path d="M36 25.5q3.5-3 7 0" />
              </>
            ) : expression === 'skeptical' ? (
              <>
                <path d="M21 26.5q3.5-5 7-1" />
                <path d="M36 26q3.5-1 7 0" />
              </>
            ) : sad ? (
              <>
                <path d="M21 27q3.5 2.5 7 0" />
                <path d="M36 27q3.5 2.5 7 0" />
              </>
            ) : expression === 'negotiating' || expression === 'declining' || expression === 'determined' || expression === 'warning' ? (
              <>
                <path d="M21 26.5q3.5-1 7 1.5" />
                <path d="M36 28q3.5-2.5 7-1.5" />
              </>
            ) : expression === 'thinking' || expression === 'focused' ? (
              <>
                <path d="M21 26q3.5-2.5 7 0" />
                <path d="M36 24.5q3.5-4 7-1.5" />
              </>
            ) : expression === 'uncertain' ? (
              <>
                <path d="M21 26q3.5-4 7-1" />
                <path d="M36 25.5q3.5-1.5 7 0" />
              </>
            ) : expression === 'impressed' || expression === 'relieved' || expression === 'encouraging' ? (
              <>
                <path d="M21 25.5q3.5-3.5 7-.5" />
                <path d="M36 25q3.5-3 7 .5" />
              </>
            ) : (
              <>
                <path d="M21 26.5q3.5-2.5 7 0" />
                <path d="M36 26.5q3.5-2.5 7 0" />
              </>
            )}
          </g>

          <path d="M32 33.5q-1.5 3.5 1 4" fill="none" stroke={character.skinShade} strokeWidth="1.5" strokeLinecap="round" />

          <ellipse cx="21" cy="39" rx="3.5" ry="2" fill="#ef4444" opacity={['happy', 'celebrating', 'amused', 'impressed', 'relieved', 'encouraging'].includes(expression) ? 0.22 : 0} />
          <ellipse cx="43" cy="39" rx="3.5" ry="2" fill="#ef4444" opacity={['happy', 'celebrating', 'amused', 'impressed', 'relieved', 'encouraging'].includes(expression) ? 0.22 : 0} />

          {'ellipse' in mouth && mouth.ellipse ? (
            <ellipse cx="32" {...mouth.ellipse} fill="#5b1a1a" />
          ) : (
            <>
              <path d={mouth.path} fill={mouth.fill ?? 'none'} stroke={mouth.fill ? 'none' : '#7c2d12'} strokeWidth="2" strokeLinecap="round" />
              {mouth.fill && <path d="M27 40.5q5 3 10 0" fill="#fff" opacity="0.75" />}
            </>
          )}

          {thinking && (
            <g fill={palette.accent}>
              {[0, 1, 2].map((i) => (
                <circle
                  key={i}
                  cx={48 + (i % 2) * 3}
                  cy={12 + i * 4}
                  r={1.1 + i * 0.25}
                  className={animate ? 'cg-av-think-dot' : undefined}
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </g>
          )}

          {expression === 'curious' && (
            <text x="49" y="18" fontSize="12" fontWeight="800" fill={palette.accent}>?</text>
          )}

          {expression === 'surprised' && (
            <text x="49" y="18" fontSize="13" fontWeight="900" fill="#ef4444">!</text>
          )}

          {expression === 'uncertain' && (
            <text x="49" y="18" fontSize="11" fontWeight="800" fill={palette.accent}>?</text>
          )}

          {expression === 'warning' && (
            <text x="49" y="18" fontSize="13" fontWeight="900" fill="#f59e0b">!</text>
          )}

          {expression === 'impressed' && (
            <text x="50" y="18" fontSize="12" fontWeight="900" fill={palette.accent}>✦</text>
          )}

          {(expression === 'disappointed' || expression === 'error' || expression === 'concerned') && (
            <path d="M49 21c2.6 0 4 2 4 4.2 0 2-1.7 3.8-4 5.8-2.3-2-4-3.8-4-5.8 0-2.2 1.4-4.2 4-4.2z" fill="#60a5fa" opacity="0.9" />
          )}

          {expression === 'celebrating' && decorative && (
            <g>
              <circle cx="14" cy="15" r="1.6" fill="#f59e0b" className="cg-av-confetti" style={{ '--cg-x': '-6px', '--cg-y': '-7px' } as React.CSSProperties} />
              <circle cx="50" cy="14" r="1.4" fill="#ec4899" className="cg-av-confetti" style={{ '--cg-x': '6px', '--cg-y': '-8px', animationDelay: '.25s' } as React.CSSProperties} />
              <circle cx="12" cy="31" r="1.2" fill="#22c55e" className="cg-av-confetti" style={{ '--cg-x': '-7px', '--cg-y': '3px', animationDelay: '.5s' } as React.CSSProperties} />
              <circle cx="52" cy="30" r="1.7" fill="#3b82f6" className="cg-av-confetti" style={{ '--cg-x': '7px', '--cg-y': '2px', animationDelay: '.7s' } as React.CSSProperties} />
            </g>
          )}

          {expression === 'negotiating' && animate && (
            <g stroke={palette.accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.65" className="cg-av-glow">
              <path d="M53 38l3-1.5" />
              <path d="M53 43l3 .8" />
            </g>
          )}

          {gestureLayer}
        </svg>
        </span>
      </div>
    </>
  )
}

export type { ExpressionState, AvatarState, GestureName, CharacterStyle }
export default ShopkeeperAvatar
