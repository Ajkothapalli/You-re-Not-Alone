# soulyap — Motion Language

**soulyap = soul + yap.** You come here to *let out* what's on your soul — and be answered
by someone who felt the same. Motion carries that arc: **the Release, then the Resonance.**
The verb is *yap* — a light, low-pressure doorway to a heavy truth; the payoff is
*"someone felt this too."* Motion is never decoration — it's the app **exhaling with you and
echoing back.**

Its feel is **calm, human, honest** — a light doorway to heavy things. This is the single
source of truth for how things move; it mirrors `theme/tokens.ts` and is gated everywhere by
`useReducedMotion()` (`lib/a11y.ts`).

---

## 0. The arc — the signature motion graphics

Motion tells soulyap's story in three beats. Everything else stays quiet chrome so these land.

1. **The Release** — *the hero moment; the yap.* On submit, the words you wrote **lift and
   dissolve upward** — a weight leaving your soul. Rise ~64px + fade to 0 + soft scale to 1.02
   with a faint blur, over `entrance` (600ms, `enter` easing); the composer exhales empty as a
   warm wash of light rises through it. Haptic: `impactAsync(Light)` at the instant of lift
   (the letting-go). Tone: **relief, not celebration** — no confetti, no bounce, no spring.
   A quiet exhale. This is the app's most important animation.
2. **The Travel** — *bridge, ≤ 2.5s.* Your words go "out into the dark to find their person."
   A single soft point of light **drifts outward and fades**, looping gently (`breath`,
   `breathe`) beside *"out there, finding its person,"* until the match resolves.
3. **The Resonance** — *the payoff.* Someone felt it. The matched words **arrive** (card
   `entrance`) and a **ripple** — two or three concentric soft rings — expands outward **once**
   from the felt-count, like your yap echoing inside another soul. The count **climbs**
   (`count`) and the heart **beats once** (`impactAsync(Medium)`). Tone: recognition —
   *"someone felt exactly this."* This is *"you're not alone,"* delivered as an **earned
   payoff**, never the opening pitch.

The **splash** (the two quote-marks breathing apart, then springing to **meet**) is the brand
signature — two souls, yapping, meeting.

> Build note: these are motion *graphics*, not just tweens. Implement the Release
> (lift + fade + blur + light wash) and the Resonance ripple with `react-native-reanimated`;
> the ripple as expanding `Circle`s (`react-native-svg`) or scaled views; the Travel dot as a
> drifting reanimated value. Native driver for transform/opacity; each stays within the token
> durations in §2. All three have reduced-motion fallbacks (§5).

---

## 1. Principles

1. **Breath, not bounce.** The resting state of the app is a slow exhale. Ease-out
   entrances, gentle settles. Springy overshoot is *rare* and *earned* — reserved for the
   splash "meeting" and the Resonance heartbeat (§0). **The Release is a soft exhale, never a
   spring** — relief should not bounce.
2. **Motion is acknowledgment.** Every animation means something: an arrival, a state
   change, a confirmation that you were heard. If it doesn't communicate, cut it.
3. **Stillness is sacred.** This is a space to exhale — never busy. **One primary motion
   per screen.** Chrome (tabs, headers) stays quiet so content can breathe.
4. **Arrive, don't announce.** Things ease *in* softly (rise + fade). Nothing slams,
   flashes, or bounces on entry, except the reserved peaks.
5. **Reduced-motion and crisis are first-class.** Both get calm, immediate states with no
   movement — see §5. These are not afterthoughts; they're part of the language.

---

## 2. Tokens

Centralize these in `theme/motion.ts` and import them — no more scattered magic numbers
(there are ~15 duration/spring literals across components today; replace them with these).

### Durations (ms)
| Token | ms | Use |
|---|---|---|
| `instant` | 0 | reduced-motion end-states |
| `press` | 80 | button press-in, taps |
| `quick` | 120 | tab cross-fade, micro state changes |
| `base` | 220 | default UI transitions, toggles |
| `gentle` | 320 | content reveal (rise + fade) |
| `screen` | 280 | stack push / sheet present |
| `entrance` | 600 | the tender card arrival (confession/match) |
| `count` | 1400 | felt-count count-up |
| `breath` | 900 | ambient loops (pulse, shimmer) — one cycle |

### Easings (React Native `Easing`)
| Token | RN | CSS mirror (website/store) | Use |
|---|---|---|---|
| `enter` | `Easing.out(Easing.cubic)` | `cubic-bezier(.16,1,.3,1)` | entrances, reveals, arrivals (the default) |
| `standard` | `Easing.out(Easing.quad)` | `cubic-bezier(.4,0,.2,1)` | most in-place transitions |
| `exit` | `Easing.in(Easing.quad)` | `cubic-bezier(.4,0,1,1)` | dismissals, things leaving |
| `breathe` | `Easing.inOut(Easing.sin)` | `ease-in-out` | ambient loops only |
| `linear` | `Easing.linear` | `linear` | shimmer / marquee only |

### Springs (reserved — the "alive" feeling)
| Token | RN (`Animated.spring`) | Reanimated approx | Use |
|---|---|---|---|
| `pressSpring` | `{ speed: 22, bounciness: 7 }` | `{ damping: 18, stiffness: 180 }` | button release |
| `pop` | `{ speed: 14, bounciness: 12 }` | `{ damping: 14, stiffness: 200 }` | mount pop (pills, badges) |
| `meeting` | `{ speed: 9, bounciness: 16 }` | `{ damping: 9, stiffness: 120 }` | the splash "meeting" — the one big overshoot |
| Emphasized CSS | — | `cubic-bezier(.34,1.56,.64,1)` | sticker stamps on the website |

