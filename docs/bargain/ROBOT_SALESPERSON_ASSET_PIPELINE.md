# CartGain 3D Robot Salesperson Asset Pipeline

## Status

The shared lazy Three.js renderer now loads
`public/assets/salesperson-robot/cartgain-salesperson.glb` after the bargain
experience mounts. The supplied GLB is 1,424,352 bytes, 20,300 triangles, one
41-joint skin, five PBR materials and ten facial morph targets. It has no image
textures; shell, joint, face-screen, glow and accent surfaces use embedded PBR
material factors. Its 17 authored clips are `Idle_Breathing`, `Enter`,
`Shift_Position`, `Look_At_Customer`, `Talk`, `Listen`, `Think`, `Point`,
`Open_Hand`, `Wave`, `Surprised`, `Disappointed`, `Smile`, `Celebrate`,
`Goodbye`, `Hang` and `Climb`. `Shift_Position` supplies repositioning; this
asset has no walking gait or jump clip.

The repository has a lazy Three.js renderer in
`src/components/bargain/LivingShopkeeper3D.tsx`, a deterministic event planner
in `src/lib/bargain/character3d/machine.ts`, a clip library in
`src/lib/bargain/character3d/clips.ts`, and DOM frame measurement / two-bone IK
helpers in `frame.ts` and `ik.ts`. The renderer consumes conversation events,
plans authored clips through `machine.ts`, measures the chat and reserved stage,
and applies reach-limited two-bone IK to the robot's right arm for contextual
pointing. The IK target gestures toward the card; it does not claim that the
robot can touch arbitrary DOM controls.

Friendly, Strict and Playful use the same robot. Personality selects distinct
event reactions, accent materials and animation cadence. Friendly greets with
an open wave and uses Open_Hand for explanations; Strict uses a calm customer
look and slower, controlled motion; Playful reacts more expressively and uses
the authored Climb and Hang clips when the conversation permits. The procedural
rig is development-only and is labeled `procedural-development-fallback` on
its canvas. Production hides the avatar if the GLB or WebGL fails, while the
bargain chat remains available. Conversation events, not random timers, select
the animation plans. One-shot states cross-fade and play in order. Reduced
motion and the merchant essential-motion setting stop continuous movement.

The robot stays inside its dedicated stage canvas and does not move across the
message list, composer or deal controls. The measured chat frame and IK target
provide a directional gesture toward the chat edge while the stage gutter
protects content readability. The planner supports `widget_opened`, `greeting`,
`customer_typing`, `customer_message`, `ai_thinking`, `ai_reply`,
`counter_offer`, `deal_accepted`, `deal_rejected`, `checkout_started` and
`widget_closed`; storefront widgets emit these from user/API events.

## Asset provenance and remaining approval

The model and generator files were supplied in `files.zip` without a named
creator, source URL or commercial-use license statement. See
`public/assets/salesperson-robot/ASSET-CREDITS.md`. Do not represent the asset as
independently licensed until the project owner records rights or obtains a
written commercial-use grant. The model is material-only; if visual QA finds
the finish insufficient at storefront size, an authorized texture-enhanced GLB
can use the same renderer contract.

The GLB should include:

- A complete smooth white humanoid robot with articulated torso, shoulders,
  elbows, wrists, palms and legs; rounded head, teal/cyan digital face and a
  small antenna. It must be recognizable at the actual storefront display size.
- A glTF 2.0 skin with named root, hips/pelvis, spine, chest, neck, head, left
  and right upper arms, forearms, hands, thighs and shins. Finger bones are
  recommended for pointing and open-hand gestures.
- A genuine animated facial system: named blink, smile, surprise, disappointed
  and talking morph targets, or animated eye/jaw/brow joints with equivalent
  expression range. A face texture alone does not meet this requirement.
- Embedded PBR materials (and embedded textures where authored). Target at most 2K textures, 60,000
  triangles, and 6 MiB for the full GLB including animation data. Avoid external
  texture fetches, Draco and KTX2 until their decoders are configured in the
  storefront loader.
- A consistent rest pose at the feet, facing +Z, with one unit representing one
  metre. Keep its center of mass and head position documented for camera setup.
- Embedded, named skeletal clips: `idle`, `enter`, `walk` (or a documented
  authored shift/reposition clip), `look_at_customer`,
  `talk`, `listen`, `think`, `point`, `wave`, `surprised`, `disappointed`,
  `smile`, `celebrate`, and `goodbye`. All one-shot clips must return to a safe
  standing pose. Clips should be in place; travel is controlled by the
  interaction controller so the character cannot cross the message or composer
  area.
- Provenance and commercial-use license documentation beside the GLB.

Use the supplied robot reference image to approve silhouette, face, palette and
proportions before modeling. That image was not present in the repository at
the time this audit was performed.

## Import and verification

1. Model and rig in Blender or an equivalent DCC. Export one binary glTF 2.0
   file with the clips and any authored textures embedded.
2. Place the file at the required path and add a `LICENSE.md` recording source,
   creator, license, modifications and any attribution requirement.
3. Run `npm run avatar:validate`. The script checks GLB structure, a shared
   skeleton, required body roles, clip names, a facial rig, self-contained PBR
   material/image resources, triangle count and transfer-size budget. It is a
   structural check, not visual or animation QA.
4. In the browser, inspect the full body, silhouette, face at target size,
   every required clip, transitions, texture sharpness and first-load behavior.
   Verify no clip clips through the chat panel and that reduced-motion mode
   stops ambient movement.
5. Integrate the approved file through one shared lazy-loaded 3D character
   controller used by the storefront widgets, Studio preview and dashboard
   demo. Delete the three persona-specific human model selections only after
   the replacement passes visual QA.

## Runtime/event contract

Use the already resolved merchant personality (`BargainExperienceConfig` and
`resolveShopkeeperPersonality`) to select animation style. Map the existing
client conversation events (`widget_opened`, `greeting`, `customer_typing`,
`customer_message`, `ai_thinking`, `ai_reply`, `counter_offer`,
`deal_accepted`, `deal_rejected`, `checkout_started`, `widget_closed`) through
the deterministic character state machine. These are visual-only inputs; do
not put floor prices or other merchant-only values into the client animation
payload. Pricing and deal decisions remain server-authoritative.

The shared controller moves the robot only within its reserved stage gutter.
It applies reach-limited IK for pointing and uses the actual Climb/Hang clips
without claiming that those poses grip arbitrary DOM elements. If WebGL or GLB
loading fails, hide the avatar region cleanly and preserve the chat; do not
substitute the old human SVG.

## Shared runtime surfaces

The storefront widgets, Experience Studio preview and dashboard demo all use
`ShopkeeperStage` and the same `LivingShopkeeper3D` controller. Bargain API,
chat history, server-authoritative round count, expiry timer and checkout
actions remain owned by their existing flows. The GLB and GLTF loader are
requested only when the enabled stage mounts. Rendering quality adapts down on
mobile/low-core devices, and renderer, animation, observer, material and texture
resources are cleaned up on unmount.

## Acceptance evidence still required

The GLB structure and Three.js parser have been verified, but structural
validation does not prove that the poses look natural in the storefront.
Desktop/mobile screenshots and recordings for greeting, product explanation,
offers, rejection, accepted deals, all three personalities, failed loading and
IK placement remain required. Device performance and real Shopify checkout
journeys also need manual verification. Typecheck, lint and unit tests are
code-level checks only. Obtain rights documentation and complete visual QA
before describing the avatar as production-approved.
