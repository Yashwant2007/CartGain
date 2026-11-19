import { describe, it, expect } from '@jest/globals'
import {
  buildFrameGeometry,
  stageGutterWidth,
  overlapsForbidden,
  type FrameInput,
} from '@/lib/bargain/character3d/frame'

const baseChat: FrameInput['chat'] = { x: 100, y: 200, width: 460, height: 640 }
const baseStage: FrameInput['stage'] = { x: 560, y: 200, width: 84, height: 640 }

describe('character3d frame geometry', () => {
  it('places the character home inside the stage gutter', () => {
    const g = buildFrameGeometry({
      chat: baseChat,
      stage: baseStage,
      characterHeight: 160,
      characterWidth: 96,
    })
    expect(g.home.x).toBeGreaterThanOrEqual(baseStage.x)
    expect(g.home.x).toBeLessThanOrEqual(baseStage.x + baseStage.width)
    expect(g.home.y).toBe(baseStage.y + baseStage.height)
    expect(g.walkFrom).toBeLessThanOrEqual(g.walkTo)
  })

  it('computes grip targets on the top edge of the chat frame', () => {
    const g = buildFrameGeometry({
      chat: baseChat,
      stage: baseStage,
      characterHeight: 160,
      characterWidth: 96,
    })
    expect(g.gripTopLeft.y).toBe(baseChat.y)
    expect(g.gripTopRight.y).toBe(baseChat.y)
    expect(g.gripTopLeft.x).toBeGreaterThan(baseChat.x)
    expect(g.gripTopRight.x).toBeLessThan(baseChat.x + baseChat.width)
    expect(g.seat.y).toBe(baseChat.y)
    expect(g.peek.y).toBeLessThan(baseChat.y)
  })

  it('computes side-edge grip targets', () => {
    const g = buildFrameGeometry({
      chat: baseChat,
      stage: baseStage,
      characterHeight: 160,
      characterWidth: 96,
    })
    expect(g.gripSideLeft.x).toBe(baseChat.x)
    expect(g.gripSideRight.x).toBe(baseChat.x + baseChat.width)
  })

  it('keeps travel inside the gutter', () => {
    const g = buildFrameGeometry({
      chat: baseChat,
      stage: baseStage,
      characterHeight: 160,
      characterWidth: 96,
    })
    expect(g.walkFrom).toBeGreaterThanOrEqual(baseStage.x)
    expect(g.walkTo).toBeLessThanOrEqual(baseStage.x + baseStage.width)
  })

  it('detects forbidden overlap', () => {
    const composer = { x: 120, y: 780, width: 320, height: 72 }
    expect(overlapsForbidden({ x: 200, y: 780 }, { width: 80, height: 60 }, [composer])).toBe(true)
    expect(overlapsForbidden({ x: 600, y: 200 }, { width: 80, height: 60 }, [composer])).toBe(false)
  })

  it('stage gutter width scales with panel width', () => {
    expect(stageGutterWidth(300, true)).toBe(0)
    expect(stageGutterWidth(400, true)).toBe(52)
    expect(stageGutterWidth(500, true)).toBe(68)
    expect(stageGutterWidth(900, true)).toBe(84)
    expect(stageGutterWidth(900, false)).toBe(0)
  })

  it('pixelsToWorld maps with the given origin and scale', () => {
    const w = { x: (100 - 0) / 100, y: -(200 - 0) / 100 }
    expect(w).toEqual({ x: 1, y: -2 })
  })
})