**Heartbeat** (the felt-count "lub-dub") is a scripted timing sequence, not a spring:
`1.0 → 1.4 (100ms out) → 0.88 (80ms in) → 1.2 (90ms out) → 1.0 (150ms in)`.

### Distances & scales
- Rise: `rise.sm 8`, `rise.md 16`, `rise.lg 24` (translateY on entrance).
- Scale-in: `scale.card 0.97→1`, `scale.pop 0.8→1`.
- Press: `scale 0.97`, `opacity 0.9`.
- Stagger between siblings: `stagger 80` (tight 60 / loose 90).

---

## 3. Motion catalog (moment → spec)

| Moment | Motion | Tokens |
|---|---|---|
| **App launch / splash** | breathe apart → **meeting** (spring overshoot) → settle → wordmark → fade out. The one hero moment. | `meeting` spring, `breathe`, timed sequence |
| **Stack navigation** | slide from right | `screen` / OS default |
| **Sheets (settings, plans, categories)** | slide up (formSheet) | `screen`, `enter` |
| **Tab switch** | quick opacity cross-fade — **no slide** (tabs aren't travel) | `quick`, `standard` |
| **Content reveal** (mount / scroll-in) | rise `md` + fade, staggered | `gentle`, `enter`, `stagger 80` |
| **⟶ The Release (submit / yap)** *(hero, §0.1)* | words **lift + dissolve upward** + light wash; composer exhales empty; Light haptic on lift | `entrance`, `enter` |
| **The Travel** *(§0.2)* | soft light **drifts into the dark**, loops until match | `breath`, `breathe` |
| **⟶ The Resonance (match / payoff)** *(§0.3)* | card arrives → **ripple** out once + count-up + one heartbeat + Medium haptic → SR announce | `entrance`, `count` |
| **Confession card arrival** (read/explore) | scale `card` + rise + fade — the tender exhale | `entrance`, `enter` |
| **Button press** | scale `press` + opacity `press`; release on `pressSpring` | `press`, `pressSpring` |
| **Felt-count heart tap** | **heartbeat** lub-dub + medium haptic | heartbeat seq |
| **Dialog / toast** | scale `0.92→1` + fade | `base` (160ms), `standard` |
| **Loading (short, emotional)** | gentle breathing pulse (opacity `.6↔1`), **not** a spinning spinner | `breath`, `breathe` |
| **New notification item / unread dot** | soft fade + tiny rise; dot may slow-pulse (low priority) | `gentle`, `breath` |

**Motion budget:** at most **one** hero motion per screen. Everything else is chrome-quiet.

---

## 4. Haptics (`expo-haptics`) — paired, never gratuitous

| Event | Haptic |
|---|---|
| Felt / meaningful positive (heart, match) | `impactAsync(Medium)` |
| Selection (toggle, tab, character pick) | `selectionAsync()` |
| Submission succeeded (match returned) | `notificationAsync(Success)` |
| Error (rare, only real failures) | `notificationAsync(Error)` |
| **Crisis path** | **none** |

---

## 5. The two hard exceptions

**Reduced motion (`useReducedMotion()`):** every animated surface must fall back to its
**end state instantly** (`value.setValue(1)`) or a plain `base` opacity fade. No rise, no
spring, no pulse, no drift, no shimmer, no heartbeat. Gate *every* motion — this is not
optional and is asserted in the a11y test suite. The signature graphics degrade to:
Release → words fade out in place (no lift/blur/wash); Travel → static "finding your
match…" text (no drifting dot); Resonance → card fades in, count set to final, no ripple,
no heartbeat.

**Crisis screen = stillness (CLAUDE.md #6).** The crisis path is calm and immediate: a
plain fade in, nothing else. No entrance choreography, no pulse, no spring, no haptic, no
count-up, no celebration — ever. Motion that feels like delight is wrong here; the tone is
steady presence, not performance.

---

## 6. Implementation

- **Tokens live in `theme/motion.ts`** (lift the tables above into a typed object:
  `DURATION`, `EASING`, `SPRING`, `RISE`, `SCALE`, `STAGGER`). Components import these
  instead of inline numbers.
- **`useNativeDriver: true`** for all transform/opacity motion (that's everything here).
  Never animate layout or colour on these paths.
- **Gate with `useReducedMotion()`** at the top of every animated component; branch to the
  static end-state.
- **`react-native-reanimated` (v4)** for scroll-linked / worklet / gesture motion;
  the `Animated` API is fine for simple one-shots (as used in `CounterPill`, `ReadCard`,
  `AnimatedSplash` today).
- **Website parity:** the marketing site uses the CSS-mirror easings above so
  soulyap.me and the app move in the same language.

---

## 7. Do / Don't

**Do:** ease-out arrivals · restraint · one hero motion per screen · reduced-motion parity ·
haptics that mean something · durations that respect the reader's calm.

**Don't:** springy bounce everywhere · UI-chrome durations > ~320ms · any motion on the
crisis path · more than one primary motion at once · spinning spinners for emotional waits ·
parallax / cursor-tilt inside the app (website-only) · motion that draws attention to itself
instead of the words.

---

*Owner: design. Change this doc first, then the code — motion drift starts when components
invent their own numbers. Last updated 2026-08-01.*
