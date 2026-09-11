# soulyap — Illustration Voice

**Small human moments, drawn with one confident line.**

This is the single source of truth for illustration and illustration-motion in soulyap. It sits
beside `docs/design/motion.md` (motion tokens, the Release → Travel → Resonance arc) and
`theme/tokens.ts` (colour, type, radius). Where they overlap, `motion.md` wins on timing and
`tokens.ts` wins on colour.

Live references — open these before building:
- The scenes, moving: https://claude.ai/code/artifact/673deabc-aaf1-4d32-ac0f-211f93192814
- The cast's behaviours (§10): https://claude.ai/code/artifact/c224498c-c519-4205-b3b4-2c25251c4017

---

## 0. The voice

Modern editorial cartoon — the warmth and economy of a good newspaper spot illustration, with
a premium, product-grade finish. Think "editorial cartoon meets Apple-calm motion."

1. **People, never mascots.** A small cast of real people in ordinary moments. No blobs, no
   creatures, no branded characters.
2. **One confident line.** Hand-drawn ink, two weights only. It should look drawn, not traced.
3. **A print, not a vector.** Flat colour that sits slightly off-register under the line, like a
   risograph. No gradients, no shadows, no glow, no glossy anything.
4. **Generous quiet.** One subject, one environment object, lots of paper. Simple silhouettes
   that read at 120px.
5. **Breath, not bounce.** Idle motion is slow, small, and on several clocks that never sync.
   No spins, no elastic, no flashy transitions (this mirrors `motion.md` §1).
6. **It lives inside the neo-brutal frame and never replaces it.** Illustration appears on paper
   cards with the app's border and hard offset shadow. The words are always the hero.

Avoid: 3D renders, photorealism, heavy gradients, neon, excessive detail, clip-art faces,
corporate "people-at-desks" illustration, and anything that feels energetic or jokey — the
content is real pain; the drawing is a light doorway to it.

---

## 1. Technique

### The line
| Role | Stroke | Notes |
|---|---|---|
| Silhouette (`ink`) | 3.4px, `#1A1A1A` | round caps + joins; every outer contour |
| Interior (`ink2`) | 2px, `#1A1A1A` | brows, mouths, hands, scribbles, muntins, grass |
| Pressure pass (`press`) | 1.4px, offset (1px, 1.1px) | a second thin pass on the shadow side of heads and torsos only — gives the line weight without a brush engine |

**Tremor.** On the web the whole scene gets a displacement filter
(`feTurbulence baseFrequency=0.03 numOctaves=2`, `feDisplacementMap scale=2.2`) so straight
lines wobble by a hair. `react-native-svg` has no displacement filter — in the app, either bake
a subtle wobble into the path data when exporting, or skip it: the off-register fills and the
two weights carry most of the "drawn" feeling on their own. Do **not** simulate it with blur or
opacity tricks.

### The fill
Flat colour, no stroke, drawn *under* the line and shifted off-register. Use one of three offsets
per object so the misprint feels real rather than global:

| Class | Offset |
|---|---|
| `off`  | (+3px, +2px) |
| `off2` | (−2.6px, +2.4px) |
| `off3` | (+2.2px, −2.6px) |

### Construction (one language for every body)
- **Limbs are tubes:** an ink stroke with a colour stroke on top. Legs `11 / 7.4`, arms `8.5 / 4.9`,
  neck `10 / 6.4` (ink width / colour width). Round caps.
- **Shoes:** a 7px ink stroke, 12px long, at the ankle. Left shoe points left, right points right.
- **Hands:** skin ellipse `rx 4.5, ry 3.6` with a 2px contour. Drawn after the arm so it caps it.
- **Torso:** a shape with a shoulder slope and a slight waist — never a capsule. Front view is
  40 wide at the shoulders, 32 at the waist.
- **Head:** circle `r 16` front / `r 15` profile, skin fill, silhouette line, pressure pass.
- **Hair is the identity.** Every cast member has a distinct hair silhouette (see §3).
- **Face = brows + eyes + mouth**, all `ink2`. Eyes are `r 1.8` dots (open) or a small arc (closed).
- **Seated means seated:** thighs forward, shins down. Cross-legged is two crossing tubes.

### Composition
- Scenes are **4:3** (`viewBox 0 0 400 300`). Ground line at `y = 244`. Figures ≈ 150px tall.
- One environment object in the upper third (lamp post, shelf, the floating scrap) so the
  negative space is intentional, not empty.
- One scene per screen. One yellow object per scene.

---

## 2. Palette

