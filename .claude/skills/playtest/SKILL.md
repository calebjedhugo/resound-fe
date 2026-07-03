---
name: playtest
description: Run a code-blind agent playtest of Resound focused on a specific area (e.g. "graphics", "ramps/vertical motion", "editor", "full loop"). Launches one browser-driving agent that knows the game rules but not the code, then reports findings for the designer to rule on. Use when the user says "/playtest <focus>", "playtest the game", or asks for a fresh-eyes UX round.
---

# Resound Code-Blind Playtest

One round = one code-blind agent playing the real game in a browser, followed
by a findings report **that you do not act on until the user rules on it**.

The agent's value is manufactured ignorance: it knows the game's RULES but
not the code, so it hits what real players hit. You (the coordinator) keep
code knowledge for diagnosis afterward.

## Inputs

- **Focus** (from the user's argument): the area to probe — e.g. `graphics`,
  `vertical motion up ramps`, `editor`, `song editor`, `full loop`.
  No argument = full editor→game→solve loop.

## Procedure — follow in order

### 1. Ensure the dev server is running

```bash
curl -sf http://localhost:5173/ >/dev/null && echo up || echo down
```

If down: run `npm start` in the project root with `run_in_background: true`,
then poll the same curl until `up`.

### 2. Read the briefing sources (both, fully)

- `.claude/playtest-game-rules.md` — game rules agents get for free, the
  EARS audio-perception snippets, controls, tab hygiene, iteration log.
- `DESIGN.md` — designer-confirmed intent. Anything listed there is NOT a
  bug; if the agent reports it, it goes in the "intended design" bucket.

### 3. Compose the agent prompt

Copy `agent-prompt-template.md` (next to this file) and fill every
`{{PLACEHOLDER}}` exactly as its inline comment says. For `{{FOCUS_MISSION}}`
write 4–8 concrete numbered steps that exercise the focus area, including
which puzzle to load or build (existing fixtures: `playtest-r1` is
intentionally broken, `playtest-r2`/`playtest-r3` are minimal solvable
puzzles). Steps must be verifiable actions ("walk up the ramp at (4,2) and
report the F3 elevation readout"), not vibes ("check ramps feel good").

### 4. Launch ONE agent

Use the Agent tool (subagent_type `general-purpose`, run_in_background:
true) with the filled template as the prompt. One agent, one round — never
several in parallel (they share one browser).

While waiting:
- Do NOT poll the agent's transcript file for liveness — writes are
  buffered and a healthy agent can look frozen. Wait for the completion
  notification.
- If an agent dies from a network error, resume it with SendMessage (its
  context survives) rather than relaunching, and tell it to skip work it
  already finished.
- Expect a round to take 30–90 minutes and roughly 200–600k subagent
  tokens.

### 5. Relay the report — and STOP

Summarize the agent's findings for the user in three buckets:

1. **Likely bugs** — with your code-side diagnosis where you can trace one.
2. **Possibly intended design** — anything that smells like a mechanic;
   check DESIGN.md first, and when in doubt put it here, not in bucket 1.
3. **Agent-environment artifacts** — synthetic-input quirks (can't hold
   keys, background-tab throttling, CDP user-activation) that wouldn't
   affect a human.

Propose fixes for bucket 1, then **wait for the user's ruling. Do not
implement anything, launch another round, or "quickly fix" anything before
the user answers.** This is a standing workflow rule (memory:
playtest-rounds-need-approval); it exists because an earlier round "fixed"
intentional gameplay.

### 6. After the ruling

- Implement only what was approved; run `npx jest --watchAll=false` and
  `npx eslint` on touched files.
- Anything ruled "intended design": add it to `DESIGN.md` (and the lean
  pointer in `CLAUDE.md` only if it's a top fix-temptation), don't code
  around it.
- Append one entry to the iteration log in
  `.claude/playtest-game-rules.md` (date, findings, rulings, fixes).
- Commit granularly if the user asked for commits.
- Offer (don't start) a scoped verification round for the fixes.

## Hard rules recap

- Agent is code-blind: browser tools only; the template encodes this.
- One browser tab, foreground, closed at the end (template encodes this).
- Findings are the user's to rule on — bug vs design is a designer call.
