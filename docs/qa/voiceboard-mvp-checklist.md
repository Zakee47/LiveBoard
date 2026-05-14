# VoiceBoard MVP QA / E2E checklist

This checklist is scoped to the bootstrap scaffold available on `devin/liveboard-bootstrap`.
Automated coverage must stay deterministic by using mocked Realtime events. Manual real OpenAI validation is parent-session-owned and should be run separately with `OPENAI_API_KEY` once the full app shell exists.

## Deterministic CI harness

Run:

```sh
npm run qa:voiceboard
```

The harness validates the currently available voice contracts:

- Push-to-talk state transitions through idle, listening, processing, and responding.
- Mock Realtime text path emits user/assistant transcript entries and deterministic state changes.
- Tool definitions expose create, update, delete, connect, layout, and critique function schemas.
- Action bridge calls tldraw editor operations for create, update, delete, connect, layout, and critique actions.
- MVP checklist coverage stays explicit as scaffold support evolves.

## Golden paths

| Golden path | Deterministic status | Notes |
| --- | --- | --- |
| Hold spacebar/button state transitions | Partial automated | Current scaffold exposes `PushToTalkController`; browser keyboard/button UI is not scaffolded yet. |
| Mock voice command creates frontend/API/Postgres architecture within 2s | Planned mocked E2E | Requires architecture command parser, shape semantics, API route, and persistence contracts. |
| Select API shape and “Rename this to Auth Service” | Planned mocked E2E | Requires selection-aware rename command contract. |
| Name-based reference moves/updates database | Planned mocked E2E | Requires name registry/resolver and database shape contract. |
| Ambiguous “move the box” with multiple boxes yields clarification | Planned mocked E2E | Requires ambiguity detection/clarification UI or transcript contract. |
| “Clean this up” triggers layout | Partial automated | Current `layout_shapes` tool and action bridge are covered; natural-language routing is not scaffolded yet. |
| “What is wrong with this?” writes text critique to chat panel | Partial automated | Current `critique_canvas` tool and stub result are covered; chat panel is not scaffolded yet. |
| Simple actions silent vs multi-step narration hook | Planned mocked E2E | Requires narration policy/hook contract. |
| Transcript collapse/expand and entries | Planned browser/manual | Requires transcript panel UI. Current transcript event emission is covered through `MockVoiceSessionManager`. |
| Text chat fallback invokes same action path | Partial automated | Current text path is covered through `sendText`; shared action routing is not scaffolded yet. |

## Manual real OpenAI validation

Do not run this in deterministic CI. The parent session will validate it later.

Prerequisites:

- App shell with browser UI and Realtime integration.
- `OPENAI_API_KEY` available in the runtime environment.
- A clean test board/canvas.

Manual pass criteria:

1. Hold-to-talk works with the real Realtime session and returns to idle after release.
2. The architecture creation prompt completes within 2 seconds from final transcript to visible canvas update under normal network conditions.
3. Each golden path above behaves the same through voice and text fallback.
4. Real API failures surface as user-facing error/clarification states without mutating the canvas unexpectedly.
5. No real OpenAI dependency is required for committed CI tests.

## Integration risks

- The bootstrap scaffold has no app shell, browser UI, API layer, Postgres layer, or migrations yet.
- There is no natural-language command router contract yet for architecture creation, references, ambiguity, narration, or critique-to-chat behavior.
- The 2-second success criterion will need clock instrumentation around mocked command completion to avoid CI flake.
- Browser E2E can be added once the Vite entrypoint and VoiceBoard UI components exist.
