# soulyap — Character Motion (Behaviours)

**How the illustrated cast moves.** The drawings already exist (`docs/design/illustration.md`,
`components/illustrations/`). This doc adds movement to them — nothing here changes a single path.

It is the **source of truth for the numbers**: joints, keyframes, timing functions, periods.
Companions: `docs/design/motion.md` (the app's motion tokens and the Release → Travel → Resonance
arc), `docs/design/illustration.md` (the drawings), `CLAUDE.md` (invariants #2, #6).

**Live reference — open this first, it is what "correct" looks like:**
https://claude.ai/code/artifact/c224498c-c519-4205-b3b4-2c25251c4017

---

## 0. The five rules

Everything below is these five rules applied. If an animation feels robotic, it has broken one.

1. **Never one segment.** A limb always bends at a real joint: `shoulder → elbow → hand`,
   `hip → knee → ankle`. A straight stroke swinging from the shoulder is the puppet tell.
2. **No dead stops.** Pendulums get **three keyframes and a sine**. Shaped actions get a
   **timing function per segment** — ease-out going, ease-in landing — and hold only where a body
   would hold. Easing in *and* out of every intermediate pose is what makes motion mechanical.
3. **Overshoot and settle.** Every turn, reach and lift goes a little past its target and comes back.
4. **Overlap.** Children lag parents: hands lag forearms, forearms lag upper arms (80–120ms); eyes
   lead heads (~300ms). Amplitudes decay across a repeated action; they never repeat identically.
5. **Nobody stands dead.** The always-on layer (§2) runs underneath every behaviour, on its own
   clocks, so a figure between actions is still breathing.

Hard limits: squash/stretch ≤ 8% · one behaviour at a time per figure · a big action repeats no
faster than every 5s · no springs, no elastic, no spin, no snap.

---

## 1. The rig

Joint positions in the scene coordinate space (`viewBox 0 0 400 300`), matching the existing
illustration components:

| Joint | Front view | Profile (walk) |
|---|---|---|
| shoulder | (183,132) L · (217,132) R | (200,140) |
| elbow | (179,150) L · (222,150) R | (200,158) |
| hand (wrist) | (174,171) L · (229,171) R | (200,178) |
| hip | (193,178) L · (207,178) R | (200,184) |
| knee | (193,209) L · (207,209) R | (200,212) |
| ankle | y 240; foot `M186 243h12` / `M202 243h12` | y 240; foot `M197 243h14` |
| neck | (200,112)→(200,124) | (200,118)→(200,130) |
| head centre | (200,96) r16 | (198,104) r16 |

Segment lengths: upper arm 18 · forearm 18 · thigh 28–31 · shin 28–31.

**Nesting.** Each segment is its own `<G>` with an animated `rotation` and `origin` set to its joint
**in its own un-rotated local space** — the parent's transform carries it there. Never re-add the
parent's rotation to a child. Hands sit in a separate group at the wrist so they can lag the forearm.

**Depth.** In profile, the far arm and far leg use the darker shade of the same garment colour
(`#8AA1B5` for dusk, `#D07E69` for coral) and are drawn *behind* the torso.

---

## 2. The always-on layer

Runs under every behaviour, and alone when no behaviour is playing. Clocks are deliberately
co-prime-ish so nothing ever visibly syncs.

| Layer | Period | Motion |
|---|---|---|
| breathe (chest group only) | 5.2s / 6.1s | `scale(1.008, 1.02)` from the bottom centre. Legs never breathe. |
| nod (head group) | 7.0s / 7.6s | `translateY −1.2px`, `rotate 0.8°` from the neck |
| blink (eyes) | 6.1s | `scaleY 1 → 0.08 → 1` inside the last 9% of the cycle |
| sympathetic sway (non-acting arm) | 8.3s | upper arm `±2.4°` from the shoulder; forearm `+4° → −3°`, offset −7.9s |

A second figure in the same scene takes the alternate period (6.1s / 7.6s) with a negative delay so
it is never in phase with the first. Easing: `Easing.inOut(Easing.sin)` throughout.

---

## 3. The behaviours

Notation: `t%` of the cycle → rotation in degrees unless stated.

### 3.1 A stroll — walk · 1.4s · profile

| Part | Keyframes | Easing |
|---|---|---|
| thigh | 0% −28 · 50% +24 · 100% −28 | sine (pendulum) |
| shin | 0% 3 · 36% 0 · 52% 18 · 76% 62 · 100% 3 | ease-in-out |
| foot (ankle) | 0% −7 · 20% 0 · 56% 15 · 80% 11 · 100% −7 | ease-in-out |
| upper arm | 0% 24 · 50% −24 · 100% 24 | sine (pendulum) |
| forearm | 0% 7 · 50% 27 · 100% 7 | sine, **delay ~+0.1s** |
| torso lean (pivot hip) | 0% −1 · 50% +1 · 100% −1 | sine |
| upper-body bob | 0.7s: `translateY 0 → −3px → 0` | sine |
| head counter-bob | 0.7s: `translateY 0 → +1.1px → 0`, delay −0.07s | sine |

- Opposite leg and far arm: identical clocks at **delay −0.7s** (half cycle).
- The figure carries a static `rotate(4°)` about the hip.
- **Feet stay planted.** Only the upper body bobs — bobbing the whole figure lifts the planted foot
  off the ground and turns the walk into a hover.
- The character does **not** translate; the world moves. Ground dashes `stroke-dashoffset 30` per
  0.7s; scenery `translateX −700px` per 16s. **These two speeds must match** or the feet slide.

### 3.2 A small hop — 6.4s · front · marketing/website only

Body, with the timing function that **leaves** each stop:

| t | transform | timing function out |
|---|---|---|
| 0–40% | 0, `scale(1,1)` | `cubic-bezier(.4,0,.7,.4)` |
| 47% | `+2px`, `scale(1.06,.93)` — crouch | `cubic-bezier(.15,.75,.35,1)` |
| 53% | `−27px`, `scale(.97,1.05)` | `cubic-bezier(.35,0,.75,.6)` |
| 56.5% | `−30px`, `scale(1,1)` — apex | `cubic-bezier(.55,0,.9,.35)` |
| 62% | `0`, `scale(1.07,.91)` — landing squash | `cubic-bezier(.2,.8,.4,1)` |
| 67% | `0`, `scale(.985,1.025)` | ease-in-out |
| 72% | `0`, `scale(1.008,.996)` | ease-in-out |
| 78–100% | `0`, `scale(1,1)` | — |

- **thigh** `scaleY` (origin hip): 1 · 47% .9 · 53–56.5% .9 · 62% .88 · 68% 1.02 · 73% 1
- **shin** `scaleY` (origin knee): 1 · 47% .86 · 53% **.6** · 56.5% .62 · 62% .85 · 68% 1.03 · 73% 1
  — the shins fold *under* the thighs in the air. Do **not** scale the whole leg; that reads as a
  telescope. (A front view can't show a knee bend in perspective, so the fold is a vertical scale
  from the knee — the standard cartoon cheat.)
- **shadow**: `scale 1 → .74`, `opacity .09 → .045` while airborne (45%→62%)
- **arms** (L): 42% 0 · 47% 10 · 54% 42 · 58% 36 · 63% 44 · 70% −5 · 78% 0. R mirrored.
- **forearms** (L): 43% 0 · 49% 14 · 56% 24 · 64% −14 · 72% 4 · 80% 0, **delay +0.08s**. R mirrored.
- **head** (translateY, rotate): 47% +1.6px · 53% +3px, −1.4° · 57% +.5px · 62% −2.4px, +0.8° ·
  67% +1.2px · 72% −0.4px · 78% 0 — the head lags the body up and overshoots on the landing.

Height capped at 30px, squash at 8%. If it ever feels too bright for the brand, cut the height to
22px before touching anything else.

### 3.3 Yapping — talk · 4.2s · front

- **Mouth**: four drawn shapes — closed curve, small circle, open ellipse, wide curve — cycled over
  12 equal slots with discrete steps. **Never tween a mouth**; lip shapes snap.
- **Gesture upper arm**: 0/4% 0 · 13% −40 · 17% −34 · 33% −18 · 38% −23 · 52% −47 · 56% −41 ·
  70% −11 · 74% −16 · 88% −2 · 100% 0 — every reach overshoots and eases back.
- **Gesture forearm**: same shape at ~60% amplitude, **delay +0.11s** — 14% −24 · 19% −14 · 34% −6 ·
  39% −13 · 53% −28 · 58% −18 · 71% −2 · 76% −9 · 89% −1 · 100% 0. This is what makes the hand whip.
- **Brows**: 13% −1.9px → 17% −1.4px, again at 53% / 57% — lift on the emphasised words only.
- **Head**: on a **6.3s** clock (deliberately not a multiple of 4.2s, so the loop never lines up) —
  9% −2° · 18% −1° · 30% +2.4° · 38% +1.6° · 52% −1.2° · 64% +2° · 77% +0.4° · 88% −2.2°.
- **Scrap** (the yellow confession): fades in at the mouth 18→26%, drifts to `(+38,−46) rotate 8°`
  by 70%, gone by 82%.
- Resting arm runs the §2 sympathetic sway.

### 3.4 Hello — wave · 5.6s · front · first launch only

- **Upper arm** raised, shoulder (217,132) → elbow (236,112): 22% 0 · 27% −5 [anticipation dip] ·
  33–63% −3 · 72% 0.
- **Forearm** from the elbow — amplitude **decays**: 25% 0 · 28% −7 · 33% +26 · 39% −22 · 45% +19 ·
  51% −14 · 57% +9 · 63% −4 · 69% 0. A fixed amplitude is a metronome; the decay is the whole point.
- **Hand** from the wrist (240,88): same pattern at ~45% amplitude, **delay +0.09s**.
- **Head**: 30% +3.6° · 40% +3° · hold · 74% 0 — starts a beat *before* the arm.
- Other arm runs the §2 sympathetic sway.

### 3.5 Just being — idle · 14s · front · the default

Sequence: rest → glance left → glance right → shift weight → scratch → settle.

- **Eyes** (lead the head by ~2% ≈ 300ms): 19% −3.4px · 22–30% −3px · 33% +3.4px · 36–44% +3px · 47% 0
- **Head**: 21% −4.8° · 24–31% −4° · 35% +4.8° · 38–45% +4° · [weight shift] · 65% +4.6° ·
  68–76% +4° · 80% −0.6° · 83% 0 — every turn overshoots then settles.
- **Chest weight shift**: 47.5% `translateX −1.5px`, −0.5° [anticipation] · 51% `+4.6px`, +1.8° ·
  53–56% `+4px`, +1.5° · 60% `−0.6px`, −0.2° · 62% 0
- **Scratch upper arm** (carries the weight shift first): 61.5% +8 [anticipation] · 64.5% −156 ·
  66.5% −150 · hold to 77% · 80.5% −6 · 82.5% +4 · 85% 0
- **Scratch forearm**, **delay +0.1s**: 64.5% −41 · then −33 · −40 · −31 · −39 · −32 · −38 · −34 ·
  77% −35 · 80.5% −6 · 82.5% +3 · 85% 0 — a **decaying** wiggle, living in the forearm, not the whole
  arm. Upper −150 with forearm −35 puts the hand at the temple the way an arm actually gets there;
  a single straight arm swinging to −160 does not.

---

## 4. The energy ladder — where each behaviour is allowed

| Rung | Behaviour | Allowed on |
|---|---|---|
| 1 | **Just being** | Anywhere a standing figure appears. The default. |
| 2 | **Hello** | First launch and the onboarding welcome. One wave, then idle. |
| 3 | **Yapping** | The onboarding "say what's in your soul" step; the write empty state. |
| 4 | **A stroll** | Between onboarding steps; marketing and the website. |
| 5 | **A small hop** | **Marketing and the website only.** Never inside the app, never near a heavy confession, never on the crisis path. |

**Never, at any rung:** the crisis path (CLAUDE.md #6 — no illustration, no motion, plain fade only),
read and write confession cards (text-first, the words are the hero), the live submit moment or the
live match moment (they already own their one hero motion in `motion.md`), and The Travel (a drifting
light, not a drawing).

**Seated scenes keep the §2 layer only.** `EmptyBench` and `NotificationsEmpty` are seated poses —
they breathe, nod and blink, and take no behaviour from §3.

---

## 5. Reduced motion — the behaviour stills

`useReducedMotion()` stops every clock and holds a **posed** frame, never a paused one:

| Behaviour | Still |
|---|---|
| stroll | mid-stride — front leg thigh −20 / shin 2, back leg thigh +18 / shin +34; near arm +18 / forearm +12; far arm −18 / forearm +22 |
| hop | standing at rest, legs straight, arms down |
| yapping | mouth open (shape 2), gesture arm −30 / forearm −16, scrap held at `(+24,−30) rotate 6°` |
| hello | arm raised, forearm at +14° |
| just being | neutral rest, arms down |

With reduced motion on, **no shared values are created at all** — render the static pose and return.

---

## 6. Implementation (reanimated 4, react-native-svg)

- **Pendulums** (thighs, arms, lean, bob, sway):
  `withRepeat(withTiming(to, { duration, easing: Easing.inOut(Easing.sin) }), -1, true)` —
  two endpoints, mirrored. Nothing else. Adding intermediate stops here is what caused v1's stutter.
- **Shaped actions** (hop, gesture, scratch, wave, the idle sequence):
  `withRepeat(withSequence(withTiming(v1, { duration: d1, easing: e1 }), withTiming(v2, { duration: d2, easing: e2 }), …), -1)`
  — one easing **per segment**, from the tables above. Convert `cubic-bezier(a,b,c,d)` with
  `Easing.bezier(a,b,c,d)`; each duration is `(t₂% − t₁%) × period`.
- **Lag** on a child segment: `withDelay(100, …)` (80–120ms), or a negative phase offset on a loop.
- **Out of phase**: start each always-on clock with a negative delay so two figures never sync.
- **Discrete mouth**: drive an index shared value with `withSequence` of zero-duration steps (or a
  `useDerivedValue` off a linear clock) and swap opacity 0/1 — never interpolate between shapes.
- **Structure**: `components/illustrations/behaviours/` — `useWalk`, `useHop`, `useTalk`, `useWave`,
  `useIdle`, each returning animated props for the named joints, plus `useIdleLayer` for §2.
  The behaviour hooks read the joint constants from `theme/illustration.ts`; add a `JOINTS` and
  `BEHAVIOUR` block there rather than inlining numbers in components.
- **Cost**: gate every behaviour on `useReducedMotion()` **and** `useIsFocused()`. A figure that is
  off-screen or on an unfocused tab runs nothing. Transform/opacity only, UI thread only, no filters.
- **Never**: springs, `Easing.elastic`, rotation > 360, squash > 8%, two behaviours on one figure, or
  any behaviour on the crisis path.
- **No haptics.** Illustration is silent; haptics belong to the real interaction moments in
  `motion.md`.

---

## 7. Build brief

1. **`theme/illustration.ts`** — add `JOINTS` (§1) and `BEHAVIOUR` (periods, delays) blocks.
2. **Rig the primitives** — extend the existing limb primitives to two segments: `Arm`
   (upper + forearm + hand at the wrist) and `Leg` (thigh + shin + foot at the ankle), each segment
   an animated `<G>` with `origin` at its joint. Existing scenes keep rendering identically when no
   behaviour is applied.
3. **`components/illustrations/behaviours/`** — `useIdleLayer` (§2) and the five behaviour hooks (§3).
4. **Mount**, per the ladder (§4):
   - `useIdleLayer` under every standing figure, and under the existing seated scenes.
   - **Hello** on first launch / onboarding welcome.
   - **Yapping** on the onboarding "say what's in your soul" step and the write empty state.
   - **A stroll** between onboarding steps.
   - **A small hop**: build it, export it, but do **not** mount it in any app screen — website and
     marketing only.
5. **Reduced-motion stills** (§5) for all five, creating no shared values.
6. **Off-focus**: cancel every behaviour loop when the screen loses focus.
7. Do not touch the crisis path, read/write cards, the submit moment, the match moment, or The Travel.

---

## 8. Testing & Verification

Unit / integration (jest-expo):
- **Rig**: every animated arm and leg renders as two segments — assert no animated limb is a single
  path, and each segment's `origin` equals its `JOINTS` entry.
- **Lag**: each forearm/hand animation carries a delay of 80–120ms relative to its parent segment.
- **Pendulums**: thigh, upper arm, lean, bob and sway animations each have exactly two endpoints and
  a sine easing (no intermediate keyframes).
- **Walk**: ground-dash speed and scenery speed resolve to the same px/sec (assert the ratio); the
  planted foot's y never rises above the ground line across a sampled cycle.
- **Hop**: peak `translateY` ≤ 30px; max scale deviation ≤ 8%; shin `scaleY` ≤ .65 at apex.
- **Talk**: the mouth uses discrete steps with no interpolated frames between shapes; the head period
  is not a whole-number multiple of the mouth period.
- **Wave**: successive forearm amplitudes strictly decrease (26 → 22 → 19 → 14 → 9 → 4).
- **Idle**: the eye keyframe leads the corresponding head keyframe by 250–350ms.
- **Ladder**: the hop component is not imported by any app screen; no behaviour component appears on
  the crisis path, read/write cards, the submit screen, or the match screen. Seated scenes
  (`EmptyBench`, `NotificationsEmpty`) mount `useIdleLayer` only, no §3 behaviour.
- **Reduced motion**: each behaviour renders its §5 still and creates zero shared values.
- **Off-focus**: all behaviour loops are cancelled when the screen loses focus and resume on focus.
- **No haptics** are fired by any illustration component.

Manual smoke (light & dark, iOS + a low-end Android), against the live reference:
- Stroll: the knee folds deeply on the swing-through, the ankle flexes at heel-strike, the elbow
  bends with the forearm trailing, and the planted foot does not slide or lift.
- Hop: crouch → launch → shins tuck under → soft landing → settle. Reads gentle, not bouncy.
- Yapping: the mouth snaps between shapes; the gesture drives from the elbow with the hand whipping
  after it; the resting arm sways.
- Hello: the wave decays rather than ticking; the head starts before the arm.
- Just being: eyes lead the head on each glance; the weight shift has a lean-back before it; the
  scratch folds at the elbow with a decaying wiggle.
- Nothing stops dead at a pose; no two figures in one scene are ever in phase.
- Reduced motion on: every figure holds a posed still, not a frozen mid-action frame.
- 60fps with two animated figures mounted; loops stop on tab switch.

Report the jest run output; fix any failing case before marking done.

---

*Owner: design. Change this doc first, then the code. It owns the behaviour numbers;
`docs/design/illustration.md` owns the drawings, `docs/design/motion.md` owns the app's own motion.
Last updated 2026-09-10.*
