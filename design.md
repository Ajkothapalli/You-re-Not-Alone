# soulyap — Mobile App Design System

Single source of truth for all visual design decisions in the React Native app.

---

## Principles

- **Neo-brutalism**: hard offset shadows, solid borders, no gradients, no elevation blur
- **Typographic warmth**: Fraunces (serif) carries emotion; Inter carries information
- **Color as signal**: rotating palette accents are functional — `you` color = the person writing, `them` = the match
- **Reduced motion first**: every animation has a skip path via `useReducedMotion()`
- **Accessibility**: all interactive elements announce via `AccessibilityInfo`; haptics reinforce state changes

---

## Color Tokens

Defined in `theme/tokens.ts`. Access via `useThemeColors()`.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `bg` | `#F7F4EF` | `#0A0A0A` | Screen background |
| `ink` | `#FFFFFF` | `#141414` | Card/input surface |
| `paper` | `#1A1A1A` | `#F5F5F5` | Primary text, border |
| `dim` | `#888888` | `#666666` | Secondary text, icons |
| `line` | `rgba(0,0,0,.09)` | `#2A2A2A` | Hairline dividers |
| `border` | `#1A1A1A` | `#FFFFFF` | Card borders, neo-brutal shadow block |
| `accent` | `#FFE500` | `#FFE500` | Always yellow — used in PrimaryButton face |
| `feltText` | `#1A1A1A` | `#FFE500` | "X felt this too" counter text |
| `youreNotAlone` | `rgba(26,26,26,.65)` | `rgba(245,245,245,.80)` | Footer italic tagline |

**Splash / system colors (not in tokens):**
- Splash background: `#0E0C13`
- Android adaptive icon background: `#0E0B18`

---

## Rotating Palettes

Defined in `theme/palettes.ts`. Advances each app open: open #k → `palettes[(k-1) % 6]`.
Access via `usePalette()`.

| # | Name | `you` (warm accent) | `them` (cool accent) |
|---|---|---|---|
| 0 | Voltage | `#FFE500` | `#00E5C8` |
| 1 | Flame | `#FF4F00` | `#FF00AA` |
| 2 | Acid | `#CCFF00` | `#7B00FF` |
| 3 | Cyber | `#00D4FF` | `#FF6B00` |
| 4 | Violet | `#B388FF` | `#FF80AB` |
| 5 | Blaze | `#FF4444` | `#FFE500` |

`you` colors the "you wrote" label, card shadow, seam line, felt counter, and heart.
`them` colors the "they wrote" label and emoji picker knob.

---

## Typography

Fonts loaded in `lib/useFonts.ts`.

| Token | Family | Weight | Use |
|---|---|---|---|
| `fontFamily.serif` | Fraunces | 400 Regular | Confession body text |
| `fontFamily.serifItalic` | Fraunces | 400 Italic | Headlines, "you're not alone", quotes, wordmark |
| `fontFamily.serifBold` | Fraunces | 700 Bold | Dialog titles |
| `fontFamily.sans` | Inter | 400 Regular | Body copy, captions, hints, author labels |
| `fontFamily.sansBold` | Inter | 600 SemiBold | Buttons (UPPERCASE), labels, pill text |

**Core type scale (px):** 10 · 11 · 12 · 12.5 · 13 · 13.5 · 14 · 15 · 16 · 18 · 19 · 22 · 24 · 26 · 27 · 30 · 36

**Key text tokens:**

| Token | Value | Usage |
|---|---|---|
| `font.confessionSize` | 19px | Confession / ReadCard body |
| `font.confessionLineHeight` | 28.5px (19 × 1.5) | — |
| `font.labelSize` | 11px | "you wrote" / "they wrote" labels |
| `font.labelLetterSpacing` | 1.98px (0.18 × 11) | — |

