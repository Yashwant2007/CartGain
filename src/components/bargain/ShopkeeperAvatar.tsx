'use client'

import { useEffect, useState } from 'react'
import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import type { ExpressionState } from '@/lib/bargain/experience/expressions'

interface Props {
  personality: ShopkeeperPersonality
  expression?: ExpressionState
  size?: 'sm' | 'md' | 'lg' | 'xl'
  motionEnabled?: boolean
  className?: string
}

const SIZE_MAP = { sm: 38, md: 48, lg: 64, xl: 96 }

const COLORS: Record<ShopkeeperPersonality, { bg: string; accent: string }> = {
  friendly_shopkeeper: { bg: '#eef2ff', accent: '#4f46e5' },
  strict_shopkeeper: { bg: '#f1f5f9', accent: '#475569' },
  playful_shopkeeper: { bg: '#fef3c7', accent: '#d97706' },
}

const CHARACTERS: Record<
  ShopkeeperPersonality,
  {
    skin: string
    skinShade: string
    hair: string
    outfit: string
    detail: string
    glasses: boolean
  }
> = {
  friendly_shopkeeper: {
    skin: '#f2c6a8',
    skinShade: '#d99b72',
    hair: '#3b2a22',
    outfit: '#4f46e5',
    detail: '#16a34a',
    glasses: false,
  },
  strict_shopkeeper: {
    skin: '#e8c7a8',
    skinShade: '#c99b73',
    hair: '#243247',
    outfit: '#334155',
    detail: '#0f172a',
    glasses: true,
  },
  playful_shopkeeper: {
    skin: '#bd7f59',
    skinShade: '#965d3d',
    hair: '#2b1a14',
    outfit: '#ea580c',
    detail: '#fbbf24',
    glasses: false,
  },
}

const AVATAR_CSS = `
.cg-avatar { transform-origin: 50% 78%; will-change: transform; }
.cg-avatar--idle, .cg-avatar--listening { animation: cgAvBreathe 3.6s ease-in-out infinite; }
.cg-avatar--thinking, .cg-avatar--curious { animation: cgAvSway 2.5s ease-in-out infinite; }
.cg-avatar--negotiating, .cg-avatar--happy { animation: cgAvBob 1.05s ease-in-out infinite; }
.cg-avatar--surprised { animation: cgAvPop .42s cubic-bezier(.2,.9,.3,1.4); }
.cg-avatar--amused { animation: cgAvBounce .8s ease-in-out infinite; }
.cg-avatar--celebrating { animation: cgAvCelebrate .72s ease-in-out infinite; }
.cg-avatar--disappointed, .cg-avatar--declining, .cg-avatar--error { animation: cgAvShake .52s ease-in-out; }
.cg-av-blink { animation: cgAvBlink 4.6s infinite; transform-box: fill-box; transform-origin: center; }
.cg-av-think-dot { animation: cgAvThink 1.2s ease-in-out infinite; }
.cg-av-confetti { animation: cgAvConfetti 1.4s ease-out infinite; transform-box: fill-box; transform-origin: center; }
.cg-av-glow { animation: cgAvGlow 1.2s ease-in-out infinite; }
@keyframes cgAvBreathe { 0%,100% { transform: scale(1) translateY(0); } 50% { transform: scale(1.025) translateY(-1px); } }
@keyframes cgAvSway { 0%,100% { transform: rotate(0deg) translateY(0); } 50% { transform: rotate(2.2deg) translateY(-1px); } }
@keyframes cgAvBob { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-2px) rotate(-1deg); } }
@keyframes cgAvBounce { 0%,100% { transform: translateY(0) scale(1); } 40% { transform: translateY(-2px) scale(1.04); } 70% { transform: translateY(0) scale(.99); } }
@keyframes cgAvCelebrate { 0%,100% { transform: translateY(0) scale(1); } 35% { transform: translateY(-4px) scale(1.07) rotate(-2deg); } 65% { transform: translateY(-1px) scale(1.03) rotate(2deg); } }
@keyframes cgAvPop { 0% { transform: scale(.9); } 55% { transform: scale(1.09); } 100% { transform: scale(1); } }
@keyframes cgAvShake { 0%,100% { transform: translateX(0) rotate(0); } 25% { transform: translateX(-1.5px) rotate(-1.5deg); } 50% { transform: translateX(1.5px) rotate(1.5deg); } 75% { transform: translateX(-1px) rotate(-1deg); } }
@keyframes cgAvBlink { 0%, 91%, 97%, 100% { transform: scaleY(1); } 94% { transform: scaleY(.08); } }
@keyframes cgAvThink { 0%,100% { opacity: .25; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-1px); } }
@keyframes cgAvConfetti { 0% { opacity: 1; transform: translate(0,0) scale(1); } 100% { opacity: 0; transform: translate(var(--cg-x), var(--cg-y)) scale(.35); } }
@keyframes cgAvGlow { 0%,100% { opacity: .35; } 50% { opacity: .9; } }
@media (prefers-reduced-motion: reduce) { .cg-avatar, .cg-avatar * { animation: none !important; } }
`

