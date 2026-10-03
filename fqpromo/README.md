# FlashQuizz promo (30 s, 9:16)

A Remotion project that renders a 1080×1920, 30 fps promo for
[FlashQuizz](https://github.com/jhnvnmcrg/flashquizz). Every screen is recreated in code
with the app's real design tokens, logo and **sample fixture questions only**.

## Render

```bash
npm install
npm run render          # → out/flashquizz-promo.mp4 (render + loudness master)
npm run studio          # live preview / scrubbing
node tools/stills.mjs 130 345 790   # review stills → out/stills/
```

## Change the voiceover or script

Lines live in `script.json`. Each chunk has an on-screen `caption` (`*word*` = highlighted)
and a pronunciation-safe `tts` string. Change `voice` there, e.g. `en-PH-JamesNeural`.
Then regenerate everything audio and timing:

```bash
npm run audio   # make_vo.py → layout.py → make_music.py → make_sfx.py
```

`tools/layout.py` lays the clips on the timeline and writes `src/data/timeline.json`, the single
clock for scene cuts, captions, taps, SFX and the music drop (pinned to the word "celebrate").

To use your own recording instead, replace the mp3s in `public/audio/vo/` with clips of the same
names and roughly the same pacing; the visuals stay on the TTS timing in `timeline.json`.

## Pieces

- `tools/make_vo.py` — edge-tts (Microsoft neural voices; the text is sent to their online service)
- `tools/make_music.py` — original 128 BPM track synthesised with numpy (royalty-free)
- `tools/make_sfx.py` — taps, whooshes, chimes, firework booms
- `src/scenes/*` — Hook, Today/modules, Practice, Flashcards, Offline, Celebration, End card
- `src/components/Fireworks.tsx` — deterministic canvas fireworks

Remotion's free license covers individuals and companies with up to 3 people.