**Common text patterns:**
- **Screen heading**: `serifItalic`, 26–30px, `color.paper`
- **Eyebrow / kicker**: `sansBold`, 10px, letterSpacing 3.5, UPPERCASE, `color.paper` at 65% opacity
- **Body paragraph**: `sans`, 13–16px, lineHeight ~21, `color.dim` or `rgba(243,238,232,.82)`
- **Button label**: `sansBold`, 14px, letterSpacing 2.52, UPPERCASE
- **Caption / hint**: `sans`, 12–13px, `color.dim`
- **"you're not alone"**: `serifItalic`, 13px, `color.youreNotAlone`

---

## Spacing & Border Radius

```ts
// theme/tokens.ts
radius.card  = 18    // ConfessionCard, ReadCard
radius.input = 14    // ConfessionInput, promo cards
radius.pill  = 999   // CounterPill, buttons, badges

spacing.cardPadding   = 28   // inside cards
spacing.screenPadding = 20   // screen horizontal padding
```

**Other radii in use (not in tokens):**
- Onboarding beat card: 36px
- Modal sheet corner: 28px (set in `_layout.tsx`)
- Dialog card: 22px
- Bottom sheet top corners: 24px
- Celebration character disc: 60px (120×120 circle)

---

## Neo-Brutalism Construction

Every interactive card surface uses the same 3-layer stack. `SHADOW = 4` or `5`.

```
┌─────────────────────────────┐
│  outerShell                 │  paddingRight: SHADOW, paddingBottom: SHADOW
│  ┌──────────────────────┐   │
│  │  shadowBlock (abs)   │   │  position:absolute, top:SHADOW, left:SHADOW, right:0, bottom:0
│  │  color.border bg     │   │  same borderRadius as card
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │  foreground card     │   │  color.ink bg, 2px color.border border, borderRadius
│  │  (actual content)    │   │
│  └──────────────────────┘   │
└─────────────────────────────┘
```

**Button variant (PrimaryButton):**
- Face: `#FFE500` (always — not from palette)
- Edge block: `#000000` (light) / `#C07D00` amber (dark)
- Border: 2px `#000000` (light) / `#FFE500` (dark)
- Press: face translates +3px down (native driver), black tint overlay fades to 18% opacity

**GhostButton:**
- Face: `color.ink` (transparent-ish)
- Edge block: `#000000`
- Border: 2px `color.border`
- Press: face translates +2px down, white tint `rgba(245,245,245,.06)`

Both buttons: disabled opacity 0.32. Label: `sansBold`, 14px, letterSpacing 2.52, UPPERCASE.

---

## Components

### `components/Buttons.tsx`

**Design constants:**
```ts
FACE_COLOR = '#FFE500'   // PrimaryButton face
EDGE_COLOR = '#000000'   // shadow block
FACE_TEXT  = '#0A0A0A'   // button label
DEPTH      = 4           // PrimaryButton shadow offset
GHOST_DEPTH = 3          // GhostButton shadow offset
```

- Height: auto (padding 16px vertical, 32px horizontal)
- BorderRadius: `radius.pill` (999)
- Haptics: Light impact on press-in
- Spring out: speed 22, bounciness 7

---

### `components/ConfessionCard.tsx`

The core match card shown after submission.

- Size: 340px wide, minHeight 472px
- Shell: `SHADOW = 5`, shadow color = `palette.you`
- Border: 2px `color.border`, borderRadius 18
- Padding: 28px (`spacing.cardPadding`)

**Layout top→bottom:**
1. `you wrote` label — `sansBold`, 11px, letterSpacing 1.98, UPPERCASE, `palette.you`
2. Confession text — `serif`, 19px / 28.5, `color.paper`
3. Seam: 2px solid `palette.you` line + "someone, at the same moment" in `color.dim`, 10px
4. `they wrote` label — same as above but `palette.them`
5. Match confession text
6. Spacer (flex 1)
7. Footer: hairline `color.line` top, `feltText` counter left, `serifItalic` tagline right

**Entrance animation:** fade + translateY 24→0 + scale 0.97→1, 700ms `Easing.out(cubic)`

---

### `components/ReadCard.tsx`

Onboarding / explore reading card.

