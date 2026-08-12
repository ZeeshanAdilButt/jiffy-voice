<h1 align="center">jiffy-voice</h1>

<p align="center">
  Spoken commands into typed time-tracking intents, for apps that want
  voice control without owning the parsing.
</p>

<p align="center">
  <a href="https://github.com/ZeeshanAdilButt/jiffy-voice/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/ZeeshanAdilButt/jiffy-voice/actions/workflows/ci.yml/badge.svg">
  </a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-5FA04E?logo=node.js&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue">
</p>

A user says "start tracking time for my deen goal". jiffy-voice turns that
into something your app can act on:

```json
{
  "type": "START_TRACKING",
  "target": { "kind": "goal", "name": "deen" },
  "confidence": 0.9,
  "transcript": "start tracking time for my deen goal"
}
```

It does not know what a goal is. It knows there is a name in that sentence
and that the speaker wants to start tracking against it. Resolving "deen"
to a real record is your app's job, behind an interface this calls.

## Why

Voice control tends to arrive as a pile of string matching wedged into a
UI component: a regex for "start", another for "stop", a `.includes()`
somewhere for the goal name, and no test that survives the next phrasing a
real user tries. The parsing is the part worth writing once and testing
properly, and it has nothing to do with any particular app's data model.

So that is all this is. Audio or text goes in, a typed intent comes out.
Everything app-specific happens behind an interface you implement.

## Status

Early. The intent model, the ports, and the rule-based parser are in
place; target resolution and the wiring that ties them together are
landing next. Treat the API as unstable until 1.0.

## Install

```
npm install jiffy-voice
```

## Parsing

```ts
import { parseCommand } from 'jiffy-voice'

parseCommand('log an hour and a half to my deen goal')
// {
//   type: 'LOG_TIME',
//   target: { kind: 'goal', name: 'deen' },
//   durationMinutes: 90,
//   confidence: 0.9,
//   transcript: 'log an hour and a half to my deen goal'
// }
```

The parser is a fixed phrase table. No model, no network, no dependency,
and the same answer every time for the same input, which means the
phrasings it handles are the ones in its test suite and nothing else
quietly changes underneath you.

### What it understands

| Intent           | Said as                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `START_TRACKING` | start, start tracking X, begin, clock in on X, working on X             |
| `STOP_TRACKING`  | stop, stop tracking, clock out, I'm done, wrap up                       |
| `PAUSE`          | pause, pause the timer, hold on, take a break                           |
| `RESUME`         | resume, unpause, continue, keep going, back to work                     |
| `LOG_TIME`       | log 30 minutes to X, I spent an hour and a half on X, bill 2 hours to X |

Anything else comes back as `UNKNOWN` with the transcript attached.
Acting on a misread command costs a user more than being asked to repeat
themselves, so the parser does not guess: "cancel" is not a stop, and
"log time for my deen goal" with no duration in it is not a start.

Durations are read as spoken: `30 minutes`, `1h 30m`, `half an hour`,
`an hour and a half`, `three quarters of an hour`, `90 seconds`.

Filler, politeness, and casing are removed before matching, so "hey, can
you start tracking my deen goal please?" and "start tracking deen" reach
the same rule. One utterance is one command; a sentence holding two of
them parses as the first.

## Architecture

Ports and adapters. The core (`src/core`, `src/domain`) has no framework,
model, or network dependency. It depends only on interfaces in
`src/ports`, and adapters implement them:

| Port             | Purpose                               | Implementations       |
| ---------------- | ------------------------------------- | --------------------- |
| `SpeechToText`   | Audio to transcript                   | bring your own        |
| `IntentParser`   | Transcript to intent                  | `adapters/rule-based` |
| `TargetResolver` | Spoken name to one of your record ids | `adapters/fuzzy`      |

`TargetResolver` is the seam that keeps your domain out of this package.
It receives a name a human said out loud and returns whichever of your
records that was, or nothing.

## Development

```
make help          # every target
make install
make test
make check         # lint, typecheck, test, build
```

## License

MIT
