Original prompt: 点击开始对话咋没反应？然后为什么数字人那么小。数字人肯定是数字人占主体呀。然后背景做成太空的。

2026-03-17
- User asked to inspect the live page with develop-web-game skill after the avatar framing regressed.
- Plan: run local app, reproduce with Playwright screenshots, fix avatar framing and start button behavior, rerun validation.
- Fixed the immediate layout bug: the r3f canvas only occupied the default canvas height, so the avatar and starfield rendered in a thin strip at the top.\n
- Increased avatar framing, rotated the GLB toward camera, and pushed the oversized backdrop planet off-center to keep the digital human as the visual focus.\n
- Simplified overlay hit testing by enabling pointer events on the whole overlay and switched the avatar yaw for a user-facing pose.\n
- Reworked the realtime session lifecycle so the frontend no longer tears down its own websocket/audio path right after `session_ready`.
- Added binary `Blob` handling, playback queue/player-start trace hooks, and explicit cleanup boundaries for manual end, server close, error, and unmount.
- Tightened local soft interrupt behavior: greeting/speaking now require real playback to have started, a short arm delay, and a sustained speech streak before barge-in triggers. This avoids the page cutting off its own welcome TTS as soon as the speaker output leaks back into the mic.
- Added avatar presets for the panda GLB with deterministic camera framing and front-facing composition, then reduced idle motion amplitude to keep the figure stable.
- Swapped the plain starfield look for a stronger cockpit composition using layered 3D backdrop geometry plus CSS cockpit shell/light-bar overlays.
- Replaced the old chat-bubble subtitle stack with a bottom HUD subtitle bar and kept only the latest user/assistant lines.
- Added GLB preload and changed Suspense fallback to a placeholder avatar instead of text so the stage does not appear empty while the 46 MB model is still loading.
- Validation:
  - `frontend`: `npm run build` passed after each major change.
  - `backend`: `pytest` passed (`3 passed`).
  - Browser checks:
    - Chrome headless screenshot `output/web-game/chrome-idle-6s.png` shows the updated cockpit framing and front-facing panda.
    - Fake-media session trace plus backend `session_events` confirm greeting audio is produced (`first_tts_audio`) and, after the VAD gate change, the session no longer logs the previous immediate `soft_interrupt` during greeting.
- TODO / follow-up:
  - If the real kiosk microphone still picks up speaker output aggressively, tune `INTERRUPT_ARM_DELAY_MS`, `MIN_INTERRUPT_LEVEL`, and the speaker/mic placement together on site.
  - The default panda GLB is large; if startup still feels slow on the target machine, consider compressing or simplifying the asset rather than relying only on preload/fallback.
