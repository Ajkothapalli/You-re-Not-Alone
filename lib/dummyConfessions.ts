/**
 * Seed confessions — ~20 per category so every category has a rich pool to read
 * before a real corpus exists (cold-start / network-effect bootstrap).
 *
 * Voice: deliberately written to feel like real, different people wrote them —
 * late-teens/20s skew casual + lowercase + occasional emoji; 30s–40s more
 * reflective; 50s+ measured and clean. Emojis appear in roughly a third.
 *
 * getRecommendations() falls back to these (filtered to the reader's opted-in
 * categories) when the recommend-confessions Edge Function is unavailable or
 * returns nothing. Hand-written, safe, never crisis-adjacent.
 *
 * This list is the single source of truth for the static fallback pool. The
 * daily auto-push job (5/category/day, is_seed=true) seeds the DB MATCH pool —
 * see the automation prompt. Replace with the live pool as real submissions grow.
 */

import type { Recommendation } from './api';
import type { CategoryId } from './categories';

// `rich` marks the multi-paragraph, story-shaped entries. Readers inside
// their first 7 days see ONLY these — a one-liner is a poor first impression
// of what this place is for.
type Dummy = Recommendation & { categories: CategoryId[]; rich?: boolean };

export const DUMMY_CONFESSIONS: Dummy[] = [
  // ─────────────────────────── Mental health ───────────────────────────
  { id: 'mh-1', feltCount: 1530, categories: ['mental_health'],
    text: "I have friends, a job I'm good at, a family that loves me — and a loneliness that sits in the room with me like another person. I don't understand how both can be true." },
  { id: 'mh-2', feltCount: 842, categories: ['mental_health'],
    text: "some mornings the hardest thing i do all day is put both feet on the floor. nobody claps for that one. i've decided it counts anyway." },
  { id: 'mh-3', feltCount: 671, categories: ['mental_health'],
    text: "told my therapist i was 'a little stressed' lol. truth is i haven't felt the floor under me in months 🙃 idk why it's easier to type it to strangers than say it to her." },
  { id: 'mh-4', feltCount: 489, categories: ['mental_health'],
    text: "the anxiety doesn't always have a reason. some days it's just a hum under everything and i've stopped waiting for it to make sense before i let myself rest." },
  { id: 'mh-5', feltCount: 1290, categories: ['mental_health'],
    text: "Functioning and okay are not the same thing. I've gotten very good at the first one, so no one thinks to check on the second." },
  { id: 'mh-6', feltCount: 1140, categories: ['mental_health'],
    text: "everyone thinks i'm the happy one 😭 i'm literally typing this from a bathroom at a party i wanted to leave an hour ago" },
  { id: 'mh-7', feltCount: 980, categories: ['mental_health'],
    text: "i keep waiting to feel something again. the bad days i get. it's the gray nothing days that actually scare me 🥲" },
  { id: 'mh-8', feltCount: 915, categories: ['mental_health'],
    text: "my brain at 3am: here's every embarrassing thing you've done since 2014 in 4k 💀 by morning i've grieved stuff that never even happened" },
  { id: 'mh-9', feltCount: 870, categories: ['mental_health'],
    text: "i'm not sad exactly. just tired in a way that sleep doesn't fix." },
  { id: 'mh-10', feltCount: 760, categories: ['mental_health'],
    text: "answered an email today i'd been scared of for two weeks. to anyone else it's nothing. to me it was the whole day 😮‍💨" },
  { id: 'mh-11', feltCount: 705, categories: ['mental_health'],
    text: "Everyone keeps asking what's wrong and the honest answer is I don't know — and not knowing makes me feel I've no right to feel this heavy." },
  { id: 'mh-12', feltCount: 660, categories: ['mental_health'],
    text: "had a full panic attack in the cereal aisle and still said 'i'm good, thanks' at checkout 😅 nobody knew. they never do" },
  { id: 'mh-13', feltCount: 615, categories: ['mental_health'],
    text: "i nod along in meetings while a whole second conversation runs in my head asking if i'm actually okay." },
  { id: 'mh-14', feltCount: 580, categories: ['mental_health'],
    text: "i had to literally put 'rest' in my calendar like a meeting, otherwise i won't let myself have it without feeling guilty about it." },
  { id: 'mh-15', feltCount: 545, categories: ['mental_health'],
    text: "starting the meds didn't feel like giving up. it felt like finally putting down something i was told i should've been strong enough to carry." },
  { id: 'mh-16', feltCount: 510, categories: ['mental_health'],
    text: "i wake up already behind. already bracing. would give anything for ONE morning that doesn't feel like a threat fr 😔" },
  { id: 'mh-17', feltCount: 470, categories: ['mental_health'],
    text: "reread a text i sent like 11 times looking for the disaster in it 😭 there was no disaster. there never is. my brain charges me for the search anyway" },
  { id: 'mh-18', feltCount: 1015, categories: ['mental_health'],
    text: "Everyone my age seems to have a map. I've just been walking and hoping the ground keeps showing up under my feet." },
  { id: 'mh-19', feltCount: 1455, categories: ['mental_health'],
    text: "the first time someone said 'me too' and actually meant it, i cried in a way i didn't expect. didn't realise how long i'd been holding my breath ❤️" },
  { id: 'mh-20', feltCount: 430, categories: ['mental_health'],
    text: "Lately the sadness comes less often and stays a shorter while. I've almost been afraid to say it out loud in case I jinx it. So I'll say it here: I think I'm getting better." },

  // ─────────────────────────── Relationships ───────────────────────────
  { id: 'rel-1', feltCount: 1120, categories: ['relationships'],
    text: "i still draft texts to people who made it clear they don't want to hear from me. never send them. just needed somewhere to put the words 🥲" },
  { id: 'rel-2', feltCount: 905, categories: ['relationships'],
    text: "My mother and I love each other in a language neither of us speaks well. We trade weather updates and hope the other one hears what we actually mean." },
  { id: 'rel-3', feltCount: 760, categories: ['relationships'],
    text: "stayed 3 years too long because leaving felt like admitting the whole thing was a mistake. it was. i left. i'm okay now, just wish i'd trusted myself sooner." },
  { id: 'rel-4', feltCount: 540, categories: ['relationships'],
    text: "we both say 'we should catch up' and we both know we won't 😅 i miss him more than i'll ever say. not gonna be the one to break first." },
  { id: 'rel-5', feltCount: 1080, categories: ['relationships'],
    text: "i love my partner AND i sometimes miss being no one's — accountable to nothing but my own evening. doesn't make the love less real." },
  { id: 'rel-6', feltCount: 990, categories: ['relationships'],
    text: "my best friend and i didn't even fight. we just stopped texting back one day 🥲 i miss her like a season that isn't coming back" },
  { id: 'rel-7', feltCount: 880, categories: ['relationships'],
    text: "i keep my dad at arm's length and wait for him to fight for the closeness i won't offer. neither of us moves. we're both too stubborn — it might outlast us." },
  { id: 'rel-8', feltCount: 820, categories: ['relationships'],
    text: "said 'i'm fine with whatever you want' so many times i forgot what i actually wanted. now i'm mad at them for not asking harder, which isn't even fair." },
  { id: 'rel-9', feltCount: 1340, categories: ['relationships'],
    text: "My mum and I only really talk through food. 'Did you eat?' is the closest she gets to 'I love you.' After years of being annoyed by it, I finally hear it now." },
  { id: 'rel-10', feltCount: 700, categories: ['relationships'],
    text: "we text 'miss u' and never make a plan 💀 i think we both like the warm feeling more than the effort. i'm guilty of it too." },
  { id: 'rel-11', feltCount: 660, categories: ['relationships'],
    text: "my parents are getting older and i can feel the roles slowly flipping, and nobody warned me how tender and terrifying that is at the same time." },
  { id: 'rel-12', feltCount: 1210, categories: ['relationships'],
    text: "I forgave them out loud and I'm still angry in private. Forgiveness isn't a switch. It's something I have to choose again most mornings." },
  { id: 'rel-13', feltCount: 590, categories: ['relationships'],
    text: "i'm the friend everyone calls when it's bad and nobody calls when it's good 😮‍💨 i love them. i'm just tired of being a hotline." },
  { id: 'rel-14', feltCount: 560, categories: ['relationships'],
    text: "married my best friend and some weeks we're more like roommates, and saying that feels like betrayal even though everyone says it's normal." },
  { id: 'rel-15', feltCount: 520, categories: ['relationships'],
    text: "still have ONE photo of an ex 🙃 not because i miss him, just proof i was loved like that once. can't make myself delete the evidence." },
  { id: 'rel-16', feltCount: 900, categories: ['relationships'],
    text: "The friendship ended with no fight, no closure — just an absence where a person used to be. I grieve it like a death no one else even noticed." },
  { id: 'rel-17', feltCount: 480, categories: ['relationships'],
    text: "apologised first even though i was right, because being close mattered more than being correct. still don't know if that was weakness or grace." },
  { id: 'rel-18', feltCount: 450, categories: ['relationships'],
    text: "I have hundreds of contacts and maybe three people I could call at 2am. I don't know when the circle got so small, or if that's just growing up." },
  { id: 'rel-19', feltCount: 415, categories: ['relationships'],
    text: "falling out of love was so quiet. no villain, no big fight. we just slowly became strangers who knew each other's coffee order 🥲" },
  { id: 'rel-20', feltCount: 395, categories: ['relationships'],
    text: "told him i loved him first and he said 'thank you' 💀 i've replayed that pause a hundred times. would still say it again. probably." },

  // ─────────────────────────── Grief & loss ───────────────────────────
  { id: 'gr-1', feltCount: 1340, categories: ['grief'],
    text: "two years and i still reach for my phone to call her. the muscle memory hasn't gotten the news yet. i almost don't want it to 🥲" },
  { id: 'gr-2', feltCount: 980, categories: ['grief'],
    text: "Grief isn't the wave they warned me about. It's the quiet after — realising the world just kept moving and somehow expects me to as well." },
  { id: 'gr-3', feltCount: 715, categories: ['grief'],
    text: "i'm mourning the life i thought i'd have by now. there's no funeral for that one. nobody brings food. but i'm grieving it all the same." },
  { id: 'gr-4', feltCount: 1102, categories: ['grief'],
    text: "my dad's voicemail still plays his voice. i call it when the house gets too quiet 😭 i know i should let it go. i'm not ready, and i've stopped apologising for that." },
  { id: 'gr-5', feltCount: 1180, categories: ['grief'],
    text: "everyone stopped checking in around month three, right when it actually got hard. the casseroles run out way before the grief does." },
  { id: 'gr-6', feltCount: 920, categories: ['grief'],
    text: "laughed at a joke today and then felt guilty, like joy was a betrayal 🥲 slowly learning it isn't. they'd have wanted the laugh." },
  { id: 'gr-7', feltCount: 860, categories: ['grief'],
    text: "lost my best friend and i'm not 'family,' so i grieved on the edges of it. no role, no casserole, nobody asking if i was okay 💔" },
  { id: 'gr-8', feltCount: 800, categories: ['grief'],
    text: "Grief ambushes me in the most ordinary places — a song in a waiting room, the cereal aisle. It just sits down beside me and takes my hand." },
  { id: 'gr-9', feltCount: 760, categories: ['grief'],
    text: "we lost the pregnancy and the world acted like there was nothing there to lose. but i'd already named the whole future. mourning a person only i ever met 🥲" },
  { id: 'gr-10', feltCount: 1260, categories: ['grief'],
    text: "i keep her number in my phone. i know what it is. i just can't be the one to make her finally gone from the last place she still 'exists.'" },
  { id: 'gr-11', feltCount: 720, categories: ['grief'],
    text: "my grief doesn't look like the movies. some days it's just irritable and exhausted and bad at texting back. that's grieving too, i've decided." },
  { id: 'gr-12', feltCount: 680, categories: ['grief'],
    text: "grieving someone who's still alive — the parent dementia is slowly taking. i miss them while feeding them lunch. nobody makes a card for that." },
  { id: 'gr-13', feltCount: 640, categories: ['grief'],
    text: "The hardest part wasn't the funeral. It was the first time I had good news and reached for the phone to tell the one person who'd have been proudest." },
  { id: 'gr-14', feltCount: 600, categories: ['grief'],
    text: "people keep saying 'at least' — at least it was quick, at least you had time. i know they mean well. there's no 'at least' that fits in this hole." },
  { id: 'gr-15', feltCount: 560, categories: ['grief'],
    text: "I divorced and grieved a living person, a whole imagined future, and a version of myself. Grief isn't only for the dead. Nobody warns you." },
  { id: 'gr-16', feltCount: 1090, categories: ['grief'],
    text: "it's the small things that wreck me — his handwriting on an old list, her perfume on a scarf. the big days i brace for. the small ones ambush me 🥲" },
  { id: 'gr-17', feltCount: 520, categories: ['grief'],
    text: "a year out i can finally say her name without my voice breaking, and somehow THAT feels like its own little loss too." },
  { id: 'gr-18', feltCount: 480, categories: ['grief'],
    text: "I never got to say the last thing. I rehearse it into the quiet sometimes, just so it exists somewhere outside my chest." },
  { id: 'gr-19', feltCount: 880, categories: ['grief'],
    text: "some nights i talk to him out loud in the empty kitchen. i don't think he hears me. i do it anyway. closest thing to enough i've found." },
  { id: 'gr-20', feltCount: 440, categories: ['grief'],
    text: "Everyone said it gets easier. It didn't get easier — I got stronger. There's a difference, and I wish someone had told me which one to expect." },

  // ─────────────────────────── Secrets & guilt ───────────────────────────
  { id: 'sec-1', feltCount: 829, categories: ['secrets'],
    text: "I'm not the good person people think I am. I'm just someone who got very good at being careful. Some nights the difference keeps me awake." },
  { id: 'sec-2', feltCount: 688, categories: ['secrets'],
    text: "i read a message i was never meant to see, and i've carried it alone for years. telling anyone would just spread the hurt around. so i hold it by myself." },
  { id: 'sec-3', feltCount: 612, categories: ['secrets'],
    text: "i think about the person who didn't get the spot i took more than i'll ever admit 😶 my whole career grew out of one moment i'm not proud of." },
  { id: 'sec-4', feltCount: 533, categories: ['secrets'],
    text: "Everyone calls me the honest one. I built that reputation right on top of the single lie I've never undone." },
  { id: 'sec-5', feltCount: 1130, categories: ['secrets'],
    text: "everyone thinks i'm so generous. truth is i give because i'm terrified of what people would see if i ever stopped performing kindness." },
  { id: 'sec-6', feltCount: 940, categories: ['secrets'],
    text: "been pretending to love a life everyone congratulated me into 🙃 the hardest secret to keep is the one where you're the one being fooled." },
  { id: 'sec-7', feltCount: 870, categories: ['secrets'],
    text: "let a friend take the blame for something i did years ago. they never found out. they still wave when they see me. it costs me something every time." },
  { id: 'sec-8', feltCount: 1050, categories: ['secrets'],
    text: "i act SO confident and then google how to do basic parts of my job in the work bathroom between meetings 💀 the impostor never clocks out." },
  { id: 'sec-9', feltCount: 740, categories: ['secrets'],
    text: "I'm relieved an obligation is finally over and I'm not allowed to say it out loud — so I'll say it here: I loved them, and I'm also free now, and both are true." },
  { id: 'sec-10', feltCount: 700, categories: ['secrets'],
    text: "i smile and say 'no worries' and keep a quiet little ledger of every time i got let down. not proud of the ledger. can't seem to close it either." },
  { id: 'sec-11', feltCount: 660, categories: ['secrets'],
    text: "cheated on ONE exam 15 years ago and somehow it's the thing my brain hands me at 3am, ahead of all my actual sins 😭" },
  { id: 'sec-12', feltCount: 620, categories: ['secrets'],
    text: "i pretend i'm over it. i'm not over it. 'i'm over it' is just the sentence that makes everyone finally stop asking." },
  { id: 'sec-13', feltCount: 900, categories: ['secrets'],
    text: "told one lie to protect someone, then ten more to protect the first one. by the end i couldn't tell where the kindness stopped and the cowardice started." },
  { id: 'sec-14', feltCount: 560, categories: ['secrets'],
    text: "there's a version of me my family has never met. i love them too much, or fear them too much, to ever introduce them 🥲" },
  { id: 'sec-15', feltCount: 520, categories: ['secrets'],
    text: "gave money i couldn't spare to look like the person i want to be, and then quietly went without. pride is the most expensive thing i own." },
  { id: 'sec-16', feltCount: 500, categories: ['secrets'],
    text: "I've kept a secret so long it's stopped feeling like a thing that happened and started feeling like a room I live in." },
  { id: 'sec-17', feltCount: 470, categories: ['secrets'],
    text: "i'm jealous of my closest friend and i HATE that about myself 😶 so i cheer the loudest and ache the quietest." },
  { id: 'sec-18', feltCount: 450, categories: ['secrets'],
    text: "I'm not haunted half as much by what I did as by who I had to become to keep it hidden." },
  { id: 'sec-19', feltCount: 430, categories: ['secrets'],
    text: "finally told someone the thing i'd carried for a decade and the ceiling didn't fall in 😮‍💨 i just sat there lighter, wondering why i waited so long." },
  { id: 'sec-20', feltCount: 410, categories: ['secrets'],
    text: "i apologise for existing constantly and then hoard the one apology i actually owe, because saying it out loud would make it real." },

  // ─────────────────────────── Work & identity ───────────────────────────
  { id: 'wk-1', feltCount: 1188, categories: ['work_identity'],
    text: "everyone my age is 'building something.' i'm just trying to get to friday without anyone noticing how tired i am under all the competence." },
  { id: 'wk-2', feltCount: 1015, categories: ['work_identity'],
    text: "i'm 34 and STILL have no idea what i want to be 😅 just got better at hiding that i'm guessing, same as everyone else seems to be." },
  { id: 'wk-3', feltCount: 770, categories: ['work_identity'],
    text: "got everything i said i wanted and felt nothing when it arrived. now i'm scared i spent a decade wanting the wrong things, loudly, in front of everyone." },
  { id: 'wk-4', feltCount: 642, categories: ['work_identity'],
    text: "I'm good at my job and I quietly hate it, and saying that out loud would unravel a life I've already paid a lot to build." },
  { id: 'wk-5', feltCount: 1090, categories: ['work_identity'],
    text: "successful by every metric i used to dream about and i feel like an actor who wandered into the wrong play and just kept saying the lines." },
  { id: 'wk-6', feltCount: 980, categories: ['work_identity'],
    text: "i'm scared that if i stopped being useful, i'd find out nobody actually knows me — just the things i do for them 🙃" },
  { id: 'wk-7', feltCount: 900, categories: ['work_identity'],
    text: "everyone's launching, scaling, building 💀 i'm just trying to enjoy a tuesday. when did 'ordinary' become something to apologise for?" },
  { id: 'wk-8', feltCount: 850, categories: ['work_identity'],
    text: "left the 'good' career everyone respected and i'm happier and broker and i still can't tell if i was brave or just couldn't hack it." },
  { id: 'wk-9', feltCount: 1240, categories: ['work_identity'],
    text: "I think I peaked, and the rest looks like managing the decline gracefully, and nobody tells you how to grieve a younger, more promising you." },
  { id: 'wk-10', feltCount: 760, categories: ['work_identity'],
    text: "my job title impresses people at parties and bores me to tears by tuesday, and i built a whole life on top of the title 😶" },
  { id: 'wk-11', feltCount: 705, categories: ['work_identity'],
    text: "I'm 40 and still wondering what I want to be when I grow up. I assumed that question expired. It just got quieter and more expensive." },
  { id: 'wk-12', feltCount: 660, categories: ['work_identity'],
    text: "got the promotion and felt nothing but the dread of having further to fall 🥲" },
  { id: 'wk-13', feltCount: 1010, categories: ['work_identity'],
    text: "i measure my whole worth in output and on the days i make nothing i can't shake the feeling that i AM nothing. i know it's not true. knowing doesn't help." },
  { id: 'wk-14', feltCount: 620, categories: ['work_identity'],
    text: "i do meaningful work and i'm exhausted to the bone and i'm not allowed to complain because it's the thing i 'get to' do. so i'm complaining here." },
  { id: 'wk-15', feltCount: 1320, categories: ['work_identity'],
    text: "i'm not scared of failing. i'm scared of succeeding at the wrong thing and only realising it when it's way too late to start over." },
  { id: 'wk-16', feltCount: 560, categories: ['work_identity'],
    text: "I gave my twenties to a company that replaced me in a week. The lesson cost more than the salary ever paid." },
  { id: 'wk-17', feltCount: 520, categories: ['work_identity'],
    text: "i'm the one everyone leans on at work and nobody asks who i lean on. the competence is a cage i built and decorated myself." },
  { id: 'wk-18', feltCount: 480, categories: ['work_identity'],
    text: "i dread sunday evenings more than i enjoy any other part of the week 😮‍💨 starting to think that's data i keep refusing to read." },
  { id: 'wk-19', feltCount: 450, categories: ['work_identity'],
    text: "I quit the thing that was killing me slowly. Everyone called it a risk. The real risk was the version of me who'd have stayed." },
  { id: 'wk-20', feltCount: 420, categories: ['work_identity'],
    text: "honestly the most accurate thing i could put on my resume right now is 'tired, but trying' 🙃" },

  // ─────────────────────────── Body & health ───────────────────────────
  { id: 'bd-1', feltCount: 690, categories: ['body_health'],
    text: "I miss the body I used to take completely for granted. I was never grateful for it until it stopped cooperating, and now gratitude feels like an apology I owe it." },
  { id: 'bd-2', feltCount: 604, categories: ['body_health'],
    text: "chronic pain turned me into a liar — 'i'm fine,' a hundred times a day, because the truth takes too long and helps no one and makes the room go quiet." },
  { id: 'bd-3', feltCount: 521, categories: ['body_health'],
    text: "the diagnosis didn't break me 🙃 it was everyone NEEDING me to be inspiring about it that nearly did." },
  { id: 'bd-4', feltCount: 458, categories: ['body_health'],
    text: "i say i'm 'managing.' my body's been at war with me for years and i've run out of ways to describe it that don't scare the people i love." },
  { id: 'bd-5', feltCount: 1080, categories: ['body_health'],
    text: "My body kept score of every year I ignored it, and now it's calling in the debt all at once — and I can't even be angry, because I was warned." },
  { id: 'bd-6', feltCount: 760, categories: ['body_health'],
    text: "i plan my whole day around how my body might betray me and then smile when people go 'but you look fine' 🥲 i do look fine. that's the loneliest part." },
  { id: 'bd-7', feltCount: 690, categories: ['body_health'],
    text: "i grieve the spontaneity illness took — the trips not booked, the nights cut short — more than the pain itself, most days." },
  { id: 'bd-8', feltCount: 640, categories: ['body_health'],
    text: "everyone wants the inspiring version where i 'beat' it 😮‍💨 the real version is unglamorous and ongoing and full of paperwork. tired of performing recovery." },
  { id: 'bd-9', feltCount: 1190, categories: ['body_health'],
    text: "I made peace with my body the same week it started failing me, which feels like a cruel joke and a strange gift at the same time." },
  { id: 'bd-10', feltCount: 600, categories: ['body_health'],
    text: "i miss being a person, not a patient. i miss when my calendar had something other than appointments on it." },
  { id: 'bd-11', feltCount: 560, categories: ['body_health'],
    text: "i'm in pain right now, smiling at you, finishing this sentence 🙂 that's most days. you'd never guess, and i work hard so you won't have to." },
  { id: 'bd-12', feltCount: 520, categories: ['body_health'],
    text: "Nobody tells you grief and illness wear the same face — the same fatigue, the same fog, the same friends who slowly stop calling." },
  { id: 'bd-13', feltCount: 900, categories: ['body_health'],
    text: "the hardest part of being sick is how boring it becomes to everyone else after a while. including, on the bad days, me." },
  { id: 'bd-14', feltCount: 480, categories: ['body_health'],
    text: "lowkey jealous of people who get to be careless with their health 😔 i used to be one of them. would give a lot to be that thoughtless again." },
  { id: 'bd-15', feltCount: 460, categories: ['body_health'],
    text: "i look in the mirror and negotiate a truce with a body i spent years at war with. some days we reach one. some days we don't speak." },
  { id: 'bd-16', feltCount: 440, categories: ['body_health'],
    text: "got the all-clear and instead of joy i felt this weird grief for the months fear ate, and guilt for not feeling grateful enough 🥲" },
  { id: 'bd-17', feltCount: 410, categories: ['body_health'],
    text: "I treat my body like a difficult coworker I'm stuck with for life — some respect, some resentment, a lot of careful management." },
  { id: 'bd-18', feltCount: 390, categories: ['body_health'],
    text: "finally asked for help with something i'd been white-knuckling alone and the relief was so big i was embarrassed i waited 😮‍💨" },
  { id: 'bd-19', feltCount: 370, categories: ['body_health'],
    text: "some days winning is just drinking the water, taking the short walk, going to bed without a war. learning to let that count." },
  { id: 'bd-20', feltCount: 350, categories: ['body_health'],
    text: "My body and I aren't friends yet. But we've stopped shouting, and lately we share the quiet. I'll take it." },

  // ─────────────────────────── Faith & meaning ───────────────────────────
  { id: 'fa-1', feltCount: 712, categories: ['faith_meaning'],
    text: "i want all of it to mean something — the losses, the small kindnesses, the waiting. most days i quietly settle for it just being gentle and call that enough." },
  { id: 'fa-2', feltCount: 567, categories: ['faith_meaning'],
    text: "left the faith i was raised in and i feel free and unmoored in exactly equal amounts 🥲 nobody warns you doubt can be just as lonely as belief." },
  { id: 'fa-3', feltCount: 432, categories: ['faith_meaning'],
    text: "I still pray to a God I'm no longer sure is listening, in words I learned before I knew how to question them. The habit outlived the certainty, and I let it." },
  { id: 'fa-4', feltCount: 389, categories: ['faith_meaning'],
    text: "some nights i look up and feel held by something vast and kind. some nights it's just cold empty space. i never know which one i'm going to get." },
  { id: 'fa-5', feltCount: 1120, categories: ['faith_meaning'],
    text: "i do good quietly and wonder if it counts when no one — not even a God i'm unsure of — is watching. then i do it anyway. maybe that's the answer." },
  { id: 'fa-6', feltCount: 1040, categories: ['faith_meaning'],
    text: "not sure anything means anything cosmically, and lately instead of terrifying me it's kind of freed me to just love the people in front of me while they're here 🙂" },
  { id: 'fa-7', feltCount: 690, categories: ['faith_meaning'],
    text: "I envy people with unshakeable faith and people with tidy certainty there's nothing. I live in the uncomfortable middle and mostly just try to be kind here." },
  { id: 'fa-8', feltCount: 640, categories: ['faith_meaning'],
    text: "left the church and kept the longing 🥲 turns out you can lose the building and still ache for the thing it promised." },
  { id: 'fa-9', feltCount: 900, categories: ['faith_meaning'],
    text: "i've been angry at a God i claim not to believe in, which my logical brain finds ridiculous and my grieving heart finds completely reasonable." },
  { id: 'fa-10', feltCount: 600, categories: ['faith_meaning'],
    text: "raising my kids without the religion i grew up in, and some nights i worry i handed them freedom and forgot to hand them anywhere to put the fear." },
  { id: 'fa-11', feltCount: 560, categories: ['faith_meaning'],
    text: "i pray when i'm desperate and feel like a hypocrite the rest of the time 😶 starting to think desperate prayer might be the most honest kind there is." },
  { id: 'fa-12', feltCount: 520, categories: ['faith_meaning'],
    text: "I miss believing someone was in charge. Adulthood is realising the grownups were guessing too, all the way up." },
  { id: 'fa-13', feltCount: 490, categories: ['faith_meaning'],
    text: "i keep the rituals long after i lost the belief — the candle, the pause, the words. the shape of faith comforts me even when the substance is gone." },
  { id: 'fa-14', feltCount: 460, categories: ['faith_meaning'],
    text: "i want there to be more, after. not for the rewards 🥲 just so all this loving wasn't only ever temporary." },
  { id: 'fa-15', feltCount: 440, categories: ['faith_meaning'],
    text: "Everyone around me seems so sure — of their politics, their God, their no-God. I'm sure of almost nothing, and I've decided that honesty is its own kind of faith." },
  { id: 'fa-16', feltCount: 410, categories: ['faith_meaning'],
    text: "found more of the sacred in a hospital waiting room and a stranger's small kindness than i ever did in a sermon." },
  { id: 'fa-17', feltCount: 390, categories: ['faith_meaning'],
    text: "i keep searching for my 'purpose' like it's a lost set of keys 🙃 lately i wonder if it was never a thing to find, just a thing to make." },
  { id: 'fa-18', feltCount: 370, categories: ['faith_meaning'],
    text: "I stopped asking why bad things happen and started asking what I'm going to do now. The second question is the only one that ever answers back." },
  { id: 'fa-19', feltCount: 350, categories: ['faith_meaning'],
    text: "doubt didn't make me bitter. it made me gentler with everyone else who's just trying to figure out how to be a person here." },
  { id: 'fa-20', feltCount: 330, categories: ['faith_meaning'],
    text: "Some mornings the meaning is just the coffee, the light on the wall, the fact that I'm still here to notice. I'm learning to let the small holy things be enough." },

  // ─────────────── Rich / long-form (D7 reading pool) ───────────────
  // Multi-paragraph, story-shaped. These are the only ones surfaced to a
  // reader inside their first 7 days — see getDummyRecommendations({ richOnly }).
  { id: "mh-r1", feltCount: 1470, rich: true, categories: ['mental_health'],
    text: "I have a whole routine for seeming fine. Shower, coffee, the specific playlist, the walk to the station where I practise my face.\n\nBy the time I get to my desk I've already done a full day of work, and none of it was the job.\n\nI don't know how to tell anyone that the tiredness isn't from the work. It's from the performance around the work." },
  { id: "mh-r2", feltCount: 1180, rich: true, categories: ['mental_health'],
    text: "my therapist asked what i do for fun and i sat there for a full minute\n\ni used to draw. i used to be the person who drew on everything \u2014 margins, napkins, my own hands. i don't know when i stopped. there wasn't a day i decided to.\n\ni bought a sketchbook last week. it's still in the bag. but i bought it." },
  { id: "mh-r3", feltCount: 1320, rich: true, categories: ['mental_health'],
    text: "The anxiety doesn't announce itself any more. It moves in quietly and rearranges the furniture, and I don't notice until I go to sit somewhere familiar and it's gone.\n\nI cancelled on my oldest friend three times this month. Each time I had a real reason. Each time the relief when she said 'no worries' was bigger than the reason deserved.\n\nI'm not avoiding her. I'm avoiding being seen not coping. There's a difference, and it isn't a flattering one." },
  { id: "mh-r4", feltCount: 990, rich: true, categories: ['mental_health'],
    text: "everyone keeps saying it's brave to talk about it. i've talked about it. i've talked about it so much it's become a bit, a thing i say early to get ahead of it \ud83d\ude05\n\nwhat i haven't done is let anyone actually help. talking is easy. it's the accepting the lift to the appointment, the 'can i just sit here while you do it' \u2014 that's the part i can't do\n\ni think i've confused narrating it with surviving it" },
  { id: "mh-r5", feltCount: 1240, rich: true, categories: ['mental_health'],
    text: "Three years on medication and I still catch myself framing it as temporary. 'While I sort myself out.' 'Just for now.'\n\nMy psychiatrist asked whether I'd say that about insulin and I got defensive, which told us both what we needed to know.\n\nI'm well. I've been well a while. I just haven't put down the idea that being well is something I'm getting away with." },
  { id: "mh-r6", feltCount: 1090, rich: true, categories: ['mental_health'],
    text: "i had a good week. a genuinely good one.\n\nand instead of enjoying it i spent most of it bracing \u2014 checking the sky, waiting for the part where it turns. because it always turns, and i'd rather see it coming than get caught out happy\n\nnobody warns you that recovery includes learning to trust good days again. that's its own slow separate thing \ud83e\udd72" },
  { id: "rel-r1", feltCount: 1390, rich: true, categories: ['relationships'],
    text: "My mother and I have the same conversation every Sunday. Weather, her knee, my job, whether I'm eating.\n\nUnderneath it is a completely different conversation neither of us has ever started \u2014 about the years she wasn't there, and the reasons I've never asked for.\n\nI'm forty-one. She's seventy-three. I keep thinking there'll be a better time to open it, and I keep watching the window get smaller." },
  { id: "rel-r2", feltCount: 1150, rich: true, categories: ['relationships'],
    text: "we broke up eight months ago and i still narrate my day to him in my head\n\nnot the big stuff. the stupid stuff. the man on the bus with the parrot. the way the new place gets light at four. he was the audience for all my nothing, and i didn't realise how much of my life was made of nothing until there was no one to tell \ud83e\udd72\n\ni'm not sad about him exactly. i'm sad about the running commentary with nowhere to go" },
  { id: "rel-r3", feltCount: 1510, rich: true, categories: ['relationships'],
    text: "I love my wife and I have been lonely in my marriage for two years.\n\nBoth of those are true, and saying the second out loud feels like a betrayal of the first \u2014 which is exactly why I haven't said it to her. So we're polite, and we're kind, and we're further apart every month.\n\nI keep waiting for something to break so we'd have to talk about it. Nothing breaks. That's almost the worst part." },
  { id: "rel-r4", feltCount: 880, rich: true, categories: ['relationships'],
    text: "my best friend got engaged and i cried in the toilets and they were not happy tears \ud83d\ude2d\n\ni'm not in love with her. it isn't that. it's that i can feel the shape of the next ten years and i'm not in the middle of them any more, and i don't know who i am in someone's life if i'm not the first call\n\nthen i went back out and hugged her and meant it. both things fit, somehow." },
  { id: "rel-r5", feltCount: 1260, rich: true, categories: ['relationships'],
    text: "My dad and I fix things together. That's the whole relationship. A leaking tap, a dead battery, a fence after a storm.\n\nWe have never once talked about my divorce, or his heart, or the fact that we're both frightened of the same silence. But he drove ninety minutes last month because my boiler was out, stayed the night, and made me breakfast.\n\nI've stopped needing him to say it. I just wish I'd worked out sooner that he'd been saying it the whole time." },
  { id: "rel-r6", feltCount: 1020, rich: true, categories: ['relationships'],
    text: "i keep a draft text to my sister that i've rewritten maybe forty times\n\nit's an apology. a real one, not the kind that's secretly asking to be forgiven. three years of not speaking, and every version either says too little or explains too much\n\nthe honest reason i haven't sent it is that unsent, it could still work. sent, it might not." },
  { id: "gr-r1", feltCount: 1620, rich: true, categories: ['grief'],
    text: "Mum's been gone fourteen months and I've finally stopped reaching for the phone.\n\nWhat nobody prepared me for is that stopping felt like a second loss. The reflex was the last living thing about her \u2014 the automatic part of me that still believed she'd answer.\n\nNow I just know, all the time, evenly, without being reminded. I didn't expect to miss the forgetting." },
  { id: "gr-r2", feltCount: 1290, rich: true, categories: ['grief'],
    text: "he died in march and everyone was incredible for about six weeks\n\nthen the food stopped and the texts thinned out. that's not a complaint \u2014 people have lives, and honestly the crowd was exhausting. but month seven is when it actually landed, and by then the scaffolding was gone and i was supposed to be through it\n\ngrief doesn't run on the same clock as sympathy. wish someone had told me that in march" },
  { id: "gr-r3", feltCount: 1180, rich: true, categories: ['grief'],
    text: "I was not the widow. I was not the sister. I had no role, so I had no permission.\n\nWe'd been close nineteen years, and at the funeral I sat six rows back with the colleagues. Everyone assumed I was fine because nobody had a word for what I'd lost.\n\nI still don't have the word. I just know the house is quieter in a way that has nothing to do with sound." },
  { id: "gr-r4", feltCount: 1440, rich: true, categories: ['grief'],
    text: "my grandmother is still alive and i have been grieving her for two years\n\nshe knows my face most days. she doesn't know that i moved, or that i got the job, or that she already told me this story twenty minutes ago. i answer like it's new every time, and it costs me something every time\n\nnobody sends flowers for this one. there's no date to mark. she's right here, and she's been leaving for two years" },
  { id: "gr-r5", feltCount: 1070, rich: true, categories: ['grief'],
    text: "The strangest part is how ordinary the triggers are. Not photographs. Not the anniversary.\n\nA particular washing powder in a supermarket aisle. The sound of someone else's keys. Last week it was a stranger laughing with exactly his timing, and I had to go and sit in the car.\n\nI can plan for the big days. It's the ambushes that still take my legs out." },
  { id: "gr-r6", feltCount: 1350, rich: true, categories: ['grief'],
    text: "we lost the baby at nineteen weeks and people keep saying 'at least you know you can get pregnant'\n\nthey mean it kindly. i know they do. but i had names. i had a whole imagined person, a whole set of tuesdays in a future that isn't coming, and there's no funeral for that \ud83d\udc94\n\ni'm not grieving a possibility. i'm grieving someone only i ever met." },
  { id: "sec-r1", feltCount: 1410, rich: true, categories: ['secrets'],
    text: "Twelve years ago I let a colleague take the blame for something I did. It wasn't career-ending. He moved on. I doubt he thinks about it.\n\nI've thought about it most weeks since. I built a reputation on being the reliable one, and the foundation of it is the one day I wasn't and let someone else carry it.\n\nEvery time somebody calls me straight, I hear it. It's a splinter you only feel in certain weather." },
  { id: "sec-r2", feltCount: 1130, rich: true, categories: ['secrets'],
    text: "i have a second account with forty followers and it is the only honest thing i own\n\nno face, no name, just the things i actually think, posted at 2am to people who'll never meet me. my real account is a museum of a person i'm performing \ud83d\ude43\n\nthe part that worries me isn't the anonymous one. it's that the anonymous one is the one that feels like me" },
  { id: "sec-r3", feltCount: 1280, rich: true, categories: ['secrets'],
    text: "I'm the generous one. It's my whole identity \u2014 first round, lifts to the airport, the person who remembers.\n\nWhat nobody knows is that I do it because I'm terrified that if I stopped being useful there'd be no reason for anyone to stay. It isn't kindness. It's rent.\n\nI've been paying it so long I don't know what I'd be without it, and I'm too frightened of the answer to stop and find out." },
  { id: "sec-r4", feltCount: 960, rich: true, categories: ['secrets'],
    text: "i read my partner's messages once, four years ago\n\nthere was nothing. absolutely nothing \u2014 a boring conversation with his brother. and i've carried the guilt ever since while he's carried none of it, because he doesn't know\n\ni can't confess it without handing him a wound he doesn't currently have. so i just hold it. that's the whole sentence: i hold it." },
  { id: "sec-r5", feltCount: 1330, rich: true, categories: ['secrets'],
    text: "Everyone thinks I chose this career. The truth is I was too frightened to disappoint my father, and then too far in to turn round.\n\nTwenty-two years. A pension, a title, a house that's nearly paid for \u2014 all built on a decision I never actually made.\n\nHe's been dead six years. I'm still doing it. That's the part I can't explain to anyone, including myself." },
  { id: "sec-r6", feltCount: 1040, rich: true, categories: ['secrets'],
    text: "i told everyone i quit. i was managed out \ud83d\ude36\n\nit's been a year and the lie has its own architecture now \u2014 the story about wanting a change, the timeline i keep straight, the people who congratulate me on my bravery\n\nlosing the job hurt for a month. the lie has hurt for a year. i picked the worse one, and i picked it in about four seconds" },
  { id: "wk-r1", feltCount: 1560, rich: true, categories: ['work_identity'],
    text: "I got the promotion I'd spent six years wanting and felt absolutely nothing.\n\nNot relief, not pride. I read the email twice to check I'd understood, then went and made a coffee. That night I lay awake doing the arithmetic on how long I'd been running at something that weighed nothing once I caught it.\n\nI'm not unhappy. I'm newly aware that I don't know what I want, and that I've used ambition to avoid finding out." },
  { id: "wk-r2", feltCount: 1220, rich: true, categories: ['work_identity'],
    text: "everyone at work thinks i'm across everything. i google the basics of my own job most weeks \ud83d\udc80\n\nit's been four years. surely at some point the impostor thing resolves into just being the person who does the job? but it only gets more elaborate \u2014 more scaffolding, more careful management of what people see\n\ni'm good at this. i have evidence. the evidence doesn't touch the feeling" },
  { id: "wk-r3", feltCount: 1100, rich: true, categories: ['work_identity'],
    text: "I left a well-paid job that was quietly killing me. I'm broke and happier and I still can't say it was right without qualifying it.\n\nMy family ask how 'the new thing' is going, in a tone. Old colleagues forward me roles I'd be perfect for. Everyone is kind and nobody believes me.\n\nSome mornings I don't believe me either. Then I remember what Sunday nights used to feel like, and I do." },
  { id: "wk-r4", feltCount: 870, rich: true, categories: ['work_identity'],
    text: "my whole personality is being busy\n\ni took a week off and by wednesday i was genuinely unwell with it. no deadlines, nobody needing anything, just me and the enormous question of what i'm for if i'm not producing \ud83d\ude2e\u200d\ud83d\udca8\n\nwent back early and told everyone the break was great. it was the worst week i've had in years and it had nothing to do with the week" },
  { id: "wk-r5", feltCount: 1370, rich: true, categories: ['work_identity'],
    text: "I'm fifty-three and I've worked out that I peaked at thirty-eight.\n\nNot catastrophically \u2014 I'm respected, I'm fine. But the interesting work goes to people who remind me of me, and I've become the person who gets consulted rather than the person who does it.\n\nNobody tells you you'll have to grieve a younger, more promising version of yourself while still showing up as the current one. I'm learning to do that without the bitterness leaking out." },
  { id: "wk-r6", feltCount: 1010, rich: true, categories: ['work_identity'],
    text: "i measure my worth in output, and on days i make nothing i genuinely believe i am nothing\n\ni know how that sounds. i know it isn't true. knowing has never once helped at 6pm on a day where i've got nothing to show\n\ni've started writing down one non-work thing i did each day. today's was 'made soup'. it feels stupid and it's the only thing that's moved in two years" },
  { id: "bd-r1", feltCount: 1300, rich: true, categories: ['body_health'],
    text: "I've had chronic pain for nine years and I've become an exceptional liar.\n\n'I'm fine' is faster than the truth and it keeps the room comfortable. But it means nobody has any idea, so when I do cancel it looks sudden and inexplicable rather than the end of a week of paying for something I chose to do.\n\nI'd rather be thought flaky than fragile. I'm no longer sure that was the right trade." },
  { id: "bd-r2", feltCount: 1150, rich: true, categories: ['body_health'],
    text: "the diagnosis didn't break me. the inspiration did \ud83d\ude43\n\nwithin a fortnight i was somebody's lesson about perspective \u2014 people i barely knew telling me how strong i am, how it puts things in context, how they'd never cope\n\ni'm not strong. i'm here, doing the paperwork and the appointments and the tiredness, with no alternative on offer. there's nothing inspiring about having no choice" },
  { id: "bd-r3", feltCount: 1420, rich: true, categories: ['body_health'],
    text: "I made peace with my body at forty-six, about eight months before it started failing.\n\nThirty years at war with it \u2014 the diets, the mirrors, the whole exhausting campaign. Then I genuinely stopped, and I had the better part of a year of just living in it before the results came back.\n\nI'm not angry about the illness. I'm angry about the thirty years. That's the bit I'd want back." },
  { id: "bd-r4", feltCount: 930, rich: true, categories: ['body_health'],
    text: "my body has been sending invoices for everything i ignored in my twenties and they've all come due at once\n\nthe sleep i didn't get. the food that was just fuel. the years i treated exhaustion as a personality. i can't even be properly indignant because i was warned, repeatedly, by people who turned out to be right\n\n35 and i go to bed at ten now. the shame of how much better i feel is genuinely something i'm working through" },
  { id: "bd-r5", feltCount: 1210, rich: true, categories: ['body_health'],
    text: "Six months of tests and everything comes back normal, which is somehow the worst available result.\n\nNormal means nothing to treat. Normal means the tiredness that has taken my job and most of my friendships is, officially, nothing. I've started to sound unhinged in appointments because I'm so frightened of being dismissed again.\n\nI'm not hoping something's wrong. I'm hoping someone believes the thing that already is." },
  { id: "bd-r6", feltCount: 1060, rich: true, categories: ['body_health'],
    text: "got the all clear in april and i have not felt one moment of the joy i was promised\n\nwhat i feel is furious. about the year it ate, about how everyone's moved on, about being expected to be grateful now and hand back the concern \ud83e\udd72\n\nnobody prepares you for grieving the time while being congratulated on surviving it" },
  { id: "fa-r1", feltCount: 1240, rich: true, categories: ['faith_meaning'],
    text: "I left the church at twenty-six and I've never stopped missing the singing.\n\nNot the theology \u2014 I don't want that back and I don't miss the certainty. But two hundred people in a room making the same sound at the same time, on a Tuesday, for no commercial reason. I haven't found the replacement and I have genuinely looked.\n\nI think I lost a building and a habit, and I only meant to lose the belief." },
  { id: "fa-r2", feltCount: 980, rich: true, categories: ['faith_meaning'],
    text: "i pray when i'm desperate and i don't believe the rest of the time, and i've stopped finding that embarrassing\n\nfoxhole prayer is supposed to be the cheap kind. but it's the only time i'm actually honest \u2014 no performance, no theology, just the raw 'please' of someone with nothing left to manage\n\nif anything is listening, that's probably the version worth hearing anyway" },
  { id: "fa-r3", feltCount: 1330, rich: true, categories: ['faith_meaning'],
    text: "My daughter asked what happens when we die and I gave her the honest answer, which is that I don't know.\n\nShe's nine. She looked genuinely frightened and I had nothing to hand her. I was raised with an answer \u2014 a bad one, in hindsight, but it worked at nine \u2014 and I've given her freedom and no floor.\n\nI still think the truth was right. I just didn't expect it to cost her anything." },
  { id: "fa-r4", feltCount: 1120, rich: true, categories: ['faith_meaning'],
    text: "spent my thirties looking for my purpose like it was a set of car keys\n\nsomewhere this year it shifted. i stopped looking for the thing i'm for and noticed i'd already been doing it \u2014 badly, inconsistently, without naming it. the people i show up for. the small repeated unglamorous stuff\n\nit was never hidden. it just didn't look like a calling, so i kept walking past it" },
  { id: "fa-r5", feltCount: 1190, rich: true, categories: ['faith_meaning'],
    text: "I've been angry at a God I don't believe in for four years, which my rational brain finds ridiculous.\n\nBut you can't be furious at nothing. The anger has an address, and every time I try to dissolve it into 'random universe, no intent' it refuses to go. It wants someone to have decided.\n\nI've stopped trying to make it make sense. Some grief needs a direction more than it needs to be correct." },
  { id: "fa-r6", feltCount: 1480, rich: true, categories: ['faith_meaning'],
    text: "sat with my dad the night before he died and none of the meaning stuff showed up\n\nno light, no peace, no sense of anything larger. just a room, a machine, his hand, and the two of us doing the most ordinary thing humans do\n\ni thought that would frighten me out of whatever faith i had left. it did the opposite. that ordinariness felt like the most sacred thing i've ever been in the room for" },
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

function matchingPool(categories: string[], richOnly = false): Dummy[] {
  const base   = richOnly ? DUMMY_CONFESSIONS.filter((c) => c.rich) : DUMMY_CONFESSIONS;
  const chosen = new Set(categories);
  if (chosen.size === 0) return base; // no prefs → everything
  const matched = base.filter((c) => c.categories.some((cat) => chosen.has(cat)));
  // Never strand a reader on an empty feed because their categories are narrow:
  // fall back to the whole (still rich-filtered) pool rather than showing nothing.
  return matched.length > 0 ? matched : base;
}

/**
 * Preview recommendations filtered to the reader's chosen categories.
 * With no categories chosen, returns the full pool.
 *
 * @param excludeIds — ids already shown earlier this reading session (e.g.
 *   D7's seamless queue refill in explore.tsx). Filtered out before
 *   shuffling/slicing so repeated calls surface fresh confessions instead of
 *   reshuffling the same ~20-per-category pool. Once every matching
 *   confession has actually been shown at least once, falls back to
 *   allowing repeats (from the full matching pool) rather than starving the
 *   caller with an empty/shrinking result — the point of D7 is "read as
 *   much as you want," not a hard stop the moment the seed pool is seen once.
 */
export function getDummyRecommendations(
  categories:  string[],
  limit        = 10,
  excludeIds: string[] = [],
  richOnly     = false,
): Recommendation[] {
  const pool = matchingPool(categories, richOnly);
  if (excludeIds.length > 0) {
    const excluded = new Set(excludeIds);
    const unseen   = pool.filter((c) => !excluded.has(c.id));
    if (unseen.length > 0) return shuffle(unseen).slice(0, limit);
    // Every matching confession has been shown — repeat, reshuffled.
  }
  return shuffle(pool).slice(0, limit);
}

/** How many confessions match the reader's categories (preview count). */
export function getDummyMatchCount(categories: string[]): number {
  return matchingPool(categories).length;
}

/**
 * Is this confession substantial enough to read like a story rather than a
 * one-liner? Used to hold the D7 reading pool to the richer entries — it also
 * applies to server-returned confessions, which carry no `rich` flag.
 */
export function isRichConfession(text: string): boolean {
  const t = text.trim();
  return t.includes('\n\n') || t.length >= 300;
}
