/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { shopifySessionFetch } from '@/lib/shopify-session-fetch'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'
import { DEFAULT_BARGAIN_EXPERIENCE } from '@/lib/bargain/experience/types'
import { V2_REACTIONS } from '@/lib/bargain/experience/reactions'
import { BargainExperienceStudio } from '../experience-studio'

jest.mock('@/lib/shopify-session-fetch', () => ({ shopifySessionFetch: jest.fn() }))
jest.mock('@/hooks/useResolvedStoreId', () => ({ useResolvedStoreId: jest.fn() }))

const mockedFetch = shopifySessionFetch as jest.Mock
const mockedStore = useResolvedStoreId as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockedStore.mockReturnValue({ storeId: 'store-1' })
  mockedFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      experience: { ...DEFAULT_BARGAIN_EXPERIENCE, avatarVariant: 'alex' },
      history: [],
    }),
  } as unknown as Response)
})

afterEach(() => cleanup())

it('shows all eight chat reactions for the selected avatar and previews the clicked pose', async () => {
  const { container } = render(<BargainExperienceStudio />)
  await waitFor(() => expect(screen.getByText(/Chat reactions · Alex/)).toBeTruthy())

  for (const reaction of V2_REACTIONS) {
    const button = container.querySelector(`[data-reaction-option="${reaction.id}"]`) as HTMLElement | null
    expect(button).toBeTruthy()
    expect(within(button as HTMLElement).getByText(reaction.label)).toBeTruthy()
  }

  fireEvent.click(container.querySelector('[data-reaction-option="rude"]') as HTMLElement)
  await waitFor(() => {
    expect(container.querySelector('.cg-stage')?.getAttribute('data-avatar-reaction')).toBe('rude')
    expect(container.querySelector('.cg-v2-art')?.getAttribute('style')).toContain('alex-reactions-a.png')
  })
})

it('previews invitation edits and blocks publishing until they are saved', async () => {
  const { container } = render(<BargainExperienceStudio />)
  await waitFor(() => expect(screen.getByPlaceholderText('Got a price in mind?')).toBeTruthy())

  fireEvent.change(screen.getByPlaceholderText('Got a price in mind?'), { target: { value: 'Name your price today' } })

  expect(screen.getByText('Name your price today')).toBeTruthy()
  expect(container.querySelector('.cg-premium-invite')).toBeTruthy()
  const publish = screen.getByRole('button', { name: /Publish/ }) as HTMLButtonElement
  expect(publish.hasAttribute('disabled')).toBe(true)
  expect(screen.getByText(/You have unsaved changes/)).toBeTruthy()
})