- Same neo-brutal shell as ConfessionCard (5px shadow in `palette.you`)
- minHeight: 220; padding: 28px
- PersonaBadge (27px) shown above body text, marginBottom 14
- Body: max 6 lines, "read more" link in `sans`, 12px, underlined, `color.dim`
- Footer: HeartIcon (18px) + tick-counter + "felt this too" | "report" link

**Heart animation on add:** scale 1→1.4→0.88→1.2→1.0 (100/80/90/150ms)
**Heart animation on remove:** scale 1→0.65→1.0 (120/180ms)
**Counter:** per-character vertical slot machine, 80ms out + 120ms in, Y ±10px

**Entrance:** fade + translateY 20→0, 600ms quad-out, staggered by `delay` prop

---

### `components/ConfessionInput.tsx`

Write screen text field.

- Shell: `SHADOW = 4`, shadow color = `color.border`
- Border: 2px `color.border`, borderRadius 14
- Min height: 180px; padding: 16px
- Input: `serif`, 19px / 28.5, `color.paper`
- Char counter: `sans`, 11px; `palette.you` when ≤100 chars left, else `color.dim`
- Emoji toggle: ☺ glyph, 18px, `color.dim`
- Max chars: 1000

**Emoji picker theme:** container `color.ink`, knob `palette.them`, backdrop `color.bg + 'CC'`

---

### `components/CounterPill.tsx`

Felt-count pill on the match screen.

- Background: `palette.you`; border: 2px `#0A0A0A`; borderRadius: 999
- Padding: 8px vertical, 16px horizontal
- Label: `sansBold`, 11px, letterSpacing 1.98, UPPERCASE, `#0A0A0A`
- Mount: spring from scale 0.8, opacity 0 (speed 14, bounciness 12)
- Press: scale 0.95 over 80ms → spring back (speed 22, bounciness 7)

---

### `components/HeartIcon.tsx`

SVG heart, used in ReadCard felt-counter.

```svg
<!-- path, size default 18, fill or stroke in `color` prop -->
<path d="M12 20.3 C4.5 14.8 3 10 6.5 7.2 C8.7 5.5 11 6.6 12 8.2 C13 6.6 15.3 5.5 17.5 7.2 C21 10 19.5 14.8 12 20.3 Z" />
<!-- viewBox: 0 0 24 24 -->
```

Filled: `fill={color}`, no stroke. Unfilled: `fill="none"`, `stroke={color}` 2px, strokeLinejoin round.

---

### `components/AppDialog.tsx`

System-level modal dialog.

- Scrim: `rgba(4,3,6,.72)`, fullscreen, centered
- Card: `#17131F` bg, borderRadius 22, border `rgba(243,238,232,.09)`
- Top glow line: `rgba(245,153,110,.5)` (warm amber), hairline, inset 22px from card sides
- Title: `serifBold`, 19px / 22.8, `#F3EEE8`
- Message: `sans`, 13.5px / 20.9, `#A29CAA`
- Buttons: gap 8, marginTop 18

| Button type | Style |
|---|---|
| Default | LinearGradient `#FBBF24 → #FB7185`, height 46, pill, label `sansBold` 14px `#3A0A14` |
| Destructive | `rgba(242,109,109,.13)` bg, text `#F26D6D` |
| Cancel | transparent, border `rgba(243,238,252,.14)`, text `#A29CAA` |

Appear: spring scale 0.92→1 (tension 180, friction 22)

---

### `components/BottomSheet.tsx`

Reusable bottom sheet.

- Scrim: `rgba(0,0,0,.55)`, flex-end
- Sheet: `#17131F` bg, borderTopRadius 24, border `rgba(243,238,232,.08)` (top + sides only)
- Drag handle: 36×4px, borderRadius 2, `rgba(243,238,232,.18)`, paddingTop 12
- Header title: `serifItalic`, 22px, `#F3EEE8`; close: `sans`, 16px, `#A29CAA`
- Max height: 85% of window

---

### `components/AnimatedSplash.tsx`

Splash screen with logo choreography.

