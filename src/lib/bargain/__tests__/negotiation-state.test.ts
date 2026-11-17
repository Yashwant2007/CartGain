import {
  SESSION_STATUS,
  SESSION_STATUSES,
  SESSION_TRANSITIONS,
  PURCHASE_SOURCE_STATUSES,
  canTransition,
  checkSessionTransition,
  canRecoverLegacyAccept,
  isTerminal,
  isNegotiable,
  walkoutOutcome,
  isSessionStatus,
  type SessionStatus,
} from '../negotiation-state'
import { detectWalkout } from '../text'

describe('bargain session state machine', () => {
  it('exposes every persisted status', () => {
    expect(SESSION_STATUSES).toEqual([
      'active', 'accepting', 'accepted', 'rejected', 'expired', 'abandoned', 'purchased',
    ])
    expect(SESSION_STATUS.PURCHASED).toBe('purchased')
    expect(isSessionStatus('purchased')).toBe(true)
  })

  it('allows only legal forward transitions', () => {
    // active may move on any of the four sinks via the interim accepting state
    for (const to of ['accepted', 'rejected', 'expired', 'abandoned']) {
      expect(canTransition('active', to as SessionStatus)).toBe(true)
    }
    expect(canTransition('active', 'accepting')).toBe(true)
    expect(canTransition('accepting', 'accepted')).toBe(true)
  })

  it('makes illegal transitions impossible', () => {
    const illegal: Array<[SessionStatus, SessionStatus]> = [
      ['expired', 'accepted'],
      ['expired', 'active'],
      ['expired', 'accepting'],
      ['rejected', 'accepted'],
      ['rejected', 'active'],
      ['rejected', 'accepting'],
      ['abandoned', 'accepted'],
      ['abandoned', 'active'],
      ['abandoned', 'accepting'],
      ['accepted', 'rejected'],
      ['accepting', 'rejected'],
      ['accepting', 'expired'],
      ['accepting', 'abandoned'],
      ['accepting', 'purchased'],
      ['active', 'purchased'],
      ['purchased', 'active'],
      ['purchased', 'accepting'],
      ['purchased', 'accepted'],
      ['purchased', 'rejected'],
      ['purchased', 'expired'],
      ['purchased', 'abandoned'],
      ['purchased', 'purchased'],
    ]
    for (const [from, to] of illegal) {
      expect(canTransition(from, to)).toBe(false)
    }
  })

  it('marks terminal statuses', () => {
    for (const s of ['accepted', 'rejected', 'expired', 'abandoned', 'purchased']) {
      expect(isTerminal(s as SessionStatus)).toBe(true)
    }
    expect(isTerminal('active')).toBe(false)
    expect(isTerminal('accepting')).toBe(false)
  })

  it('only the active status is negotiable', () => {
    expect(isNegotiable('active')).toBe(true)
    for (const s of SESSION_STATUSES.filter((x) => x !== 'active')) {
      expect(isNegotiable(s as SessionStatus)).toBe(false)
    }
  })

  it('guards the transition table against typos', () => {
    // every key maps to valid statuses and every status is a key
    for (const status of SESSION_STATUSES) {
      expect(Object.prototype.hasOwnProperty.call(SESSION_TRANSITIONS, status)).toBe(true)
    }
    for (const [from, tos] of Object.entries(SESSION_TRANSITIONS)) {
      expect(isSessionStatus(from)).toBe(true)
      for (const to of tos) expect(isSessionStatus(to)).toBe(true)
    }
  })

  it('allows accepting → active rollback when the Shopify code creation fails', () => {
    expect(canTransition('accepting', 'active')).toBe(true)
    expect(checkSessionTransition('accepting', 'active')).toEqual({
      ok: true, from: 'accepting', to: 'active', kind: 'rollback',
    })
  })

  it('allows accepted → accepting → accepted only for legacy no-code recovery', () => {
    expect(canTransition('accepted', 'accepting')).toBe(true)
    expect(canTransition('accepting', 'accepted')).toBe(true)
    expect(checkSessionTransition('accepted', 'accepting')).toEqual({
      ok: true, from: 'accepted', to: 'accepting', kind: 'legacy-recovery',
    })
    expect(canRecoverLegacyAccept({ status: 'accepted', discountCode: null })).toBe(true)
    expect(canRecoverLegacyAccept({ status: 'accepted' })).toBe(true)
    expect(canRecoverLegacyAccept({ status: 'accepted', discountCode: 'BARGAIN-1234' })).toBe(false)
    expect(canRecoverLegacyAccept({ status: 'active', discountCode: null })).toBe(false)
    expect(canRecoverLegacyAccept({ status: 'purchased', discountCode: null })).toBe(false)
  })

  it('allows purchase settlement only from an accepted or walked-away session', () => {
    expect(PURCHASE_SOURCE_STATUSES).toEqual(['accepted', 'rejected', 'expired', 'abandoned'])
    for (const from of PURCHASE_SOURCE_STATUSES) {
      expect(canTransition(from, 'purchased')).toBe(true)
      expect(checkSessionTransition(from, 'purchased')).toEqual({
        ok: true, from, to: 'purchased', kind: 'purchase',
      })
    }
    for (const from of ['active', 'accepting', 'purchased'] as SessionStatus[]) {
      expect(canTransition(from, 'purchased')).toBe(false)
    }
  })

  it('validates from/to with an explicit reason', () => {
    expect(checkSessionTransition('nope', 'active')).toEqual({
      ok: false, from: 'nope', to: 'active', reason: 'INVALID_FROM',
    })
    expect(checkSessionTransition('active', 'nope')).toEqual({
      ok: false, from: 'active', to: 'nope', reason: 'INVALID_TO',
    })
    expect(checkSessionTransition('purchased', 'accepted')).toEqual({
      ok: false, from: 'purchased', to: 'accepted', reason: 'ILLEGAL_TRANSITION',
    })
    expect(checkSessionTransition('active', 'accepted')).toEqual({
      ok: true, from: 'active', to: 'accepted', kind: 'forward',
    })
  })

  it('makes purchased absorbing', () => {
    expect(isTerminal('purchased')).toBe(true)
    expect(isNegotiable('purchased')).toBe(false)
    expect(SESSION_TRANSITIONS.purchased).toEqual([])
    for (const to of SESSION_STATUSES) expect(canTransition('purchased', to)).toBe(false)
  })
})

