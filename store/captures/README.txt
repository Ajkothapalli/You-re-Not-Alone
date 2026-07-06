soulyap — store screenshot captures
====================================

Drop 5 REAL app screenshots here (portrait phone PNGs), named EXACTLY:

  feed.png      → the read feed (confession cards)   ← this is screenshot #1
  write.png     → the compose / "what can't you say" screen
  match.png     → a match reveal (you wrote / they wrote)
  count.png     → the "N felt this too" moment
  profile.png   → your profile screen

Then run:  python3 compose_from_captures.py
Output lands in store/play/{phone,tablet7,tablet10}/ + feature-1024x500.png

Capture tips
------------
- Any resolution is fine — each is cover-fit into the device frame (top-aligned,
  so the status bar shows). A clean 1080x2340-ish portrait screenshot is ideal.
- Use REAL content on screen (real confession text, real counts) — not empty states.
- Turn OFF any dev overlays / debug banners before capturing.
- Android: Power + Volume-Down. Emulator: the camera icon in the toolbar.
- Missing a file? The script renders a labelled placeholder so you can still preview.
- Tablet shots reuse the phone captures framed on a tablet-aspect panel (you chose this);
  drop a real tablet capture later only if you want true tablet layouts.
