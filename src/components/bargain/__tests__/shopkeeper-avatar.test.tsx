/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { ShopkeeperAvatar } from '@/components/bargain/ShopkeeperAvatar'
import ShopkeeperStage from '@/components/bargain/ShopkeeperStage'
import type { ExpressionState } from '@/lib/bargain/experience/expressions'

const EXPRESSIONS: ExpressionState[] = [
  'idle', 'listening', 'thinking', 'curious', 'surprised', 'amused', 'skeptical',
  'negotiating', 'disappointed', 'happy', 'celebrating', 'declining', 'error',
]

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

  it('keeps the reaction face but stops motion when motion is disabled', () => {
    const { container } = render(
      <ShopkeeperAvatar personality="strict_shopkeeper" expression="declining" motionEnabled={false} />,
    )
    expect(container.querySelector('[data-expression="declining"]')).toBeTruthy()
    expect(container.querySelector('.cg-avatar--declining')).toBeNull()
  })

  it('renders the hero stage with the shopkeeper, name and current line', () => {
    const { container, getByText } = render(
      <ShopkeeperStage
        personality="playful_shopkeeper"
        expression="thinking"
        name="Playful Shopkeeper"
        status="Shopkeeper online"
        line="Let me check what I can do…"
      />,
    )
    const avatar = container.querySelector('.cg-avatar') as HTMLElement | null
    expect(avatar?.style.width).toBe('96px')
    expect(avatar?.getAttribute('data-expression')).toBe('thinking')
    expect(getByText('Playful Shopkeeper')).toBeTruthy()
    expect(getByText('Let me check what I can do…')).toBeTruthy()
  })
})
