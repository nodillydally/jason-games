# PixelLab assets — Jason's character

Generated 2026-08-09. Free trial: 3 of 40 generations used.

| What | ID |
|---|---|
| Character v1 (slim, 18x50) | `8e382ecd-0c21-4fed-b3b0-56c212e89f82` |
| **Character v2 (chibi, 16x38) — CHOSEN** | `7f2daf35-3036-451a-b57c-bd6ebfafbf0f` |
| Run animation (south, 5 frames) | see anim-run.json → animation_id |

## v2 recipe (reproduce or extend with this)
- endpoint `POST /v2/create-character-with-4-directions`
- image_size 32x32 (canvas comes back 48x48, ~40% padding for animation)
- proportions custom: head_size 1.7, legs_length 0.6, arms_length 0.75, shoulder_width 1.15
- view `low top-down`, outline `single color black outline`, shading `flat shading`, detail `low detail`
- text_guidance_scale 9.0

## Animation recipe
- endpoint `POST /v2/animate-character`, mode `v3`, frame_count 4, directions `["south"]`
- returns 5 frames (frame 0 is the reference pose, then the cycle)

## Notes
- Output is raw RGBA base64, not PNG — decode with width from the response, height = len/(4*w)
- Key is at C:\dev\.secrets\pixellab.env, deliberately outside every git repo

## Facings

Two are imported. `s` (south) faces the viewer and is used for portraits —
menus, shop rows, the reveal card. `e` (east) is the profile view used wherever
the runner is actually travelling, because a token sliding rightwards down a
race lane should face the way it's going.

Animations are generated per direction (`"directions": ["east"]`), so each pose
costs one generation per facing. The east idle is the character's own static
east frame from creation — a standing pose needs no animation, and reusing it
saved a generation.

Both facings are cropped against a **single** shared bounding box so the sprite
does not change size when it turns. Import them together, never separately.
