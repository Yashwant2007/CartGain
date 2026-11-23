# Shopkeeper character assets

These three GLB files are from Grab3D and are offered under CC0 1.0. The
publisher's asset license states that the models are AI-assisted (Meshy base
mesh and textures, then cleaned, textured, and checked in Blender).

| File | Source | Published animation clips | Rig facts verified from GLB |
| --- | --- | --- | --- |
| `friendly-shopkeeper.glb` | [Casual Woman](https://grab3d.com/models/characters/woman/) | `walk`, `run` | 54 joints; includes thumb and finger joints |
| `strict-shopkeeper.glb` | [Businessman](https://grab3d.com/models/characters/businessman/) | `walk`, `run` | 24 joints; no finger or facial joints |
| `playful-shopkeeper.glb` | [Chef](https://grab3d.com/models/characters/chef/) | `walk`, `run` | 24 joints; no finger or facial joints |

The character-specific greeting, idle, pointing, explaining, reaction, jumping,
climbing, hanging, and sitting clips are authored in `LivingShopkeeper3D.tsx`
as skeletal `AnimationClip`s. They are not part of the source GLBs. Climbing
and hanging currently animate the character's existing body joints; the GLBs
do not contain facial rigs. The per-file source licenses and publisher
provenance are documented by Grab3D at the source links above.