- Background: `color.ink` (dark: `#141414`)
- Logo: two PNG halves — left quote mark (41.1% of 220px) + right (58.9%), gap = spread
- Wordmark: `serifItalic`, 24px, `color.paper`; sub-text `sans`, 12px, `color.dim`, letterSpacing 0.3

**5-phase animation:**
1. **Hold** — logo centred, no motion
2. **Breathe** — halves spread ±20px + rotate ±9deg, 480ms cubic
3. **Spring back** — speed 9, bounciness 16
4. **Heartbeat** — scale 1→1.07 pulse
5. **Float** — left half sine ±4px (1150ms), right half sine ±4px (1350ms, offset phase)
6. **Fade out** — overlay 450ms quad-in

Reduced-motion path: skip all animation, hold 1100ms, fade 300ms.

---

### `components/Celebration.tsx`

Post-submission confetti + character screen.

**Design constants:**
```ts
MUSTARD = '#C07D00'   // accessible amber (~4.5:1 on white) — count number color
```

**Confetti:**
- 28 pieces (42 on milestones), burst from `(width/2, height×0.38)`
- Colors: `[palette.you, palette.them, color.paper, MUSTARD]`
- Shapes: circles (5–11px diameter) + bars (`size×2.2 × size`, borderRadius 2)
- Duration: 1400–1900ms, `Easing.out(cubic)`

**Character disc:**
- 120×120px, borderRadius 60
- Radial specular highlight (0.55→0 white) + rim light ellipse (white, 18% opacity)
- Shadow: y=10, radius 18, opacity 0.28, elevation 20
- Float: ±10px Y, 1400ms quad in/out loop
- Ground shadow: 88×18px, borderRadius 44, `rgba(0,0,0,.2)`

**Bloom ring:** SVG circle, stroke = `palette.you` 2px, scale 1→2.6, opacity 0→0.45→0

**Typography:**
- Headline: `serifItalic`, 30px / 38, `color.paper`, centered
- Count: `serifItalic`, 22px, `MUSTARD`
- Count label: `sansBold`, 12px, letterSpacing 1.5, UPPERCASE, `color.paper`
- Sub: `sans`, 14px / 21, `color.paper` at 65% opacity

**6 rotating affirmations:** "that took courage" · "you let it out" · "that's off your chest" · "you said the hard thing" · "braver than yesterday" · "you set it down"

---

### `components/ConfessionQuote.tsx`

Daily rotating writing prompt / quote on the write screen.

- 14 quotes, rotated daily: `Math.floor(Date.now() / 86_400_000) % 14`
- Opening mark: `serifItalic`, 36px, `color.dim`, opacity 0.5
- Quote: `serifItalic`, 15px / 23, `color.dim`, centered, opacity 0.85
- Author: `sans`, 12px, `color.dim`, centered, opacity 0.55

**Authors:** Zora Neale Hurston · Oscar Wilde (×2) · Carl Jung (×2) · Publilius Syrus · Robert Louis Stevenson · Brené Brown (×2) · Stephen Chbosky · Anne Lamott · Joseph Campbell · Ann Voskamp

---

### `components/StoryCard.tsx`

Off-screen canvas for share image generation.

