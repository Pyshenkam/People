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

2026-03-18
- User asked for a full stage rebuild: replace the side-facing panda, scrap the old ring backdrop, and make the avatar feel alive without relying on screenshot validation from Codex.
- Added `frontend/public/models/panda-v2.glb` from the user-provided asset and switched the local draft/published config in `data/museum.db` to `/models/panda-v2.glb`.
- Updated backend defaults so new installs and existing initialized stores migrate legacy `/models/default-avatar.glb` configs to `/models/panda-v2.glb`.
- Split panda presets so `panda-v2.glb` has its own front-facing camera/yaw/framing instead of inheriting the old astronaut preset.
- Rebuilt `AvatarStage.tsx` around a starship observation-window composition: window frame, consoles, reflective deck, starfield/cloud depth, and postprocessing (`@react-three/postprocessing`).
- Replaced the old tiny idle motion with phase-driven procedural animation over head/neck/spine/clavicle/arm bones so idle, greeting, listening, thinking, and speaking look different even without embedded GLB clips.
- Validation:
  - `frontend`: `npm run build` passed after adding the new stage and postprocessing.
  - `backend`: `pytest` passed (`5 passed`), including a new store test for avatar URL migration.
- TODO / follow-up:
  - Visual tuning is still expected with the user's real screenshots: the front-facing yaw and arm gesture axes are now much better grounded in the rig, but they may still need amplitude trimming based on what the user sees.
  - `VisitorPage` chunk size crossed Vite's warning threshold after the stage rebuild. It still builds fine, but if kiosk load time becomes an issue, consider splitting heavier 3D/postprocessing code.

- Follow-up after user screenshot review:
  - The live page the user is currently seeing is still serving `/models/default-avatar.glb` from `data/museum.db`, not `panda-v2.glb`, so the orientation fix needed to target the current astronaut panda preset first.
  - Compared against `D:\DeLu\Chat\eye`: that project keeps the character front-facing by locking the whole model to a stable base yaw and keeping motion offsets small around it.
  - Fixed `frontend/src/avatar/presets.ts` by restoring the panda-family presets to a front-facing positive yaw (`Math.PI / 2`) and slightly re-centering the camera target/camera X offset.
  - Reduced whole-body yaw sway in `frontend/src/avatar/adapter.ts` so the panda stays near-front even during idle/thinking.
  - Validation:
    - `frontend`: `npm run build` passed after the orientation correction.

- Cleanup after user requested removing the old panda path:
  - Confirmed the user launches with `start-local.bat`, which delegates to `start-local.ps1`; the old panda kept coming back because that PowerShell script still copied and published `default-avatar.glb`.
  - Updated `start-local.ps1` to use `/models/panda-v2.glb` only, sourcing from the repo-root `panda-V2.glb` when present and otherwise using the committed `frontend/public/models/panda-v2.glb`.
  - Simplified `frontend/src/avatar/presets.ts` to a single panda preset instead of keeping separate legacy/new panda presets.
  - Deleted `frontend/public/models/default-avatar.glb`.
  - Re-ran `backend/bootstrap_defaults.py` with `DEFAULT_AVATAR_URL=/models/panda-v2.glb`; local `data/museum.db` draft + latest published config now both resolve to `/models/panda-v2.glb`.
  - Validation:
    - `frontend`: `npm run build` passed after cleanup.
    - `backend`: `pytest` passed (`5 passed`).

- Follow-up investigation for persistent side-facing panda:
  - Confirmed current runtime config is not the old avatar path: both `config_versions` latest published row and `draft_config` resolve to `/models/panda-v2.glb`.
  - The effective orientation lock is in `frontend/src/components/AvatarStage.tsx`: `fitRoot.rotation.y = preset.modelYaw` is used during fitting, and `root.current.rotation.set(..., preset.modelYaw + rigOffset.rotation[1], ...)` rewrites the loaded avatar root rotation on every frame.
  - `frontend/src/avatar/presets.ts` currently sets `pandaPreset.modelYaw` to `0`, so the stage preserves the GLB's native forward axis. If the asset's authored forward direction is sideways, the avatar will stay sideways.
  - `frontend/src/avatar/adapter.ts` is not the source of the 90-degree turn: `driveAvatar()` currently returns `rotation[1] = 0`, so runtime animation adds no yaw.
  - `CameraRig` only calls `camera.lookAt(...)`; it affects the camera, not the model orientation.

- Applied the orientation fix after confirming the control chain:
  - Updated `frontend/src/avatar/presets.ts` so the panda preset uses `modelYaw = Math.PI / 2`, restoring a stable front-facing base yaw for `panda-v2.glb`.
  - Kept the change minimal on purpose because `AvatarStage` already applies `preset.modelYaw` consistently during fit-time and every frame at runtime.
  - Validation:
    - `frontend`: `npm run build` passed after the yaw fix.

- Final orientation verification after the user still saw a side profile:
  - Reconfirmed the live local backend on `http://127.0.0.1:4810/` was serving the latest built bundle (`frontend/dist/index.html` -> `/assets/index-DWKX0aW3.js`).
  - Verified the current panda preset is now camera-driven rather than yaw-driven: `modelYaw` remains `0`, and the front-facing composition comes from the updated `cameraPosition` / `cameraTarget`.
  - Captured a fresh Playwright screenshot at `output/web-game/orientation-camera/shot-0.png`; the panda is now front-facing / slight 3-quarter view instead of the previous pure side profile.
  - Conclusion: the latest local code path is visually corrected; any remaining side-facing view on the user's machine is most likely from an older running process or stale page that has not reloaded the newest bundle yet.

- Repo-level text normalization follow-up:
  - Added root `.editorconfig` with `utf-8`, `lf`, `insert_final_newline = true`, and `trim_trailing_whitespace = true`.
  - Added root `.gitattributes` with `* text=auto eol=lf` plus binary markers for common assets (`.glb`, `.hdr`, images, fonts, audio/video, `.db`) so Git does not treat them as text.
