# SADIA AI — Complete UI Package

## Included
- Responsive neon dashboard inspired by the supplied reference.
- Sadia portrait in `assets/sadia.png`.
- Existing multi-agent chat, memory, Bengali TTS, microphone and camera logic preserved in `js/app.js`.
- Lightweight portrait stage in `js/avatar.js` (no Three.js/WebGL dependency).
- Cloudflare Worker source in `worker.js`.
- PWA manifest and service worker.

## Deploy frontend
Upload the contents of this folder to your static host, preserving the folder structure:
- `index.html`
- `css/`
- `js/`
- `assets/`
- `manifest.json`
- `sw.js`

## Cloudflare Worker
Deploy `worker.js` as a Cloudflare Worker. Set secrets in Worker Settings > Variables and Secrets:
- `GROQ_KEY`
- `OPENROUTER_KEY`

Do not put API keys in frontend JavaScript or commit them to a public repository. The frontend currently calls:
`https://version-x.akijelectronic.workers.dev`
If your Worker URL changes, update `W` at the top of `js/app.js`.

## Important feature limitation
The portrait is a still image. The current mouth overlay reacts to audio amplitude, so this is **audio-reactive visual mouth movement**, not phoneme-accurate Bengali lip-sync and not a fully animated photorealistic digital human. Eye blinking and realistic facial-expression animation are also not yet implemented. Those require a rigged face/animation model or a more advanced browser-side face system.
