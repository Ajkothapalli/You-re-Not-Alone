# soulyap — App Review Notes

> Copy this into the "Notes for Reviewer" field when submitting to App Store Connect
> and Google Play. Keep it under 4000 characters for the App Store field limit.

---

## Notes for App Review (App Store Connect / Google Play)

soulyap is an anonymous emotional-support app where users write one private
confession and are matched — anonymously — with a past confession expressing
a similar feeling. The match shows them they are not alone.

### There is no chat, no replies, no DMs, no profiles

- Users cannot message each other. There is no reply channel of any kind.
- There are no user profiles. Confessions never carry an author name, handle,
  avatar, or any identifier.
- There is no way to target, identify, or contact another user.
- The only user-generated content flow is: write one confession → see one
  matched confession. Nothing else.

### Age gate

- 18+ enforced at registration: users enter their date of birth; under-18
  entries are rejected client-side and re-verified server-side before any
  data is stored.
- The age check runs on the server at every submission (not just signup).

### Content moderation

- Every confession passes a pre-publish AI moderation gate (OpenAI
  omni-moderation-latest) before anything is stored. Flagged content is
  blocked and never stored.
- CSAM detection runs on every submission. CSAM signals trigger an NCMEC
  CyberTipline mandatory report and block storage permanently.
- Users can report any confession they see. Reports are reviewed by the
  operator and actioned within 24 hours.
- A crisis keyword + classifier check runs on every submission. Crisis-
  flagged confessions are never stored or matched; users are shown crisis
  resources and a global helpline directory instead.

### User-facing anonymity (why this is not anonymous chat)

- Confessions are stored with an internal account link used ONLY for ownership
  (view / edit / delete your own), moderation, and account deletion. It is never
  exposed in any client-facing view or API response.
- Confessions always display under a random per-confession persona. There are no
  public profiles, no author pages, no replies, and no DMs — users cannot find,
  follow, or re-identify each other.
- Users can view, edit, and delete their own confessions, and deleting an
  account erases or permanently unlinks everything they wrote (UGC deletion
  supported, per store UGC policies).

### Test credentials

You can create a test account with any email address. The OTP code will be
sent to that address. Use a date of birth ≥ 18 years ago. The app does not
require a phone number.

- Email: [use your own — any email receives the OTP]
- DOB: 1990-01-01 (or any date ≥ 18 years ago)
- No purchase is required to submit a confession or see a match.
  Premium (reading more confessions) is available but gated behind a
  subscription; the core feature is fully accessible without payment.

### Guideline cross-references

- **4.3 (Spam):** Each user submits their own original content; there is no
  forwarding, reposting, or automation visible to users.
- **1.1 (Objectionable Content):** Pre-publish AI moderation blocks
  objectionable content before storage. Users can report; removal within 24h.
- **1.2 (User Generated Content):** Report mechanism on every confession.
  Operator reviews and removes within 24h SLA. Zero-tolerance clause in
  Terms of Service.
- **5.1.1 (Privacy - Data Collection):** Confessions are not linkable to
  users. Only email is collected for authentication. See Privacy policy at
  soulyap.me/privacy.
- **1.3 (Kids):** 17+ age rating requested. 18+ gate enforced server-side.
