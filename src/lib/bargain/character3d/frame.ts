import type { CharacterSpec } from './types'

/**
 * Maps the real DOM geometry of the chat to the character's stage.
 *
 * The character lives in a dedicated gutter beside the conversation, so it can
 * never cover a message, an offer amount, a product image or the composer. The
 * only part of the chat it is allowed to touch is the frame itself — the top
 * and side edges of the conversation area — which is what it grips, hangs from
 * and sits on.
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface FrameInput {
  /** The conversation area whose edges the character may grip. */
  chat: Rect
  /** The reserved stage gutter beside the conversation. */
  stage: Rect
  /** Rects the character must never overlap (composer, checkout, offer card). */
  forbidden?: Rect[]
  /** Character height in CSS pixels. */
  characterHeight: number
  /** Character shoulder width in CSS pixels. */
  characterWidth: number
}

export interface FrameGeometry {
  /** Where the character's feet rest. */
  home: Point
  /** Horizontal travel range for the feet inside the stage gutter. */
  walkFrom: number
  walkTo: number
  /** Hand targets on the top edge of the chat frame. */
  gripTopLeft: Point
  gripTopRight: Point
  /** Hand targets on the side edges of the chat frame. */
  gripSideLeft: Point
  gripSideRight: Point
  /** Where the character sits on the top edge. */
  seat: Point
  /** Where the character's head peeks over the top edge. */
  peek: Point
  /** Y of the top edge of the chat frame. */
  topEdgeY: number
  /** Height of the chat frame. */
  chatHeight: number
  /** X of the frame edge the stage touches. */
  stageEdgeX: number
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.max(min, Math.min(max, value))
}

/**
 * Builds the stage geometry. Pure and pixel based; the renderer converts to
 * world units with the scene scale.
 */
export function buildFrameGeometry(input: FrameInput): FrameGeometry {
  const { chat, stage, characterHeight, characterWidth } = input

  const stageCenterX = stage.x + stage.width / 2
  const stageEdgeX = stage.x < chat.x ? chat.x : chat.x + chat.width
  const topEdgeY = chat.y

  // The character stands on the floor of the stage gutter, aligned with the
  // bottom of the conversation so it feels like it is standing next to it.
  const floorY = stage.y + stage.height

  // Travel is limited so the character never leaves the reserved gutter.
  const halfBody = characterWidth / 2
  const stageRight = stage.x + stage.width
  let walkFrom = clamp(stage.x + halfBody, stage.x, stageRight)
  let walkTo = clamp(stageRight - halfBody, stage.x, stageRight)
  // If the character is wider than the gutter, pin it to the centre so the
  // range is always valid (walkFrom <= walkTo).
  if (walkFrom > walkTo) {
    const centre = stage.x + stage.width / 2
    walkFrom = centre
    walkTo = centre
  }

  const gripInset = Math.min(characterWidth * 0.35, chat.width * 0.18)
  const gripTopLeft: Point = { x: chat.x + gripInset, y: topEdgeY }
  const gripTopRight: Point = { x: chat.x + chat.width - gripInset, y: topEdgeY }

  const gripHeight = clamp(chat.height * 0.42, characterHeight * 0.35, characterHeight * 0.9)
  const gripSideLeft: Point = { x: chat.x, y: topEdgeY + gripHeight }
  const gripSideRight: Point = { x: chat.x + chat.width, y: topEdgeY + gripHeight }

  const seat: Point = {
    x: clamp(stageCenterX, chat.x + gripInset, chat.x + chat.width - gripInset),
    y: topEdgeY,
  }

  const peek: Point = {
    x: clamp(stageCenterX, chat.x + gripInset, chat.x + chat.width - gripInset),
    y: topEdgeY - characterHeight * 0.32,
  }

  return {
    home: { x: stageCenterX, y: floorY },
    walkFrom,
    walkTo,
    gripTopLeft,
    gripTopRight,
    gripSideLeft,
    gripSideRight,
    seat,
    peek,
    topEdgeY,
    chatHeight: chat.height,
    stageEdgeX,
  }
}

/**
 * True when a rectangle centred on the character would overlap a forbidden
 * region. The character is steered away instead of being drawn over the UI.
 */
export function overlapsForbidden(
  centre: Point,
  size: { width: number; height: number },
  forbidden: Rect[] = [],
): boolean {
  const left = centre.x - size.width / 2
  const right = centre.x + size.width / 2
  const top = centre.y - size.height
  const bottom = centre.y
  return forbidden.some((rect) => {
    return !(right < rect.x || left > rect.x + rect.width || bottom < rect.y || top > rect.y + rect.height)
  })
}

/**
 * The recommended stage gutter width for a panel of the given width. The
 * gutter is reserved space, so the conversation never moves under the
 * character.
 */
export function stageGutterWidth(panelWidth: number, enabled: boolean): number {
  if (!enabled) return 0
  if (panelWidth < 320) return 0
  if (panelWidth < 420) return 52
  if (panelWidth < 620) return 68
  return 84
}

/**
 * The world position of a pixel point, given the scene scale.
 */
export function pixelsToWorld(
  point: Point,
  origin: Point,
  pixelsPerMeter: number,
): { x: number; y: number } {
  return {
    x: (point.x - origin.x) / pixelsPerMeter,
    y: -(point.y - origin.y) / pixelsPerMeter,
  }
}