function moodIndex(expression: ExpressionState): number {
  return [
    'idle', 'listening', 'thinking', 'curious', 'surprised', 'amused', 'skeptical',
    'negotiating', 'disappointed', 'happy', 'celebrating', 'declining', 'error',
  ].indexOf(expression)
}

export function ShopkeeperAvatar({
  personality,
  expression = 'idle',
  size = 'md',
  motionEnabled = true,
  className = '',
}: Props) {
  const [reducedMotion, setReducedMotion] = useState(false)
  const px = SIZE_MAP[size]
  const palette = COLORS[personality]
  const character = CHARACTERS[personality]
  const animate = motionEnabled && !reducedMotion
  const happyEyes = expression === 'happy' || expression === 'celebrating'
  const wink = expression === 'amused'
  const wideEyes = expression === 'surprised'
  const narrowEyes = expression === 'skeptical' || expression === 'declining'
  const sad = expression === 'disappointed' || expression === 'error'
  const thinking = expression === 'thinking' || expression === 'curious'
  const lookUp = thinking
  const lookDown = sad
  const mouth =
    expression === 'surprised'
      ? { path: '', ellipse: { cy: 43, rx: 3.4, ry: 4.2 } }
      : expression === 'happy' || expression === 'celebrating'
        ? { path: 'M25 39 Q32 49 39 39', fill: '#7f1d1d' }
        : expression === 'amused'
          ? { path: 'M26 40 Q33 46 39 39' }
          : expression === 'disappointed' || expression === 'error'
            ? { path: 'M27 44 Q32 38 37 44' }
            : expression === 'declining' || expression === 'skeptical'
              ? { path: 'M28 41 L36 41' }
              : expression === 'thinking'
                ? { path: 'M28 41 Q32 42.2 36 40.5' }
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

  const rootClass = [
    'cg-avatar',
    animate ? `cg-avatar--${expression}` : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: AVATAR_CSS }} />
      <div
        className={rootClass}
        data-personality={personality}
        data-expression={expression}
        data-mood={moodIndex(expression)}
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
        <svg width={px} height={px} viewBox="0 0 64 64" aria-hidden="true">
          <path d="M8 64c0-12 10-19 24-19s24 7 24 19" fill={character.outfit} />
          <path d="M23 49h18l-3 15H26z" fill={character.detail} opacity="0.9" />
          <path d="M27 44h10v8c0 3-2 5-5 5s-5-2-5-5z" fill={character.skinShade} />
          <circle cx="16" cy="33" r="4" fill={character.skin} />
          <circle cx="48" cy="33" r="4" fill={character.skin} />
          <ellipse cx="32" cy="31" rx="17" ry="19" fill={character.skin} />
          <ellipse cx="32" cy="30" rx="14.5" ry="15.5" fill={character.skin} opacity="0.35" />

          {personality === 'friendly_shopkeeper' && (
            <>
              <path d="M15 29c0-11 7.5-18 17-18s17 7 17 18c-3.5-4.5-8.5-7-17-7s-13.5 2.5-17 7z" fill={character.hair} />
              <path d="M17 26c5-4.5 10-6.5 15-6.5S42 21.5 47 26" fill="none" stroke={character.hair} strokeWidth="3" strokeLinecap="round" />
            </>
          )}
          {personality === 'strict_shopkeeper' && (
            <>
              <path d="M15 28c0-10 7.5-17 17-17 8 0 14 4.5 16 11-6-3-11-4.5-17-4.5-5 0-10 2-16 6.5z" fill={character.hair} />
              <path d="M17 27c7-3.5 13-4.5 19-4.5 4.5 0 8 1 12 3" fill="none" stroke={character.hair} strokeWidth="2.5" strokeLinecap="round" />
            </>
          )}
          {personality === 'playful_shopkeeper' && (
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

          <g className={animate && !happyEyes && !wink && !wideEyes ? 'cg-av-blink' : undefined}>
            {happyEyes ? (
              <g fill="none" stroke="#1f2937" strokeWidth="2.1" strokeLinecap="round">
                <path d="M21.5 32.5q3.5-4 7 0" />
                <path d="M35.5 32.5q3.5-4 7 0" />
              </g>
            ) : wink ? (
              <>
                <path d="M21.5 32.5q3.5-3.5 7 0" fill="none" stroke="#1f2937" strokeWidth="2.1" strokeLinecap="round" />
                <ellipse cx="39" cy="33" rx="3.1" ry={narrowEyes ? 1.2 : 3.4} fill="#fff" />
                <circle cx={lookUp ? 39.6 : 39} cy={lookUp ? 31.7 : lookDown ? 34.4 : 33} r="1.5" fill="#1f2937" />
              </>
            ) : (
              <>
                <ellipse cx="25" cy={wideEyes ? 32.5 : 33} rx={wideEyes ? 4 : 3.1} ry={wideEyes ? 4.2 : narrowEyes ? 1.2 : 3.5} fill="#fff" />
                <ellipse cx="39" cy={wideEyes ? 32.5 : 33} rx={wideEyes ? 4 : 3.1} ry={wideEyes ? 4.2 : narrowEyes ? 1.2 : 3.5} fill="#fff" />
                <circle cx={lookUp ? 25.8 : 25} cy={lookUp ? 31.3 : lookDown ? 34.6 : 33.3} r={wideEyes ? 1.9 : 1.5} fill="#1f2937" />
                <circle cx={lookUp ? 39.8 : 39} cy={lookUp ? 31.3 : lookDown ? 34.6 : 33.3} r={wideEyes ? 1.9 : 1.5} fill="#1f2937" />
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
            ) : expression === 'negotiating' || expression === 'declining' ? (
              <>
                <path d="M21 26.5q3.5-1 7 1.5" />
                <path d="M36 28q3.5-2.5 7-1.5" />
              </>
            ) : expression === 'thinking' ? (
              <>
                <path d="M21 26q3.5-2.5 7 0" />
                <path d="M36 24.5q3.5-4 7-1.5" />
              </>
            ) : (
              <>
                <path d="M21 26.5q3.5-2.5 7 0" />
                <path d="M36 26.5q3.5-2.5 7 0" />
              </>
            )}
          </g>

          <path d="M32 33.5q-1.5 3.5 1 4" fill="none" stroke={character.skinShade} strokeWidth="1.5" strokeLinecap="round" />

          <ellipse cx="21" cy="39" rx="3.5" ry="2" fill="#ef4444" opacity={expression === 'happy' || expression === 'celebrating' || expression === 'amused' ? 0.22 : 0} />
          <ellipse cx="43" cy="39" rx="3.5" ry="2" fill="#ef4444" opacity={expression === 'happy' || expression === 'celebrating' || expression === 'amused' ? 0.22 : 0} />

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

          {(expression === 'disappointed' || expression === 'error') && (
            <path d="M49 21c2.6 0 4 2 4 4.2 0 2-1.7 3.8-4 5.8-2.3-2-4-3.8-4-5.8 0-2.2 1.4-4.2 4-4.2z" fill="#60a5fa" opacity="0.9" />
          )}

          {expression === 'celebrating' && (
            <g>
              <circle cx="14" cy="15" r="1.6" fill="#f59e0b" className={animate ? 'cg-av-confetti' : undefined} style={{ '--cg-x': '-6px', '--cg-y': '-7px' } as React.CSSProperties} />
              <circle cx="50" cy="14" r="1.4" fill="#ec4899" className={animate ? 'cg-av-confetti' : undefined} style={{ '--cg-x': '6px', '--cg-y': '-8px', animationDelay: '.25s' } as React.CSSProperties} />
              <circle cx="12" cy="31" r="1.2" fill="#22c55e" className={animate ? 'cg-av-confetti' : undefined} style={{ '--cg-x': '-7px', '--cg-y': '3px', animationDelay: '.5s' } as React.CSSProperties} />
              <circle cx="52" cy="30" r="1.7" fill="#3b82f6" className={animate ? 'cg-av-confetti' : undefined} style={{ '--cg-x': '7px', '--cg-y': '2px', animationDelay: '.7s' } as React.CSSProperties} />
            </g>
          )}

          {expression === 'negotiating' && animate && (
            <g stroke={palette.accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.65" className="cg-av-glow">
              <path d="M53 38l3-1.5" />
              <path d="M53 43l3 .8" />
            </g>
          )}
        </svg>
      </div>
    </>
  )
}

export type { ExpressionState }
export default ShopkeeperAvatar