- Canvas: 360×640px at device pixel ratio, `color.ink` bg
- Wordmark: `serifItalic`, 18px, `color.dim`, marginTop 40
- Inner card: 310×470px at position (25, 90), borderRadius 26, padding 24
- Seam line: gradient `palette.you → palette.them` (left→right), not solid
- Text scale: 14px / 21 (smaller than live card's 19px / 28.5 to fit canvas)
- Label size: 9px, letterSpacing 1.62 (vs 11px / 1.98 in live card)

---

## Illustration System — Personas

Defined in `components/Persona.tsx`. 12 named personas assigned at random per confession. Never tied to the author — random per card.

**Shared SVG constants:**
```ts
INK       = '#241F2B'   // brows, pupils, mouth outlines
EYE_WHITE = '#FBF7F0'   // eye whites
GOLD      = '#E9B85C'   // cove earring
BLUSH     = '#F0837A'   // at 0.4 opacity
```

**Persona definitions:**

| id | name | tint | skin | hair |
|---|---|---|---|---|
| kai | Kai | `#9C8BF6` violet | `#6B4226` brown | `#1A1620` near-black |
| ezra | Ezra | `#F5996E` salmon | `#DEB887` tan | `#6B4226` brown |
| joel | Joel | `#9BC47E` sage | `#C68642` medium | `#2B1A0E` dark brown |
| river | River | `#4FC8D6` teal | `#E0AC69` warm | `#2B2B33` dark cool |
| sage | Sage | `#8FB996` muted sage | `#FFDBAC` light | `#8C9BA5` grey |
| max | Max | `#7FA0FF` periwinkle | `#FADDBC` fair | `#3A2010` dark brown |
| indigo | Indigo | `#6E7BD9` indigo | `#C68642` medium | `#232038` deep purple-black |
| rowan | Rowan | `#E9B85C` gold | `#EFB98A` warm | `#6B4A2F` auburn |
| miles | Miles | `#E98AB6` rose | `#F5CBA7` light | `#2E1505` very dark |
| ash | Ash | `#A29CAA` grey-mauve | `#D9995F` warm | `#C9CDD4` silver |
| cruz | Cruz | `#B795E8` lavender | `#8D5524` deep | `#1A0E0A` near-black |
| cove | Cove | `#5FB6E8` sky | `#6E4326` brown | `#1F1B26` dark purple |

**SVG bust construction (all personas):**
1. Hair mass behind face
2. Face circle (skin color)
3. Hairline path overlaid
4. Eyes: white ovals + dark pupils + white highlight dot
5. Brows (INK color)
6. Optional: blush (`#F0837A` at 40%), freckles, stubble, beard, glasses (max), earrings (river, cove), spikes (ash), curls (indigo, cove), side-part (miles)
7. Mouth variant

**PersonaBadge:**
- Circle badge, `tint + '38'` bg (22% opacity), borderRadius pill, overflow hidden
- Glyph: 115% of badge size, clipped by circle
- Name label: `sansBold`, 11px, letterSpacing 1.98, UPPERCASE, tint color
- Default size: 27px, gap to name: 9px

---

## Illustration System — Category Glyphs

Defined in `components/CategoryGlyph.tsx`. Server-assigned, never author-controlled.

**Gradient construction:** linear gradient (light → center → dark, y-axis) + radial glow bed (34%→0% center color opacity).

**Category palette:**

| Category | center `c` | dark `d` | light `l` | Notes |
|---|---|---|---|---|
| mental_health | `#9C8BF6` | `#6E5CD8` | `#C9C0FA` | brain path |
| relationships | `#F5996E` | `#E0734A` | `#FBC7AE` | heart path |
| grief | `#7FA0FF` | `#5A7FE8` | `#DCE6FF` | face `#2F3E66` |
| secrets | `#FBBF24` | `#E0A000` | `#FDE08A` | keyhole, inner `#7A5800` |
| work_identity | `#4FC8D6` | `#2EA3B0` | `#A6E7EE` | briefcase |
| body_health | `#9BC47E` | `#6FA251` | `#C7E0B2` | drop / leaf |
| faith_meaning | `#B795E8` | `#9568D6` | `#DBC9F4` | spark / star |

**SVG path constants:**

```ts
// Heart
HP   = 'M0 3.6 C -2.6 1 -3.6 -0.6 -2.1 -2 C -1.1 -2.9 0 -1.8 0 -0.7 C 0 -1.8 1.1 -2.9 2.1 -2 C 3.6 -0.6 2.6 1 0 3.6 Z'

// Water drop
DROP = 'M0 -1.8 C1.3 -0.2 1.3 1.5 0 1.5 C-1.3 1.5 -1.3 -0.2 0 -1.8 Z'

// Keyhole shackle
SHK  = 'M8.8 11.2 L8.8 9 A3.2 3.2 0 0 1 15.2 9 L15.2 11.2 L13.4 11.2 L13.4 9 A1.4 1.4 0 0 0 10.6 9 L10.6 11.2 Z'

// Brain
BRAIN = 'M6 9 C6 6.4 8.4 5 12 5 C15.6 5 18 6.4 18 9 C19.1 9.4 19.5 10.7 18.9 11.7 C19.5 12.7 19 14.3 17.8 14.7 C17.3 16.5 14.9 17.5 12 17.5 C9.1 17.5 6.7 16.5 6.2 14.7 C5 14.3 4.5 12.7 5.1 11.7 C4.5 10.7 4.9 9.4 6 9 Z'
```

**CategoryBadge:** circle, `c + '14'` bg (8% opacity), `c + '40'` border, glyph at 68% of badge size.

---

## Animation Principles

| Principle | Rule |
|---|---|
| Reduced motion | `useReducedMotion()` gates every animation — always skip or hold |
| Native driver | All transform + opacity animations use `useNativeDriver: true` |
| Color interpolation | Non-native only — used in Celebration count animation |
| Standard spring | speed 9–22, bounciness 7–16 |
| Press release | Always speed 22, bounciness 7–8 |
| Entrance | fade + translateY or scale, 600–700ms `Easing.out(cubic)` |
| Stagger | ReadCard delay prop: 0ms (first), 160ms (second) |
| Haptics | Light → button press; Medium → felt add; Success → celebration; Heavy → milestone |

---

## Screen-Level Design Notes

### `app/welcome.tsx` — Onboarding

**Per-beat glow configs (background radial):**

| Beat | Screen | Color | cy | r | opacity |
|---|---|---|---|---|---|
| 0 | Welcome | `#F5996E` salmon | 22% | 58% | 0.50 |
| 1 | How it works | `#F5996E` salmon | 16% | 55% | 0.22 |
| 2 | Safety | `#9C8BF6` purple | 20% | 58% | 0.50 |
| 3 | Persona | persona tint | 40% | 58% | 0.45 |
| 4 | Categories | `#FB7185` pink | 80% | 58% | 0.45 |

**Beat card:** borderRadius 36, border `rgba(243,238,232,.07)`, shadow opacity 0.55, radius 26, offset y=13, padding 26px. Adjacent cards: scale 0.94, opacity 0.6.

**Category chip (selected):** borderColor + bg `cat.color + '1A'` (10%), text = category color in `sansBold`.

**WarmCta button (onboarding):** `#FFE500` face, 2px `#0A0A0A` border, borderRadius **4** (not pill — intentionally square-ish), padding 13px vertical.

### `app/write.tsx` — Write Screen

- PaddingTop 60, horizontal 20
- Prompt: `serifItalic`, 22px / 32, `color.paper`
- Privacy note: `sans`, 13px, centered, `palette.them`

### `app/read.tsx` — Onboarding Read

- Cards use `palettes[0]` (Voltage) and `palettes[3]` (Cyber)
- Premium promo: same neo-brutal shell (radius.input=14, 2px border, 4px shadow)
- CTA pill: `#FFE500` bg, `#0A0A0A` text

### `app/_layout.tsx` — Shell

- Sheet presentation: `formSheet`, 0.85 detent, cornerRadius 28, grabberVisible
- Plans sheet: `fitToContents`
- StatusBar: `light` in dark mode, `dark` in light mode

---

## Assets

Located at `assets/`:

| File | Description |
|---|---|
| `icon.png` | App Store / Play Store icon |
| `favicon.png` | Web favicon |
| `splash-blank.png` | Native splash background (`#0E0C13`) |
| `splash-icon.png` | Full quote-mark logo (combined) |
| `splash-quote-left.png` | Left quote glyph (41.1% of 220px ≈ 90px) |
| `splash-quote-right.png` | Right quote glyph (58.9% of 220px ≈ 130px) |
| `android-icon-foreground.png` | Android adaptive icon foreground |
| `android-icon-background.png` | Android adaptive icon bg (`#0E0B18`) |
| `android-icon-monochrome.png` | Monochrome layer for themed icons |
| `playstore-icon.png` | 512px Play Store listing icon |
