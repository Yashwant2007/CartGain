/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { ShopkeeperAvatar } from '@/components/bargain/ShopkeeperAvatar'
import ShopkeeperStage from '@/components/bargain/ShopkeeperStage'
import { EXPRESSION_STATES, type ExpressionState } from '@/lib/bargain/experience/expressions'

const EXPRESSIONS: ExpressionState[] = [...EXPRESSION_STATES]

describe('ShopkeeperAvatar reactions', () => {
  it.each(EXPRESSIONS)('renders a distinct %s reaction', (expression) => {
    const { container } = render(
      <ShopkeeperAvatar personality="friendly_shopkeeper" expression={expression} />,
    )
    const avatar = container.querySelector(`[data-expression="${expression}"]`)
    expect(avatar).toBeTruthy()
    expect(avatar?.getAttribute('data-mood')).toBe(String(EXPRESSIONS.indexOf(expression)))
    expect(screen.getByRole('img', { name: new RegExp(expression) })).toBeTruthy()
  })

  it.each([
    'friendly_shopkeeper',
    'strict_shopkeeper',
    'playful_shopkeeper',
  ] as const)('renders the %s character', (personality) => {
    const { container } = render(
      <ShopkeeperAvatar personality={personality} expression="negotiating" />,
    )
    expect(container.querySelector(`[data-personality="${personality}"]`)).toBeTruthy()
  })

  it('uses the reaction animation while motion is enabled', () => {
    const { container } = render(
      <ShopkeeperAvatar personality="playful_shopkeeper" expression="celebrating" />,
    )
    expect(container.querySelector('.cg-avatar--celebrating')).toBeTruthy()
  })

  it('gives the expanded emotion set distinct animation classes', () => {
    const { container } = render(
      <ShopkeeperAvatar personality="strict_shopkeeper" expression="warning" />,
    )
    const css = container.querySelector('style')?.textContent ?? ''
    expect(container.querySelector('.cg-avatar--warning')).toBeTruthy()
    expect(css).toContain('.cg-avatar--focused { animation: cgAvFocus 1.8s ease-in-out infinite; }')
    expect(css).toContain('.cg-avatar--encouraging { animation: cgAvBob 1.2s ease-in-out infinite; }')
    expect(css).toContain('.cg-avatar--impressed { animation: cgAvPop .5s cubic-bezier(.2,.9,.3,1.3) 1; }')
    expect(css).toContain('.cg-avatar--relieved { animation: cgAvSettle .8s ease-out 1; }')
  })

  it('uses a chat reaction as the inline expression and body state', () => {
    const { container } = render(
      <ShopkeeperAvatar
        personality="friendly_shopkeeper"
        expression="idle"
        state="idle"
        reaction="deal"
      />,
    )
    const avatar = container.querySelector('.cg-avatar')
    expect(avatar?.getAttribute('data-expression')).toBe('celebrating')
    expect(avatar?.getAttribute('data-avatar-state')).toBe('celebrating')
    expect(avatar?.getAttribute('data-avatar-reaction')).toBe('deal')
    expect(avatar?.getAttribute('data-reaction-motion')).toBe('celebrate')
  })

  it('keeps the reaction face but stops motion when motion is disabled', () => {
    const { container } = render(
      <ShopkeeperAvatar personality="strict_shopkeeper" expression="declining" motionEnabled={false} />,
    )
    expect(container.querySelector('[data-expression="declining"]')).toBeTruthy()
    expect(container.querySelector('.cg-avatar--declining')).toBeNull()
  })

  it('keeps the hero stage and conversation line while the 3D asset is unavailable', () => {
    const { container, getByText } = render(
      <ShopkeeperStage
        personality="playful_shopkeeper"
        expression="thinking"
        name="Playful Shopkeeper"
        status="Shopkeeper online"
        line="Let me check what I can do…"
      />,
    )
    const stage = container.querySelector('.cg-stage') as HTMLElement | null
    expect(['disabled', 'unavailable']).toContain(stage?.getAttribute('data-avatar-renderer'))
    expect(container.querySelector('.cg-avatar')).toBeNull()
    expect(getByText('Playful Shopkeeper')).toBeTruthy()
    expect(getByText('Let me check what I can do…')).toBeTruthy()
  })

  it('settles celebratory and reaction animations instead of looping them forever', () => {
    const { container } = render(
      <ShopkeeperAvatar personality="friendly_shopkeeper" expression="celebrating" />,
    )
    const css = container.querySelector('style')?.textContent ?? ''
    expect(css).toContain('.cg-avatar--celebrating { animation: cgAvCelebrate .9s ease-in-out 1; }')
    expect(css).toContain('.cg-av-confetti { animation: cgAvConfetti 1.4s ease-out 1 forwards;')
    expect(css).not.toMatch(/\.cg-avatar--celebrating[^}]*infinite/)
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('only animates the stage halo for thinking and celebrating', () => {
    const { container } = render(
      <ShopkeeperStage
        personality="friendly_shopkeeper"
        expression="idle"
        name="Alex"
        status="Online"
        line="Hello"
      />,
    )
    const css = container.querySelectorAll('style')
    const stageCss = Array.from(css).map((node) => node.textContent ?? '').join('\n')
    expect(stageCss).toContain('opacity: 0;')
    expect(stageCss).toContain('[data-expression="thinking"] .cg-stage-halo')
    expect(stageCss).toContain('[data-expression="celebrating"] .cg-stage-halo')
    expect(stageCss).not.toContain('[data-expression="error"] .cg-stage-halo')
    expect(stageCss).not.toContain('cgStageHalo 2.8s')
    expect(stageCss).toContain('height: 204px;')
    expect(stageCss).toContain('height: 170px; min-height: 170px;')
  })
})
