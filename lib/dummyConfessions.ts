/**
 * Dummy confessions — preview/seed data so every category has something to
 * read before the recommend-confessions Edge Function and a real pool exist.
 *
 * getRecommendations() falls back to these (filtered to the reader's
 * opted-in categories) when the function is unavailable or returns nothing.
 * Replace with the live pool at launch.
 */

import type { Recommendation } from './api';
import type { CategoryId } from './categories';

type Dummy = Recommendation & { categories: CategoryId[] };

export const DUMMY_CONFESSIONS: Dummy[] = [
  // ── Mental health ──
  { id: 'mh-1', feltCount: 1530, categories: ['mental_health'],
    text: "I have a group of friends, a job I'm good at, a family that loves me — and a loneliness that sits in the room with me like a second person. I don't understand how both can be true at once." },
  { id: 'mh-2', feltCount: 842, categories: ['mental_health'],
    text: "Some mornings the hardest part is deciding to put both feet on the floor. I do it anyway. Nobody claps. I've decided that's its own kind of brave." },
  { id: 'mh-3', feltCount: 671, categories: ['mental_health'],
    text: "I told my therapist I was 'a little stressed.' The truth is I haven't felt the ground under me in months. I don't know why it's easier to say it to strangers in the dark than to her." },
  { id: 'mh-4', feltCount: 489, categories: ['mental_health'],
    text: "The anxiety doesn't always have a reason. Sometimes it's just a hum under everything, and I've finally stopped demanding that it make sense before I'm allowed to rest." },

  // ── Relationships ──
  { id: 'rel-1', feltCount: 1120, categories: ['relationships'],
    text: "I still draft texts to people who made it clear they don't want to hear from me. I never send them. I just needed somewhere to put the words down." },
  { id: 'rel-2', feltCount: 905, categories: ['relationships'],
    text: "My mother and I love each other in a language neither of us speaks fluently. We mostly trade weather updates and hope the other one hears what we actually mean." },
  { id: 'rel-3', feltCount: 760, categories: ['relationships'],
    text: "I stayed three years too long because leaving felt like admitting the whole thing was a mistake. It was. I left. I'm okay now — I just wish I'd trusted myself sooner." },
  { id: 'rel-4', feltCount: 540, categories: ['relationships'],
    text: "We both say 'we should catch up' and we both know we won't. I miss him more than I'll ever tell anyone. I won't be the one to break first." },

  // ── Grief & loss ──
  { id: 'gr-1', feltCount: 1340, categories: ['grief'],
    text: "It's been two years and I still reach for my phone to call her. The muscle memory hasn't gotten the news yet. I almost don't want it to." },
  { id: 'gr-2', feltCount: 980, categories: ['grief'],
    text: "Grief isn't the wave they warned me about. It's the quiet after — realizing the world just kept going and somehow expects me to as well." },
  { id: 'gr-3', feltCount: 715, categories: ['grief'],
    text: "I'm mourning the version of my life I thought I'd have by now. There's no funeral for that one. No one brings food. But I'm grieving it all the same." },
  { id: 'gr-4', feltCount: 1102, categories: ['grief'],
    text: "My dad's voicemail still plays his voice. I call it when the house gets too quiet. I know I should let it go. I'm not ready, and I've stopped apologizing for that." },

  // ── Secrets & guilt ──
  { id: 'sec-1', feltCount: 829, categories: ['secrets'],
    text: "I'm not the good person people think I am. I'm just someone who got very, very good at being careful. Some nights the difference keeps me awake." },
  { id: 'sec-2', feltCount: 688, categories: ['secrets'],
    text: "I read a message I was never meant to see, and I've carried it alone for years. Telling anyone would only spread the hurt around. So I hold it by myself." },
  { id: 'sec-3', feltCount: 612, categories: ['secrets'],
    text: "I think about the person who didn't get the spot I took more than I'll ever admit out loud. My whole career grew out of one moment I'm not proud of." },
  { id: 'sec-4', feltCount: 533, categories: ['secrets'],
    text: "Everyone calls me the honest one. I built that reputation right on top of the single lie I've never undone." },

  // ── Work & identity ──
  { id: 'wk-1', feltCount: 1188, categories: ['work_identity'],
    text: "Everyone my age seems to be 'building something.' I'm just trying to get to Friday without anyone noticing how tired I am underneath the competence." },
  { id: 'wk-2', feltCount: 1015, categories: ['work_identity'],
    text: "I'm 34 and I still have no idea what I want to be. I've just gotten better at hiding that I'm guessing, the same as everyone else seems to be." },
  { id: 'wk-3', feltCount: 770, categories: ['work_identity'],
    text: "I got everything I said I wanted and felt nothing when it arrived. Now I'm scared I spent a decade wanting the wrong things, loudly, in front of everyone." },
  { id: 'wk-4', feltCount: 642, categories: ['work_identity'],
    text: "I'm good at my job and I quietly hate it, and saying that out loud would unravel a life I've already paid a lot to build." },

  // ── Body & health ──
  { id: 'bd-1', feltCount: 690, categories: ['body_health'],
    text: "I miss the body I used to take completely for granted. I was never grateful for it until it stopped cooperating, and now gratitude feels like something I owe it an apology for." },
  { id: 'bd-2', feltCount: 604, categories: ['body_health'],
    text: "Chronic pain turned me into a liar — 'I'm fine,' a hundred times a day, because the truth takes too long and helps no one and makes the room go quiet." },
  { id: 'bd-3', feltCount: 521, categories: ['body_health'],
    text: "The diagnosis didn't break me. It was everyone needing me to be inspiring about it that nearly did." },
  { id: 'bd-4', feltCount: 458, categories: ['body_health'],
    text: "I say I'm 'managing.' My body has been at war with me for years and I've run clean out of ways to describe it that don't frighten the people I love." },

  // ── Faith & meaning ──
  { id: 'fa-1', feltCount: 712, categories: ['faith_meaning'],
    text: "I want all of it to mean something — the losses, the small kindnesses, the waiting. Most days I quietly settle for it just being gentle, and call that enough." },
  { id: 'fa-2', feltCount: 567, categories: ['faith_meaning'],
    text: "I left the faith I was raised in and I feel free and unmoored in exactly equal measure. No one warns you that doubt can be just as lonely as belief." },
  { id: 'fa-3', feltCount: 432, categories: ['faith_meaning'],
    text: "I still pray to a God I'm no longer sure is listening, in words I learned before I knew how to question them. The habit has outlived the certainty, and I let it." },
  { id: 'fa-4', feltCount: 389, categories: ['faith_meaning'],
    text: "Some nights I look up and feel held by something vast and kind. Some nights it's just cold, empty space. I never know which one it's going to be." },
];

// Fisher–Yates, non-mutating
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function matchingPool(categories: string[]): Dummy[] {
  const chosen = new Set(categories);
  if (chosen.size === 0) return DUMMY_CONFESSIONS; // no prefs → everything
  return DUMMY_CONFESSIONS.filter((c) => c.categories.some((cat) => chosen.has(cat)));
}

/**
 * Preview recommendations filtered to the reader's chosen categories.
 * With no categories chosen, returns the full pool.
 */
export function getDummyRecommendations(categories: string[], limit = 10): Recommendation[] {
  return shuffle(matchingPool(categories)).slice(0, limit);
}

/** How many confessions match the reader's categories (preview count). */
export function getDummyMatchCount(categories: string[]): number {
  return matchingPool(categories).length;
}