describe('walkout escalation — quit phrasing must NOT terminate a session', () => {
  it('a single "I quit" is a retain (never a termination)', () => {
    expect(walkoutOutcome({ hadRetention: false, attemptsRemaining: 2 })).toBe('retain')
    expect(walkoutOutcome({ hadRetention: false, attemptsRemaining: 1 })).toBe('retain')
  })

  it('a second walkout OR exhausted attempts abandons the session', () => {
    expect(walkoutOutcome({ hadRetention: true, attemptsRemaining: 5 })).toBe('abandon')
    expect(walkoutOutcome({ hadRetention: false, attemptsRemaining: 0 })).toBe('abandon')
    expect(walkoutOutcome({ hadRetention: true, attemptsRemaining: 0 })).toBe('abandon')
  })

  it('dropout language like "quit trying / quitting / I quit this offer" reads as a walkout (→ retention, not termination)', () => {
    const cases = [
      'I quit trying',
      'I quit this offer',
      'I quit the deal',
      'I am quitting',
      "i'm quitting",
      "i'm quitting this price",
      'quit bargaining',
      'quit negotiating',
      'quit trying to negotiate',
      'I give up on the offer',
      'stop the deal',
    ]
    for (const c of cases) {
      expect(detectWalkout(c)).toBe(true)
    }
  })

  it('does not misread harmless "quit" sentences as a walkout', () => {
    expect(detectWalkout('please quit asking for a lower price')).toBe(false)
    expect(detectWalkout('quit your day job jokes aside')).toBe(false)
    expect(detectWalkout('the app keeps quitting on me')).toBe(false)
  })

  it('still protects unrelated leave-taking (work/school/dinner)', () => {
    expect(detectWalkout('leaving for work, brb')).toBe(false)
    expect(detectWalkout('heading out for lunch')).toBe(false)
    expect(detectWalkout('going to the gym')).toBe(false)
  })
})
