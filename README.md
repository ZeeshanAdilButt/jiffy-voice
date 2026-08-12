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
and that the speaker wants to start tracking against it. Turning "deen"
into a real record happens behind an interface, and that interface is
yours.

## Why

Voice control tends to arrive as a pile of string matching wedged into a
UI component: a regex for "start", another for "stop", a `.includes()`
somewhere for the goal name, and no test that survives the next phrasing a
real user tries. The parsing is the part worth writing once and testing
properly, and it has nothing to do with any particular app's data model.

So that is all this is. Audio or text goes in, a typed command comes out.
Everything app-specific happens behind a port you fill in.

## Contents

- [Install](#install)
- [Quickstart](#quickstart)
- [What it understands](#what-it-understands)
- [Resolving a name](#resolving-a-name)
- [Listening](#listening)
- [Driving a microphone button](#driving-a-microphone-button)
- [Speech to text](#speech-to-text)
- [Confidence](#confidence)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Status](#status)
- [Development](#development)

## Install

```
npm install jiffy-voice
```

Node 20 or newer. Ships ESM and CJS builds with type declarations, and has
no runtime dependencies.

## Quickstart

```ts
import { createEmbeddedVoice } from 'jiffy-voice'

const voice = createEmbeddedVoice({
  // Whatever your app already has. Only the parts matching needs.
  candidates: () => [
    { id: 'goal_42', name: 'Deen', kind: 'goal', aliases: ['Islamic Studies'] },
    { id: 'goal_43', name: 'Fitness', kind: 'goal' },
    { id: 'task_7', name: 'Invoices', kind: 'task' },
  ],
})

const { intent, target } = await voice.handleText('start tracking time for my deen goal')

if (intent.type === 'START_TRACKING' && target !== null) {
  startTimer(target.id) // goal_42
}
```

`handleAudio(clip)` is the same call with a recording instead of a string,
once a [`SpeechToText`](#speech-to-text) adapter is configured.

Every part is replaceable and nothing is required: `createEmbeddedVoice()`
with no arguments parses text and hands back the spoken name unresolved.

A runnable version, including a misheard name and a command it refuses:

```
make example-embedded
```

## What it understands

| Intent           | Said as                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `START_TRACKING` | start, start tracking X, begin, clock in on X, working on X             |
| `STOP_TRACKING`  | stop, stop tracking, clock out, I'm done, wrap up                       |
| `PAUSE`          | pause, pause the timer, hold on, take a break                           |
| `RESUME`         | resume, unpause, continue, keep going, back to work                     |
| `LOG_TIME`       | log 30 minutes to X, I spent an hour and a half on X, bill 2 hours to X |

Durations are read as spoken: `30 minutes`, `1h 30m`, `half an hour`,
`an hour and a half`, `three quarters of an hour`, `90 seconds`.

Filler, politeness, and casing come off before matching, so "hey, can you
start tracking my deen goal please?" and "start tracking deen" reach the
same rule.

Anything else comes back as `UNKNOWN` with the transcript attached. Acting
on a misread command costs a user more than being asked to repeat
themselves, so the parser does not guess:

- "cancel" is not a stop. One of those throws work away.
- "log time for my deen goal" has no duration in it, so it is not a valid
  log, and it is not promoted to a start either.
- A question is not a command. "What did I work on yesterday" contains
  "work on" and still parses as nothing.

One utterance is one command. A sentence holding two of them parses as the
first.

`VoiceIntent` is a discriminated union, so `durationMinutes` exists only on
`LOG_TIME` and `UNKNOWN` has no target field at all. Narrowing on `type`
is the only way to reach either.

## Resolving a name

The parser gives you the name a person said. Turning that into one of your
records is the `TargetResolver` port, and `FuzzyTargetResolver` covers it
for a candidate list you supply:

```ts
import { FuzzyTargetResolver } from 'jiffy-voice'

const resolver = new FuzzyTargetResolver(() => loadGoals())

await resolver.resolve({ kind: 'goal', name: 'dean' })
// { id: 'goal_42', name: 'Deen', kind: 'goal', score: 0.85, matchedOn: 'Deen' }
```

Scoring is deterministic and tolerant of the mistakes recognizers actually
make: a wrong vowel, a transposition, a plural, a compound word split in
two, a name said in part. Pass a function rather than an array when the
list changes; it is called on every command.

Two cases come back as `null` rather than a guess: nothing scored above
the threshold, and the top two candidates were too close to tell apart.
For the second, `rank()` returns the full scored list, so you can ask
which one they meant instead of picking one.

If none of that fits, implement `TargetResolver` yourself. It receives the
spoken name and the command it came from, and returns one of your records
or nothing. Nothing else in the package notices.

## Listening

In a browser, `WebSpeechRecognizer` drives the engine that is already there:

```ts
import { isWebSpeechSupported, WebSpeechRecognizer } from 'jiffy-voice'

if (!isWebSpeechSupported()) {
  // Firefox and every non-browser runtime land here. Offer a text field.
}

const recognizer = new WebSpeechRecognizer({ language: 'en-US' })

const session = recognizer.start({
  onInterim: (words) => showWhileSpeaking(words),
  onResult: async ({ transcript }) => {
    if (transcript.length > 0) apply(await voice.handleText(transcript))
  },
  onError: (error) => showProblem(error),
})

micButton.onpointerup = () => session.stop()
escapeKey.onpress = () => session.abort()
```

Nothing is read from the global object until `start`, so the import is safe
in a server bundle. A denied microphone, a missing one, and an unreachable
recognition service arrive as `MicrophonePermissionDeniedError`,
`AudioCaptureError`, and `RecognizerNetworkError`. Silence does not arrive
as an error at all: it ends the session with an empty transcript, because
hearing nothing is an answer.

## Driving a microphone button

`VoiceSession` is the interaction itself as a state machine, with no UI
framework anywhere in it. The same object drives a web app and a React
Native one:

```ts
import { VoiceSession, WebSpeechRecognizer } from 'jiffy-voice'

const session = new VoiceSession({
  recognizer: new WebSpeechRecognizer(),
  handle: (transcript) => voice.handleText(transcript),
})

session.subscribe((state) => render(state))

button.onpointerdown = () => session.start()
button.onpointerup = () => session.stop()
escape.onpress = () => session.cancel()
```

```
idle --start--> listening --stop or a settled transcript--> processing
processing --handled--> result
listening or processing --a real failure--> error
anything --cancel--> idle
```

`state` is one frozen object replaced on every change and `subscribe`
returns its own unsubscribe, which is exactly the contract
`useSyncExternalStore` wants. The package does not import React to say so.

`state.interimTranscript` holds the words as they arrive, for showing while
someone talks. `state.transcript` is what the recognizer settled on, and an
empty one means it heard nothing: `heardNothing(state)` distinguishes that
from a command that ran. A cancel at any point abandons the session, and a
handler that resolves afterwards is discarded rather than written over the
state that replaced it.

## Speech to text

For a recognizer you feed audio to instead, implement `SpeechToText`:

```ts
import { createEmbeddedVoice, type SpeechToText } from 'jiffy-voice'

const speechToText: SpeechToText = {
  async transcribe(clip) {
    const heard = await myRecognizer.run(clip.data, clip.mimeType)
    return {
      transcript: heard.best,
      confidence: heard.confidence,
      alternatives: heard.rest, // optional, and worth passing
    }
  },
}

const voice = createEmbeddedVoice({ candidates, speechToText })
const { intent, target } = await voice.handleAudio({ data, mimeType: 'audio/webm' })
```

Alternatives are worth passing. A reading that does not parse falls through
to the next one, which recovers the common case where the top guess is
"star tracking dean" and the second guess is right.

Silence comes back as an `UNKNOWN` command, not an error. A recognizer that
is down throws `TranscriptionFailedError`.

## Confidence

Every command carries a score from 0 to 1. For audio it is the recognizer's
confidence multiplied by the parser's, which are two independent chances to
be wrong.

The parser starts at 0.9 and adjusts: up when the whole utterance is a
known command, down when the phrase is ordinary speech as often as it is a
command ("done", "continue"), when the command sits behind words it could
not account for, and when a duration's unit had to be assumed.

Set `minConfidence` to have anything below it reported as `UNKNOWN`
instead. The transcript and the score survive that downgrade, so you can
still show what was heard.

## Configuration

`createEmbeddedVoice` takes:

| Option          | Purpose                                                          |
| --------------- | ---------------------------------------------------------------- |
| `candidates`    | Array or function. Records the built-in resolver matches against |
| `speechToText`  | Required only to accept audio                                    |
| `minConfidence` | Floor below which a command is reported as `UNKNOWN`. Default 0  |
| `wakeWords`     | Words your app is addressed by, stripped off the front           |
| `kindWords`     | What your users call each kind of thing. Replaces the defaults   |
| `matching`      | `minScore` and `ambiguityMargin` for the resolver                |
| `parser`        | Replaces the rule-based parser                                   |
| `resolver`      | Replaces the fuzzy resolver                                      |

`kindWords` maps a spoken word to `goal`, `task`, or `category`. The
defaults cover the obvious ones; an app whose users say "sprint" or
"client" supplies its own.

## Architecture

Ports and adapters. The core (`src/core`, `src/domain`) has no framework,
model, or network dependency. It depends only on interfaces in `src/ports`,
and adapters implement them:

| Port               | Purpose                               | Implementations       |
| ------------------ | ------------------------------------- | --------------------- |
| `SpeechRecognizer` | Live microphone to transcript         | `adapters/web-speech` |
| `SpeechToText`     | Recorded audio to transcript          | bring your own        |
| `IntentParser`     | Transcript to intent                  | `adapters/rule-based` |
| `TargetResolver`   | Spoken name to one of your record ids | `adapters/fuzzy`      |

Recognition has two ports rather than one because the two are genuinely
different shapes. A cloud recognizer takes bytes you already have and
answers once; a browser engine owns the microphone, has no bytes to hand
over, and revises its guess as someone talks.

`VoiceCommandService` is the whole of the core: it holds the ports and
knows the order to call them in. `createEmbeddedVoice` is a thin
factory over it that picks sensible adapters.

`parseCommand` is the parser as a plain synchronous function, for callers
that have a transcript already and would rather not await anything.

## Status

Working and tested, but young. The intent model, both adapters, and the
embedded entry point are in place and covered by 372 tests. Treat the API
as unstable until 1.0.

Recognizers, a standalone service mode, and a larger phrase vocabulary are
not here yet.

## Development

```
make help          # every target
make install
make test
make check         # lint, typecheck, test, build
```

## License

MIT
