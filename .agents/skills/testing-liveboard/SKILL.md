---
name: testing-liveboard
description: Test LiveBoard/VoiceBoard PRs end-to-end with local mocked Realtime UI checks and deterministic harness commands.
---

# Testing LiveBoard / VoiceBoard

Use this skill when validating LiveBoard VoiceBoard UI or voice-contract PRs. Keep validation deterministic unless the user explicitly asks for real OpenAI testing.

## Devin Secrets Needed

- `OPENAI_API_KEY` — only needed for manual real OpenAI Realtime validation. Do not request it for the mocked CI/runtime checks.

## Local setup

1. Install dependencies if needed:
   ```sh
   npm --prefix /home/ubuntu/repos/LiveBoard install
   ```
2. Start the local app:
   ```sh
   npm --prefix /home/ubuntu/repos/LiveBoard run dev -- --host 0.0.0.0
   ```
3. Open `http://localhost:5173` in the browser.
4. If you need a clean canvas for runtime testing, clear browser storage/IndexedDB and reload before recording.

## Mocked UI smoke flow

1. Verify the initial app state:
   - `VoiceBoard MVP` header is visible.
   - State badge is `idle`.
   - Activity copy is `Ready for push-to-talk.`
   - Bottom button is `Hold to talk`.
   - Transcript includes `VoiceBoard scaffold is running with mocked realtime voice behavior.`
2. Click `Hold to talk`.
   - Expect state `listening`.
   - Expect activity copy `Listening through mocked local session.`
   - Expect bottom button `Stop voice`.
3. Click `Run mock action`.
   - Expect a canvas shape labeled `Mock voice action`.
   - Expect transcript entries including `Created 1 shape.`, `Create a simple sticky-note idea on the board.`, and the mocked assistant response.
4. Click `Stop voice`.
   - Expect state `idle` and bottom button `Hold to talk`.
   - Existing transcript entries should remain visible.

## Deterministic command checks

Run these from the repo after UI validation:

```sh
npm --prefix /home/ubuntu/repos/LiveBoard test
npm --prefix /home/ubuntu/repos/LiveBoard run typecheck
npm --prefix /home/ubuntu/repos/LiveBoard run build
```

Expected notes:
- `npm test` should print five PASS lines from `scripts/voiceboard-qa-harness.ts`.
- Voice tool coverage may include actions such as create/update/delete/connect/layout/critique as the scaffold evolves.
- `npm run build` may show a Vite large chunk warning; treat it as non-blocking unless the command exits non-zero.

## PR test report expectations

- Record browser-based runtime testing with annotations.
- Include screenshots for initial state, mock action result, and final idle state.
- Post exactly one PR comment for a test pass/retest round with escalations first, then assertion bullets.
- Attach the test report and recording in the final user message.

## Current limitations to call out

- Real OpenAI validation is manual and requires `OPENAI_API_KEY`.
- Natural-language golden paths such as architecture creation, rename by selection, name-based references, ambiguity clarification, layout cleanup, critique, narration policy, transcript collapse/expand, and shared text/voice routing might remain planned until the relevant UI/command contracts land.