All fills are literal hex (a print doesn't invert in dark mode). The *card* around the scene
follows the app theme; the drawing does not.

| Name | Hex | Role |
|---|---|---|
| paper | `#F7F4EF` / card `#FBF8F2` | ground |
| ink | `#1A1A1A` | every line |
| **light** | `#FFE500` | **the yap** — the scrap, once per scene, never decoration |
| coral | `#E8927C` | garment |
| sage | `#AEC6A4` | garment, plants |
| dusk | `#9DB4C8` | trousers, garment |
| sand | `#E9D8B8` | bench, shelf, props, trousers |
| grey | `#B9B2A6` | grey hair |
| skin | `#F1DCC4` · `#D3A57C` · `#8E5A3C` | three tones — the cast uses all three |

---

## 3. The cast

Three people. Reuse them; don't invent a fourth without a reason.

**A — the protagonist.** Short curly crop (ink), medium skin `#D3A57C`, coral top, dusk trousers.
Appears in the empty states. Waiting, calm, open.
Hair path (front, head centre 200,112 — shift y for other heads):
`M184 108C182 96 190 90 196 94C200 88 210 90 212 96C218 94 220 104 216 110C212 102 204 100 200 102C196 98 188 100 184 108Z`

**B — the one who lets go.** Hair cap + bun (ink, bun `r 7` at the back), deep skin `#8E5A3C`,
sage top, dusk trousers. Appears in the release and the resonance.
Hair cap (front, head 200,96): `M184 92C184 78 216 78 216 92C210 86 190 86 184 92Z` + bun `(214,80) r7`.
Profile (head 180,146, facing left): `M166 136C166 126 195 126 195 146C189 136 176 132 166 136Z` + bun `(194,134) r6`.

**C — the stranger.** Grey side-parted hair `#B9B2A6` with an ink part line, light skin `#F1DCC4`,
round glasses (`r 4.2` lens + temple line), dusk top, sand trousers. Appears in the resonance.
Profile hair: `M166 136C167 122 194 122 195 146C188 134 178 134 166 136Z`; part `M180 124l4 10`;
glasses `circle(170,145) r4.2` + `M174 145h9`.

---

## 4. Expression vocabulary (all `ink2`)

| Feeling | Brows | Eyes | Mouth |
|---|---|---|---|
| **Waiting** (A) | level, slightly raised: `M190 107l7-1 M203 106l7 1` | open dots | small flat curve `M196 121q4 2 8 0` |
| **Relief** (B, release) | relaxed, raised: `M190 90q3-2 7 0 M203 90q4-2 7 0` | closed arcs `M191 98q3 3 6 0 M203 98q3 3 6 0` | soft smile `M195 106q5 3 10 0` |
| **Recognition** (B & C, resonance) | one raised brow `M166 141l7-1` | open dot | small open `M167 154q2 2 4 0` |
| **Content** (A, notifications) | relaxed `M190 121q3-1 7 0 M203 121q4-1 7 0` | closed arcs | soft `M196 135q4 2 8 0` |

Never: wide grins, tears, shock, anger. The register runs from quiet to gently glad.

---

## 5. Where it lives — and where it never goes

| Moment | Scene | Component |
|---|---|---|
| My Confessions — empty | A on the park bench, notebook closed, one leaf | `EmptyBench` |
| Notifications — empty | A cross-legged with a warm cup, steam | `NotificationsEmpty` |
| Onboarding (explaining the loop) | B letting the scrap go → the scrap arriving between B and C | `Release`, `Resonance` |
| Error / offline | A on the bench, no leaf, caption does the work | `EmptyBench` (still) |
| Marketing, store, website | all four | — |

**Never:**
- **The crisis path.** No illustration, no motion, a plain fade only (CLAUDE.md #6).
- **Read and write cards.** Text-first; the words are the hero.
- **The live submit and match moments.** `motion.md` already gives those screens their one hero
  motion (the words lifting; the ripple + count-up). Don't layer a drawn person on top of them —
  the `Release` and `Resonance` scenes are for onboarding and marketing, not for the moment itself.
- **The wait for a match.** That stays *The Travel* — a light drifting into the dark.

---

## 6. Motion

Everything is an idle loop on its own clock. No clock shares a period with another, so the
scene never visibly "beats." Easing is `breathe` (`Easing.inOut(Easing.sin)`) unless noted.

| Clock | Period | What moves |
|---|---|---|
| breathe | 5.2s / 6.1s | **chest group only** — `scale(1.008, 1.02)` from the bottom centre. Legs never breathe. |
| nod | 7.0s / 7.6s | head group — `translateY −1.2px`, `rotate 0.8°` from the neck |
| blink | 6.1s | eyes — `scaleY 1 → 0.08 → 1` in the last 9% of the cycle |
| sway | 6.4s | shrub, plant — `rotate ±1.6°` from the base |
| leaf | 13.0s (start −4s) | falls with two drifts and a slow turn, fades at both ends |
| release | 12.0s | scrap: held 0–22% → lifts up-left and fades by 62% → gone; arms open `±6°` at 34%; three dots trail 44–68% |
| heartbeat + lift | 4.8s | the arrived scrap `scale 1 → 1.14 → 0.97 → 1.05 → 1` (the `motion.md` lub-dub); **both heads lift** `rotate −5°, translateY −1.5px` at 70%, settle by 86% |
| steam | 3.8s (second wisp −1.4s) | rises 18px, fades in to 0.85 and out |

Second figure in a scene takes the alternate period (6.1s / 7.6s) with a negative delay so it is
never in phase with the first.

**Add to `theme/motion.ts`:**
```ts
export const ILLUSTRATION = {
  breathe: [5200, 6100], nod: [7000, 7600], blink: 6100, sway: 6400,
  leaf: 13000, release: 12000, heartbeat: 4800, steam: 3800,
} as const;
```

**Reduced motion (`useReducedMotion()`)** — every clock stops and each scene rests in a
*designed* still, never a paused frame: the scrap mid-lift (`translate(−30,−64) rotate(−8°)`),
the dots gone, the leaf mid-fall (`translate(−12,52) rotate(−22°)`), the steam faint
(`opacity .7, translateY −6`). The drawing stays; only the breathing goes.

**Haptics:** none. Illustration is silent. The Resonance heartbeat here is decorative — the real
`impactAsync(Medium)` belongs to the live match moment in `motion.md`.

---

## 7. Reference scenes (the assets)

The markup below is the source. Classes are a shorthand for the technique in §1:

| Class | Meaning |
|---|---|
| `ink` | fill none, stroke `#1A1A1A` 3.4, round caps/joins (children may override `stroke-width`) |
| `ink2` | same at 2px |
| `press` | fill none, stroke `#1A1A1A` 1.4, translated (1, 1.1) |
| `over` | fill none, round caps — the colour pass of a tube (stroke + width set inline) |
| `off` / `off2` / `off3` | fill translated by the offsets in §1 |
| `chest` `c2` / `head` `h2` / `blink` `k2` / `sway` / `leaf` / `armL` `armR` / `note` / `dot` `d2` `d3` / `beat` / `lift` / `steam` `s2` | animation groups from §6 (`c2`, `h2`, `k2` = the alternate period; `armL`/`armR` pivot at the shoulders 183,132 / 217,132) |

### 7.1 `EmptyBench` — "Nothing here yet."
```svg
<svg viewBox="0 0 400 300">
<g class="ink"><path d="M78 244V88"/></g>
<rect class="off" fill="#E9D8B8" x="68" y="72" width="20" height="16" rx="3"/><g class="ink"><rect x="68" y="72" width="20" height="16" rx="3"/></g>
<g class="ink"><path d="M36 244H364"/></g><g class="ink2"><path d="M110 244l3-8M118 244l1-6"/></g>
<g class="sway"><path class="off2" fill="#AEC6A4" d="M298 244C294 226 306 212 318 217C322 204 344 204 346 219C358 217 364 234 352 244Z"/><g class="ink"><path d="M298 244C294 226 306 212 318 217C322 204 344 204 346 219C358 217 364 234 352 244Z"/></g></g>
<rect class="off3" fill="#E9D8B8" x="110" y="150" width="180" height="8" rx="4"/>
<g class="ink"><rect x="110" y="150" width="180" height="8" rx="4"/><path d="M130 158V190M270 158V190"/></g>
<rect class="off2" fill="#E9D8B8" x="110" y="190" width="180" height="10" rx="5"/>
<g class="ink"><rect x="110" y="190" width="180" height="10" rx="5"/><path d="M130 200V244M270 200V244"/></g>
<g class="ink"><path d="M192 194L184 208V240M208 194L216 208V240" stroke-width="11"/></g>
<g class="over" stroke="#9DB4C8" stroke-width="7.4"><path d="M192 194L184 208V240M208 194L216 208V240"/></g>
<g class="ink"><path d="M176 243h12M212 243h12" stroke-width="7"/></g>
<g class="chest">
<path class="off" fill="#E8927C" d="M180 142C180 134 220 134 220 142L216 194C216 199 184 199 184 194Z"/>
<g class="ink"><path d="M180 142C180 134 220 134 220 142L216 194C216 199 184 199 184 194Z"/></g>
<path class="press" d="M180 142C180 134 220 134 220 142L216 194C216 199 184 199 184 194Z"/>
<g class="ink"><path d="M200 128V140" stroke-width="10"/></g><g class="over" stroke="#D3A57C" stroke-width="6.4"><path d="M200 128V140"/></g>
<rect class="off3" fill="#AEC6A4" x="184" y="178" width="32" height="10" rx="2"/><g class="ink"><rect x="184" y="178" width="32" height="10" rx="2"/></g><g class="ink2"><path d="M190 183h20"/></g>
<g class="ink"><path d="M183 148L190 182M217 148L210 182" stroke-width="8.5"/></g>
<g class="over" stroke="#E8927C" stroke-width="4.9"><path d="M183 148L190 182M217 148L210 182"/></g>
<ellipse class="off" fill="#D3A57C" cx="190" cy="184" rx="4.5" ry="3.6"/><ellipse class="off" fill="#D3A57C" cx="210" cy="184" rx="4.5" ry="3.6"/>
<g class="ink2"><ellipse cx="190" cy="184" rx="4.5" ry="3.6"/><ellipse cx="210" cy="184" rx="4.5" ry="3.6"/></g>
</g>
<g class="head">
<circle class="off" fill="#D3A57C" cx="200" cy="112" r="16"/>
<g class="ink"><circle cx="200" cy="112" r="16"/></g>
<circle class="press" cx="200" cy="112" r="16"/>
<path class="off2" fill="#1A1A1A" d="M184 108C182 96 190 90 196 94C200 88 210 90 212 96C218 94 220 104 216 110C212 102 204 100 200 102C196 98 188 100 184 108Z"/>
<g class="ink"><path d="M184 108C182 96 190 90 196 94C200 88 210 90 212 96C218 94 220 104 216 110C212 102 204 100 200 102C196 98 188 100 184 108Z"/></g>
<g class="ink2"><path d="M190 107l7-1M203 106l7 1M196 121q4 2 8 0"/></g>
<g class="blink"><circle fill="#1A1A1A" cx="194" cy="114" r="1.8"/><circle fill="#1A1A1A" cx="206" cy="114" r="1.8"/></g>
</g>
<g class="leaf"><g transform="translate(300 64)"><path class="off" fill="#AEC6A4" d="M0 0C6-9 18-9 20 0C18 9 6 9 0 0Z"/><g class="ink2"><path d="M0 0C6-9 18-9 20 0C18 9 6 9 0 0Z"/><path d="M3 0H17"/></g></g></g>
</svg>
```

### 7.2 `Release` — "let it go."
```svg
<svg viewBox="0 0 400 300">
<g class="ink"><path d="M36 244H364"/></g><g class="ink2"><path d="M292 244l3-8M300 244l2-6"/></g>
<g class="ink"><path d="M193 178V240M207 178V240" stroke-width="11"/></g>
<g class="over" stroke="#9DB4C8" stroke-width="7.4"><path d="M193 178V240M207 178V240"/></g>
<g class="ink"><path d="M186 243h12M202 243h12" stroke-width="7"/></g>
<g class="chest c2">
<path class="off2" fill="#AEC6A4" d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z"/>
<g class="ink"><path d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z"/></g>
<path class="press" d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z"/>
<g class="ink"><path d="M200 112V124" stroke-width="10"/></g><g class="over" stroke="#8E5A3C" stroke-width="6.4"><path d="M200 112V124"/></g>
<g class="armL"><g class="ink"><path d="M183 132L160 150" stroke-width="8.5"/></g><g class="over" stroke="#AEC6A4" stroke-width="4.9"><path d="M183 132L160 150"/></g><ellipse class="off" fill="#8E5A3C" cx="157" cy="153" rx="4.8" ry="3.8"/><g class="ink2"><ellipse cx="157" cy="153" rx="4.8" ry="3.8"/></g></g>
<g class="armR"><g class="ink"><path d="M217 132L240 150" stroke-width="8.5"/></g><g class="over" stroke="#AEC6A4" stroke-width="4.9"><path d="M217 132L240 150"/></g><ellipse class="off" fill="#8E5A3C" cx="243" cy="153" rx="4.8" ry="3.8"/><g class="ink2"><ellipse cx="243" cy="153" rx="4.8" ry="3.8"/></g></g>
</g>
<g class="head h2">
<circle class="off2" fill="#8E5A3C" cx="200" cy="96" r="16"/>
<g class="ink"><circle cx="200" cy="96" r="16"/></g><circle class="press" cx="200" cy="96" r="16"/>
<path class="off" fill="#1A1A1A" d="M184 92C184 78 216 78 216 92C210 86 190 86 184 92Z"/>
<g class="ink"><path d="M184 92C184 78 216 78 216 92C210 86 190 86 184 92Z"/><circle cx="214" cy="80" r="7" fill="#1A1A1A"/></g>
<g class="ink2"><path d="M190 90q3-2 7 0M203 90q4-2 7 0M191 98q3 3 6 0M203 98q3 3 6 0M195 106q5 3 10 0"/></g>
</g>
<g class="note"><g transform="translate(200 148)"><path class="off" fill="#FFE500" d="M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z"/><g class="ink2"><path d="M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z" stroke-width="2.6"/><path d="M-7-3q3-3 6 0t6 0M-7 3h9"/></g></g></g>
<g class="dot"><circle cx="168" cy="62" r="2.6" fill="#1A1A1A"/></g>
<g class="dot d2"><circle cx="178" cy="54" r="2.2" fill="#FFE500" stroke="#1A1A1A" stroke-width="1.4"/></g>
<g class="dot d3"><circle cx="160" cy="46" r="2.4" fill="#1A1A1A"/></g>
</svg>
```
Release keyframes (12s): `note` — 0% `translate(0,0) opacity 0` · 6% `opacity 1` · 22% held ·
54% `translate(−40,−88) rotate(−10°)` · 62% `translate(−46,−104) rotate(−12°) opacity 0` · hold to 100%.
`dot` — hidden until 44%, visible at 52%, `translateY −40` and gone by 68%. `armL/armR` — `rotate ∓6°` at 34%, back by 58%.

### 7.3 `Resonance` — "someone felt this too."
The right-hand figure (C) is the left-hand geometry inside `<g transform="translate(400 0) scale(-1 1)">`
with C's colours, hair and glasses.
```svg
<svg viewBox="0 0 400 300">
<g class="ink"><path d="M36 244H364"/></g><g class="ink2"><path d="M80 244l3-8M336 244l-3-8"/></g>
<g class="beat"><g transform="translate(200 104)"><path class="off" fill="#FFE500" d="M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z"/><g class="ink2"><path d="M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z" stroke-width="2.6"/><path d="M-7-3q3-3 6 0t6 0M-7 3h9"/></g></g></g>
<g class="ink"><path d="M176 226L146 214L150 240" stroke-width="11"/></g>
<g class="over" stroke="#9DB4C8" stroke-width="7.4"><path d="M176 226L146 214L150 240"/></g>
<g class="ink"><path d="M142 243h12" stroke-width="7"/></g>
<g class="chest">
<path class="off2" fill="#AEC6A4" d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z"/>
<g class="ink"><path d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z"/></g>
<path class="press" d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z"/>
<g class="ink"><path d="M180 160V172" stroke-width="10"/></g><g class="over" stroke="#8E5A3C" stroke-width="6.4"><path d="M180 160V172"/></g>
<g class="ink"><path d="M182 180L152 212" stroke-width="8.5"/></g><g class="over" stroke="#AEC6A4" stroke-width="4.9"><path d="M182 180L152 212"/></g>
<ellipse class="off" fill="#8E5A3C" cx="150" cy="214" rx="4.5" ry="3.6"/><g class="ink2"><ellipse cx="150" cy="214" rx="4.5" ry="3.6"/></g>
</g>
<g class="lift">
<circle class="off2" fill="#8E5A3C" cx="180" cy="146" r="15"/><g class="ink"><circle cx="180" cy="146" r="15"/></g><circle class="press" cx="180" cy="146" r="15"/>
<path class="off" fill="#1A1A1A" d="M166 136C166 126 195 126 195 146C189 136 176 132 166 136Z"/>
<g class="ink"><path d="M166 136C166 126 195 126 195 146C189 136 176 132 166 136Z"/><circle cx="194" cy="134" r="6" fill="#1A1A1A"/></g>
<g class="ink2"><path d="M166 141l7-1M165 147c-3 1-3 5 0 6M167 154q2 2 4 0"/></g>
<g class="blink"><circle fill="#1A1A1A" cx="170" cy="145" r="1.8"/></g>
</g>
<g transform="translate(400 0) scale(-1 1)">
<g class="ink"><path d="M176 226L146 214L150 240" stroke-width="11"/></g>
<g class="over" stroke="#E9D8B8" stroke-width="7.4"><path d="M176 226L146 214L150 240"/></g>
<g class="ink"><path d="M142 243h12" stroke-width="7"/></g>
<g class="chest c2">
<path class="off2" fill="#9DB4C8" d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z"/>
<g class="ink"><path d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z"/></g>
<path class="press" d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z"/>
<g class="ink"><path d="M180 160V172" stroke-width="10"/></g><g class="over" stroke="#F1DCC4" stroke-width="6.4"><path d="M180 160V172"/></g>
<g class="ink"><path d="M182 180L152 212" stroke-width="8.5"/></g><g class="over" stroke="#9DB4C8" stroke-width="4.9"><path d="M182 180L152 212"/></g>
<ellipse class="off" fill="#F1DCC4" cx="150" cy="214" rx="4.5" ry="3.6"/><g class="ink2"><ellipse cx="150" cy="214" rx="4.5" ry="3.6"/></g>
</g>
<g class="lift" style="animation-delay:-.3s">
<circle class="off2" fill="#F1DCC4" cx="180" cy="146" r="15"/><g class="ink"><circle cx="180" cy="146" r="15"/></g><circle class="press" cx="180" cy="146" r="15"/>
<path class="off" fill="#B9B2A6" d="M166 136C167 122 194 122 195 146C188 134 178 134 166 136Z"/>
<g class="ink"><path d="M166 136C167 122 194 122 195 146C188 134 178 134 166 136Z"/></g>
<g class="ink2"><path d="M180 124l4 10M166 140l7-1M174 145h9M165 147c-3 1-3 5 0 6M167 154q2 2 4 0"/><circle cx="170" cy="145" r="4.2"/></g>
<g class="blink k2"><circle fill="#1A1A1A" cx="170" cy="145" r="1.5"/></g>
</g>
</g>
</svg>
```

### 7.4 `NotificationsEmpty` — "Nothing new yet."
```svg
<svg viewBox="0 0 400 300">
<rect class="off2" fill="#E9D8B8" x="270" y="112" width="90" height="6" rx="2"/><g class="ink"><rect x="270" y="112" width="90" height="6" rx="2"/></g>
<g class="sway"><path class="off3" fill="#AEC6A4" d="M312 90C300 78 300 66 312 62C318 70 318 80 312 90Z"/><path class="off3" fill="#AEC6A4" d="M312 90C324 80 326 68 316 60C310 68 308 80 312 90Z"/><g class="ink2"><path d="M312 90C300 78 300 66 312 62C318 70 318 80 312 90Z"/><path d="M312 90C324 80 326 68 316 60C310 68 308 80 312 90Z"/></g></g>
<rect class="off" fill="#E8927C" x="300" y="90" width="24" height="22" rx="3"/><g class="ink"><rect x="300" y="90" width="24" height="22" rx="3"/></g>
<g class="ink"><path d="M36 244H364"/></g><g class="ink2"><path d="M110 244l3-8M118 244l1-6"/></g>
<g class="ink"><path d="M208 210L244 226L194 240" stroke-width="11"/></g><g class="over" stroke="#9DB4C8" stroke-width="7.4"><path d="M208 210L244 226L194 240"/></g>
<g class="ink"><path d="M192 210L156 226L206 240" stroke-width="11"/></g><g class="over" stroke="#9DB4C8" stroke-width="7.4"><path d="M192 210L156 226L206 240"/></g>
<g class="chest c2">
<path class="off" fill="#E8927C" d="M180 156C180 148 220 148 220 156L216 212C216 217 184 217 184 212Z"/>
<g class="ink"><path d="M180 156C180 148 220 148 220 156L216 212C216 217 184 217 184 212Z"/></g>
<path class="press" d="M180 156C180 148 220 148 220 156L216 212C216 217 184 217 184 212Z"/>
<g class="ink"><path d="M200 142V154" stroke-width="10"/></g><g class="over" stroke="#D3A57C" stroke-width="6.4"><path d="M200 142V154"/></g>
<g class="ink"><path d="M183 164L191 190M217 164L209 190" stroke-width="8.5"/></g>
<g class="over" stroke="#E8927C" stroke-width="4.9"><path d="M183 164L191 190M217 164L209 190"/></g>
<rect class="off3" fill="#FBF8F2" x="189" y="182" width="22" height="17" rx="3"/><g class="ink"><rect x="189" y="182" width="22" height="17" rx="3"/></g><g class="ink2"><path d="M211 186c7 0 7 9 0 9"/></g>
<ellipse class="off" fill="#D3A57C" cx="192" cy="192" rx="4.5" ry="3.6"/><ellipse class="off" fill="#D3A57C" cx="208" cy="192" rx="4.5" ry="3.6"/>
<g class="ink2"><ellipse cx="192" cy="192" rx="4.5" ry="3.6"/><ellipse cx="208" cy="192" rx="4.5" ry="3.6"/></g>
</g>
<g class="head h2">
<circle class="off" fill="#D3A57C" cx="200" cy="126" r="16"/>
<g class="ink"><circle cx="200" cy="126" r="16"/></g><circle class="press" cx="200" cy="126" r="16"/>
<path class="off2" fill="#1A1A1A" d="M184 122C182 110 190 104 196 108C200 102 210 104 212 110C218 108 220 118 216 124C212 116 204 114 200 116C196 112 188 114 184 122Z"/>
<g class="ink"><path d="M184 122C182 110 190 104 196 108C200 102 210 104 212 110C218 108 220 118 216 124C212 116 204 114 200 116C196 112 188 114 184 122Z"/></g>
<g class="ink2"><path d="M190 121q3-1 7 0M203 121q4-1 7 0M191 128q3 3 6 0M203 128q3 3 6 0M196 135q4 2 8 0"/></g>
</g>
<g class="steam"><g class="ink2"><path d="M195 176c-5-6 5-10 0-18c-4-5 3-8 0-14"/></g></g>
<g class="steam s2"><g class="ink2"><path d="M204 176c-5-6 5-10 0-18c-4-5 3-8 0-14"/></g></g>
</svg>
```

---

## 8. Implementation (Expo SDK 56 · react-native-svg · reanimated 4)

- **Files.** `theme/illustration.ts` (palette, line weights, offsets, `ILLUSTRATION` clocks re-exported
  from `theme/motion.ts`), `components/illustrations/primitives.tsx` (`Tube`, `Head`, `Hand`, `Shoe`,
  `OffFill`, `Press`), one file per scene: `EmptyBench.tsx`, `Release.tsx`, `Resonance.tsx`,
  `NotificationsEmpty.tsx`, and an `IllustrationCard.tsx` that wraps a scene in the paper card
  (theme border, hard offset shadow, radius `radius.card`).
- **Drawing.** Port the §7 markup 1:1 into `react-native-svg` (`Svg viewBox="0 0 400 300"`, `G`,
  `Path`, `Rect`, `Circle`, `Ellipse`). Classes become props: `ink` → `stroke="#1A1A1A"
  strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill="none"`; `off*` → the shape
  duplicated with `translate`; `press` → the silhouette path duplicated at 1.4 with `translate`.
  Scenes scale with `width="100%"` and `preserveAspectRatio="xMidYMid meet"`.
- **Motion.** `Animated.createAnimatedComponent(G)` with reanimated shared values driving
  `translateX/Y`, `scale`, `rotation`, and `origin` props (the origins in §6/§7 — bottom-centre of
  the chest, the neck for the head, the shoulders for the arms, the scrap's centre for the beat).
  Loops: `withRepeat(withTiming(..., { duration, easing: EASING.breathe }), -1, true)`; start each
  with a negative delay (`withDelay`) so clocks are out of phase. Run on the UI thread. **Pause the
  loops when the screen is not focused** (`useIsFocused`) — idle art must not cost battery in the
  background.
- **Reduced motion.** Gate at the top of every scene with `useReducedMotion()`; when true, render
  the §6 still (no shared values at all).
- **Never** blur, opacity-flicker, or spring these. No haptics.
- **Performance.** ≤ ~120 nodes per scene, one `Svg` per scene, no filters. Test on a low-end
  Android device: 60fps idle with two scenes mounted.
- **Copy under a scene** uses `fontFamily.serifItalic` at `font.confessionSize` (Fraunces italic),
  labels in `Inter_600SemiBold` uppercase with `font.labelLetterSpacing` — exactly the app's card type.

---

## 9. Build brief — phase 1

1. `theme/illustration.ts` + the `ILLUSTRATION` clocks in `theme/motion.ts`.
2. `primitives.tsx` and `IllustrationCard.tsx`.
3. `EmptyBench` → mount in the **My Confessions** empty state (the "Nothing here yet." screen from
   the My Confessions build) above the copy and the "Say something" button.
4. `NotificationsEmpty` → mount in the **Notifications** tab empty state ("Nothing new yet.").
5. `Release` and `Resonance` as components only (no mount yet — onboarding uses them in phase 2).
6. Reduced-motion stills for all four. Loops pause off-focus.
7. Do not touch the crisis path, read/write cards, the submit moment, the match moment, or The Travel.

**Phase 2 (not now):** the §10 behaviours — the two-segment rig, then Hello on first launch, Yapping
and A stroll in onboarding, Just being under the empty states. A small hop is marketing/website only
and never ships inside the app.

---

## 10. Behaviours — how the cast moves

The §7 scenes are people standing still and breathing. These are the behaviours layered on top when
a moment calls for one. Live reference (all five, moving):
https://claude.ai/code/artifact/c224498c-c519-4205-b3b4-2c25251c4017

> **`docs/design/motion-behaviours.md` is the build spec and the source of truth for these numbers.**
> This section is the design rationale and a summary; if the two ever disagree, that file wins.
> Change it first, then the code, then update this summary.

### 10.1 The rig — never one segment

**A limb always bends at a real joint.** A single straight stroke pivoting from the shoulder is the
puppet tell; it is what made the first pass feel robotic. Every arm is `shoulder → elbow → hand`,
every leg is `hip → knee → ankle`, nested so the child's rotation composes on the parent's.

| Joint | Front view | Profile (walk) |
|---|---|---|
| shoulder | (183,132) L · (217,132) R | (200,140) |
| elbow | (179,150) L · (222,150) R | (200,158) |
| hand | (174,171) L · (229,171) R | (200,178) |
| hip | (193,178) L · (207,178) R | (200,184) |
| knee | (193,209) L · (207,209) R | (200,212) |
| ankle | y 240, foot stroke `M186 243h12` / `M202 243h12` | y 240, `M197 243h14` |
| neck | (200,112)→(200,124) | (200,118)→(200,130) |
| head centre | (200,96) r16 | (198,104) r16 |

Segment lengths: upper arm 18 · forearm 18 · thigh 28–31 · shin 28–31. A child segment's
`transform-origin` is its joint **in its own un-rotated local space** — the parent's rotation carries
it. Hands are a separate group at the wrist so they can lag the forearm.

### 10.2 The behaviours

Notation: `t%` of the cycle → rotation (deg) unless stated. Pendulums get **three keyframes and a
sine**; shaped actions get **per-segment timing functions**. Never let a shaped action ease-in-out
between every pose — that is the "stop at every frame" that reads as mechanical.

---

**A stroll — walk · 1.4s · profile**

| Part | Keyframes | Easing |
|---|---|---|
| thigh | 0% −28 · 50% +24 · 100% −28 | sine (pendulum) |
| shin | 0% 3 · 36% 0 · 52% 18 · 76% 62 · 100% 3 | ease-in-out |
| foot (ankle) | 0% −7 · 20% 0 · 56% 15 · 80% 11 · 100% −7 | ease-in-out |
| upper arm | 0% 24 · 50% −24 · 100% 24 | sine (pendulum) |
| forearm | 0% 7 · 50% 27 · 100% 7 | sine, **delayed ~0.1s** |
| torso lean (pivot hip) | 0% −1 · 50% +1 · 100% −1 | sine |
| upper-body bob | 0.7s: translateY 0 → −3px → 0 | sine |
| head counter-bob | 0.7s: translateY 0 → +1.1px → 0, delay −0.07s | sine |

Opposite leg and far arm run the same clocks at **delay −0.7s** (half cycle). The whole figure carries
a static `rotate(4°)` about the hip. The far leg/arm use a darker shade (`#8AA1B5`, `#D07E69`) for depth.

**Feet stay planted.** Only the upper body bobs — if the whole figure bobs, the planted foot lifts off
the ground and the walk turns into a hover. The character does not translate; the **world** moves:
ground dashes `stroke-dashoffset 30` per 0.7s, scenery `translateX −700px` per 16s. These two speeds
must match or the feet visibly slide.

---

**A small hop — 6.4s · front · marketing only**

Body (`translateY`, `scale`), with the timing function that **leaves** each stop:

| t | transform | timing function out |
|---|---|---|
| 0–40% | 0, scale(1,1) | `cubic-bezier(.4,0,.7,.4)` |
| 47% | +2px, scale(1.06,.93) — crouch | `cubic-bezier(.15,.75,.35,1)` |
| 53% | −27px, scale(.97,1.05) | `cubic-bezier(.35,0,.75,.6)` |
| 56.5% | −30px, scale(1,1) — apex | `cubic-bezier(.55,0,.9,.35)` |
| 62% | 0, scale(1.07,.91) — landing squash | `cubic-bezier(.2,.8,.4,1)` |
| 67% | 0, scale(.985,1.025) | ease-in-out |
| 72% | 0, scale(1.008,.996) | ease-in-out |
| 78–100% | 0, scale(1,1) | — |

- **thigh** `scaleY` (origin = hip): 1 · 47% .9 · 53–56.5% .9 · 62% .88 · 68% 1.02 · 73% 1
- **shin** `scaleY` (origin = knee): 1 · 47% .86 · 53% **.6** · 56.5% .62 · 62% .85 · 68% 1.03 · 73% 1
  — the shins fold *under* the thighs in the air. Do **not** scale the whole leg; that reads as a
  telescope, not a tuck. (A front view can't show a knee bend in perspective, so the fold is a
  vertical scale from the knee — the standard cartoon cheat.)
- **shadow**: scale 1 → .74, opacity .09 → .045 while airborne (45%→62%)
- **arms** (L): 42% 0 · 47% 10 · 54% 42 · 58% 36 · 63% 44 · 70% −5 · 78% 0. R mirrored.
- **forearms** (L): 43% 0 · 49% 14 · 56% 24 · 64% −14 · 72% 4 · 80% 0, **delay +0.08s**. R mirrored.
- **head** (translateY, rotate): 47% +1.6px · 53% +3px,−1.4° · 57% +.5px · 62% −2.4px,+0.8° ·
  67% +1.2px · 72% −0.4px · 78% 0 — the head lags the body up and overshoots on the landing.

Height is capped at 30px and squash at 8%. If it ever feels too bright for the brand, cut the height
to 22px before touching anything else.

---

**Yapping — talk · 4.2s · front**

- **Mouth**: four drawn shapes — closed curve, small circle, open ellipse, wide curve — cycled over
  12 equal slots with `steps(1, end)`. **Never tween a mouth**; lip shapes snap.
- **Gesture upper arm**: 0/4% 0 · 13% −40 · 17% −34 · 33% −18 · 38% −23 · 52% −47 · 56% −41 ·
  70% −11 · 74% −16 · 88% −2 · 100% 0. Every reach overshoots and eases back.
- **Gesture forearm**: same shape at ~60% amplitude, **delay +0.11s** — 14% −24 · 19% −14 · 34% −6 ·
  39% −13 · 53% −28 · 58% −18 · 71% −2 · 76% −9 · 89% −1 · 100% 0. This is what makes the hand whip.
- **Brows**: 13% −1.9px → 17% −1.4px, again at 53/57% — lift on the emphasised words only.
- **Head**: on a **6.3s** clock (deliberately not a multiple of 4.2s, so the loop never lines up) —
  9% −2° · 18% −1° · 30% +2.4° · 38% +1.6° · 52% −1.2° · 64% +2° · 77% +0.4° · 88% −2.2°.
- **Scrap**: fades in at the mouth 18→26%, drifts to (+38,−46) rotate 8° by 70%, gone by 82%.
- **Resting arm**: sympathetic sway (below).

---

**Hello — wave · 5.6s · front · first launch only**

- **Upper arm** raised, shoulder (217,132) → elbow (236,112): 22% 0 · 27% −5 [anticipation dip] ·
  33–63% −3 · 72% 0.
- **Forearm** from the elbow — amplitude **decays**: 25% 0 · 28% −7 · 33% +26 · 39% −22 · 45% +19 ·
  51% −14 · 57% +9 · 63% −4 · 69% 0. A fixed amplitude is a metronome; the decay is the whole point.
- **Hand** from the wrist (240,88): same pattern at ~45% amplitude, **delay +0.09s**.
- **Head**: 30% +3.6° · 40% +3° · hold · 74% 0 — starts a beat *before* the arm.

---

**Just being — idle · 14s · front · any empty state**

The sequence: rest → glance left → glance right → shift weight → scratch → settle.

- **Eyes** (lead the head by ~2% ≈ 300ms): 19% −3.4px · 22–30% −3px · 33% +3.4px · 36–44% +3px · 47% 0
- **Head**: 21% −4.8° · 24–31% −4° · 35% +4.8° · 38–45% +4° · [weight shift] · 65% +4.6° ·
  68–76% +4° · 80% −0.6° · 83% 0 — every turn overshoots then settles.
- **Chest weight shift**: 47.5% translateX −1.5px, −0.5° [anticipation] · 51% +4.6px, +1.8° ·
  53–56% +4px, +1.5° · 60% −0.6px, −0.2° · 62% 0
- **Scratch upper arm** (carries the weight shift first): 61.5% +8 [anticipation] · 64.5% −156 ·
  66.5% −150 · hold to 77% · 80.5% −6 · 82.5% +4 · 85% 0
- **Scratch forearm**, **delay +0.1s**: 64.5% −41 · then −33 · −40 · −31 · −39 · −32 · −38 · −34 ·
  77% −35 · 80.5% −6 · 82.5% +3 · 85% 0 — a **decaying** wiggle, and it lives in the forearm, not
  the whole arm. Upper −150 + forearm −35 puts the hand at the temple the way an arm actually gets
  there; a single straight arm swinging to −160 does not.

---

**Sympathetic sway — always on, under every behaviour**

Nobody stands dead. The non-acting arm sways on its own slow clock: upper arm 8.3s, ±2.4° from the
shoulder; forearm 8.3s, +4°→−3°, delay −7.9s. This runs alongside the §6 chest-breathe and head-nod.

### 10.3 The energy ladder

| Rung | Behaviour | Where it is allowed |
|---|---|---|
| 1 | **Just being** | Anywhere a scene lives. The default. |
| 2 | **Hello** | First launch and the onboarding welcome. One wave, then idle. |
| 3 | **Yapping** | The onboarding "say what's in your soul" step; the write empty state. |
| 4 | **A stroll** | Between onboarding steps; marketing and the website. |
| 5 | **A small hop** | **Marketing and the website only.** Never in the app, never near a heavy confession, never on the crisis path. |

One behaviour at a time per figure. A big action repeats no faster than every 5s. Squash and stretch
stays under 8%. Nothing spins, nothing springs, nothing snaps.

### 10.4 Reduced motion — the behaviour stills

Every clock stops and the figure holds a *posed* frame, never a paused one:

| Behaviour | Still |
|---|---|
| stroll | mid-stride: thigh −20 / shin 2 front, thigh +18 / shin +34 back; arm +18 / forearm +12, far arm −18 / forearm +22 |
| hop | standing at rest, legs straight, arms down |
| yapping | mouth open (shape 2), gesture arm −30 / forearm −16, scrap held at (+24,−30) rotate 6° |
| hello | forearm at +14°, arm raised |
| just being | neutral rest, arms down |

### 10.5 Implementation notes (reanimated 4)

- **Pendulums** (thighs, arms, lean, bob, sway): `withRepeat(withTiming(to, { duration, easing:
  Easing.inOut(Easing.sin) }), -1, true)` — two endpoints, mirrored. Nothing else.
- **Shaped actions** (hop, gesture, scratch, wave, idle sequence): `withRepeat(withSequence(
  withTiming(v1, { duration: d1, easing: e1 }), withTiming(v2, { duration: d2, easing: e2 }), …), -1)`
  — one easing **per segment**, taken from the tables above. Convert the `cubic-bezier(a,b,c,d)`
  values with `Easing.bezier(a,b,c,d)`; `%` of the cycle × the period gives each duration.
- **Lag** on a child segment: `withDelay(100, …)` (80–120ms), or a negative phase offset on a loop.
- **Nesting**: put each segment's animated `rotation` on its own `<G>`, with `origin={{x,y}}` at the
  joint. The parent's transform composes automatically — do not re-add the parent's rotation.
- **Never**: springs, `Easing.elastic`, rotation > 360, squash > 8%, two behaviours at once, or a
  behaviour on the crisis path.
- **Cost**: gate every behaviour on `useReducedMotion()` and `useIsFocused()`; a behaviour off-screen
  runs no shared values at all.

---

## 11. Testing & Verification

Unit / integration (jest-expo):
- Each scene renders one `Svg` with `viewBox="0 0 400 300"` and no `filter` elements.
- Palette: every fill/stroke hex in a scene is in `theme/illustration.ts` (assert no stray colours).
- `useReducedMotion() === true` → scene renders the still: no reanimated shared values created,
  the scrap/leaf/steam at their rest transforms, dots absent.
- Loops start with distinct periods (5.2s vs 6.1s etc.) and negative delays — assert no two
  clocks in one scene share a period.
- Loops pause when the screen loses focus and resume on focus.
- `EmptyBench` mounts in the My Confessions empty state and not when there are confessions;
  `NotificationsEmpty` mounts only when the notification list is empty.
- Crisis screen snapshot contains no illustration component.
- Read/write cards, the composer submit screen, and the match screen contain no illustration component.
- `IllustrationCard` uses `radius.card`, the theme border colour, and a hard offset shadow (no blur radius).
- Snapshot tests for all four scenes in light and dark theme (the drawing is identical; only the card changes).

Manual smoke (light & dark, iOS + a low-end Android):
- Each scene breathes from the chest, the head nods separately, blinks are rare; nothing bounces.
- Release: the scrap is held, lifts once, fades; arms open slightly; the cycle feels occasional, not a loop.
- Resonance: the scrap beats; both heads lift on the beat, out of phase with each other's breathing.
- Reduced motion on: every scene is a calm still with the designed rest poses.
- 60fps idle with two scenes mounted; no dropped frames on tab switch.

Behaviours (§10) — only when phase 2 ships:
- Every arm and leg renders as two segments; assert no animated limb is a single path (the rig test).
- Each forearm/hand animation carries a delay of 80–120ms relative to its parent segment.
- Walk: ground-dash speed and scenery speed produce the same px/sec (assert the computed ratio);
  the planted foot's y never rises above the ground line across the cycle.
- Hop: peak translateY is ≤ 30px, max scale deviation ≤ 8%, shin scaleY reaches ≤ .65 at apex.
- Talk: the mouth uses discrete steps (no interpolated frames between shapes); the head clock is not
  a whole-number multiple of the mouth clock.
- Wave: successive forearm amplitudes strictly decrease (26 → 22 → 19 → 14 → 9 → 4).
- Idle: the eye keyframe leads the corresponding head keyframe by 250–350ms.
- Energy ladder: the hop component is not importable from any app screen (marketing/website only);
  no behaviour component appears on the crisis path, read/write cards, submit, or match screens.
- Reduced motion: each behaviour renders its §10.4 still and creates no shared values.
- Off-focus: all behaviour loops are cancelled when the screen loses focus.
Report the jest run output; fix any failing case before marking done.

---

*Owner: design. Change this doc first, then the code. Companion docs: `docs/design/motion.md`,
`theme/tokens.ts`, `CLAUDE.md` (invariants #2, #6). Last updated 2026-09-10 (§10 behaviours added).*
