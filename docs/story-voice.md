# Story voice — how pool stories are written

Owner decision 2026-10-27: no model generates the pool on its own any more.
Stories are written by hand (by Claude, following this guide), checked, and
sent through `supabase/functions/ingest-stories`, which runs the crisis list
and moderation before anything is stored. 7 English + 7 Hinglish a day, one
per category each. Telugu is paused until a native speaker can review it.

The only test that matters: **would a reader believe a real person typed this
into their phone at night?** If a line could appear on a greeting card, a
poster, or in a therapist's handout, cut it.

## What makes it sound human

- **One concrete thing.** A cylinder that ran out, a green dot left on in
  Teams, a chashma on top of the TV, a contact still saved as "Papa". The
  feeling lives in the object; the story never names the feeling.
- **Indian everyday life**, without postcard clichés: PG rooms, the family
  WhatsApp group, EMIs, appraisal cycles, coaching, placements, tiffin,
  relatives asking about marriage, the gas agency, a temple visit with a
  parent, wedding-season mithai. Not porches, attics, Thanksgiving or Bible
  study unless the voice genuinely calls for it.
- **No lesson at the end.** Real confessions stop; they don't conclude. End
  on a fact or an action ("I said the AC."), not a realisation.
- **Vary everything across the day's batch:**
  - Voice: early 20s (lowercase, run-on, loose punctuation); 30s–40s (plain,
    dry, normal capitals); 50s+ (complete sentences, a little formal).
  - Length: one-liners of 20 words up to ~130 words. Mostly 40–90.
  - Shape: 1–3 short paragraphs. Never the same opening twice in a batch.
  - Gender: mix, and often leave it unstated.
- **Small imperfections are fine** — a run-on, a missing capital, a number
  written as a digit. Not deliberate typos.
- **Hinglish is typed, not translated.** The way people actually write on
  WhatsApp in Roman script: Hindi grammar, English nouns for modern things
  (office, laptop, meeting, EMI, status, call). No shuddh Hindi, no English
  sentence translated word for word.

## Banned

- Phrases: "I find myself", "I wonder if", "I realised", "it feels like",
  "no one tells you", "learn to live with", "the small things", "at the end
  of the day", "deep down", "a part of me", "journey", "healing".
- Naming the emotion as the point: lonely, heartbroken, empty, devastated.
- Names of people, specific cities or places, employers, brands of
  apps/companies that identify someone, links, handles, phone numbers.
- **Anything about wanting to die, suicide, self-harm, overdose** — even
  softened. The ingest function drops these; don't write them.
- Sexual content, anything involving minors in a harmful way, graphic
  violence or abuse detail.
- Copying or lightly rewording a story already in the pool (check the
  recent openings first).

## Categories

| id | what it covers |
|---|---|
| `mental_health` | anxiety, numbness, burnout, pretending to be fine |
| `relationships` | family, friends, partners, loneliness among people |
| `grief` | a person, a pet, a friendship, a version of yourself |
| `secrets` | things never said, small lies, quiet guilt |
| `work_identity` | jobs, studies, imposter feelings, the life you thought you'd have |
| `body_health` | illness, pain, body image, hiding how bad it is |
| `faith_meaning` | belief, doubt, rituals kept or lost, what it's all for |

## Honesty

- Stories are stored as `source = 'generated'` and start at **0 felts**.
  Only real readers' felts raise the count. Never invent a number.
- They never carry a `question_id` — answers to the weekly question are
  real people only.

## Sending them

`POST https://sjywjerlqxwfniwqjojs.supabase.co/functions/v1/ingest-stories`
with headers `Authorization: Bearer <anon key>`, `apikey: <anon key>`,
`x-story-secret: <STORY_INGEST_SECRET>` and body
`{ "stories": [{ "text", "category", "lang": "en" | "hi-Latn" }] }`.
`{ "action": "recent", "limit": 150 }` returns recent openings to avoid repeats.
