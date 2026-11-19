/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import SalespersonAvatar from '@/components/bargain/SalespersonAvatar'
import {
  SALESPERSON_PERSONAS,
  AVATAR_EMOTIONS,
  AVATAR_GESTURES,
} from '@/types/negotiation'
import stateMap from '@/components/bargain/avatar-state-map.json'

describe('SalespersonAvatar scaffold', () => {
  it.each(SALESPERSON_PERSONAS)('renders the %s persona', (persona) => {
    const { container } = render(<SalespersonAvatar persona={persona} />)
    expect(container.querySelector(`[data-persona="${persona}"]`)).toBeTruthy()
  })

  it.each(AVATAR_EMOTIONS)('renders a %s emotion hook', (emotion) => {
    const { container } = render(<SalespersonAvatar persona="collaborative" emotion={emotion} />)
    expect(container.querySelector(`[data-emotion="${emotion}"]`)).toBeTruthy()
  })

  it.each(AVATAR_GESTURES)('renders the %s gesture', (gesture) => {
    const { container } = render(<SalespersonAvatar persona="playful" gesture={gesture} />)
    expect(container.querySelector(`[data-gesture="${gesture}"]`)).toBeTruthy()
  })

  it('exposes an accessible image label', () => {
    render(<SalespersonAvatar persona="strict" emotion="stern" />)
    expect(screen.getByRole('img', { name: /strict margin protector/i })).toBeTruthy()
  })

  it('maps every mocked AI event onto a valid persona/emotion/gesture', () => {
    for (const event of stateMap.events) {
      expect(SALESPERSON_PERSONAS).toContain(event.persona)
      expect(AVATAR_EMOTIONS).toContain(event.emotion)
      expect(AVATAR_GESTURES).toContain(event.gesture)
    }
  })
})
