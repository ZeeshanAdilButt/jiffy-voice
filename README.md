<h1 align="center">jiffy-voice</h1>

<p align="center">
  Spoken commands into typed time-tracking intents, locally, before anyone
  reaches for a model.
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
into something your app can act on, in under a millisecond, with nothing
over the network:

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

Most apps that want voice already have an assistant that can handle
anything: a model that reads a sentence and produces whatever actions it
implies. It is also a network round trip and a bill, and most of what
people say to a timer is "stop".

jiffy-voice is the tier in front of that one. It answers the common,
unambiguous utterances immediately and hands everything else on:

```
                  "start tracking my deen goal"
                               |
                   +-----------v-----------+
                   |      jiffy-voice      |   no model, no network
                   +-----------+-----------+
             +-----------------+------------------+
             v                 v                  v
          command           confirm            fallback
        run it now      ask, then run     your assistant takes it
```

Handing on is a return value, not an error. That is the part that makes the
arrangement work: forwarding an utterance has to be as ordinary an outcome
as handling one, or every consumer ends up writing a happy path with a
catch around it.

The other half is that the parsing itself is worth doing properly once.
Voice control usually arrives as string matching wedged into a UI
component: a regex for "start", another for "stop", a `.includes()`
somewhere for the goal name, and no test that survives the next phrasing a
real user tries. None of that has anything to do with a particular app's
data model, which is why it lives here instead.

It runs two ways from one core:

```
   embed it                          or run it
+------------------+          +----------------------+
|  your app        |          |  your app            |
|  +------------+  |          +----------+-----------+
|  |   jiffy    |  |               POST /commands
|  +------------+  |          +----------v-----------+
+------------------+          |  jiffy-voice         |
                              +----------------------+
```

Same core, same ports, same answers. Which one you use is a deployment
choice, not a rewrite.

## Contents

- [Install](#install)
- [Quickstart](#quickstart)
- [What it understands](#what-it-understands)
- [Resolving a name](#resolving-a-name)
- [Listening](#listening)
- [Driving a microphone button](#driving-a-microphone-button)
- [Other recognizers](#other-recognizers)
- [Confidence](#confidence)
- [Extending the vocabulary](#extending-the-vocabulary)
- [Running it as a service](#running-it-as-a-service)
- [Configuration](#configuration)
- [Kubernetes](#kubernetes)
- [Architecture](#architecture)
- [Status](#status)
- [Development](#development)
- [Releasing](#releasing)

## Install

```
npm install jiffy-voice
```

Node 20 or newer. Ships ESM and CJS builds with type declarations. The
package entry point imports nothing outside itself, so a browser bundle of
it carries only this code; express, jose, and pino are reached only through
the `jiffy-voice/server` subpath.

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

const outcome = await voice.interpret(transcript)

switch (outcome.kind) {
  case 'command':
    // Understood and resolved. Run it. No model was involved.
    apply(outcome.intent, outcome.target)
    break

  case 'confirm':
    // Understood, not sure enough. outcome.options is ranked, best first.
    ask(outcome.intent, outcome.options)
    break

  case 'fallback':
    // Not this package's problem. outcome.transcript is the raw words.
    await assistant.send(outcome.transcript)
    break
}
```

`interpret` is total over transcripts. Silence, nonsense, questions, and
whole workflows all come back as a `fallback` carrying exactly what was
said. It throws only when something it depends on breaks, never because of
what someone said, which is what makes the switch above exhaustive.

`outcome.reason` says why something fell through, and is worth logging. A
run of `no-matching-target` means the candidate list is wrong; a run of
`unrecognized-command` for the same phrasing is a vocabulary gap worth
filling.

Nothing is required: `createEmbeddedVoice()` with no arguments parses text
and hands back the spoken name unresolved.

Three runnable examples:

```
make example-embedded     # in process, against a candidate list
make example-fast-path    # the two tiers, with timings
make example-browser      # a page with a microphone button
```

The browser one is a single HTML file with no framework and no build step
of its own. It has a text box as well as a microphone, so it still
demonstrates the whole path from transcript onwards in a browser with no
speech engine.

## What it understands

| Intent           | Said as                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| `START_TRACKING` | start, start tracking X, begin, clock in on X, working on X                 |
| `STOP_TRACKING`  | stop, stop tracking, clock out, I'm done, wrap up                           |
| `PAUSE`          | pause, pause the timer, hold on, take a break                               |
| `RESUME`         | resume, unpause, continue, keep going, back to work                         |
| `LOG_TIME`       | log 30 minutes to X, I spent an hour and a half on X, bill 2 hours to X     |
| `CUSTOM`         | whatever you add. See [Extending the vocabulary](#extending-the-vocabulary) |

Durations are read as spoken: `30 minutes`, `1h 30m`, `half an hour`,
`an hour and a half`, `three quarters of an hour`, `90 seconds`.

Filler, politeness, and casing come off before matching, so "hey, can you
start tracking my deen goal please?" and "start tracking deen" reach the
same rule.

Anything else comes back as `UNKNOWN`. Acting on a misread command costs a
user more than being asked to repeat themselves, so the parser does not
guess:

- "cancel" is not a stop. One of those throws work away.
- "log time for my deen goal" has no duration in it, so it is not a valid
  log, and it is not promoted to a start either.
- A question is not a command. "What did I work on yesterday" contains
  "work on" and still parses as nothing.

One utterance is one command. A sentence holding two of them parses as the
first, and a sentence describing a whole workflow is exactly what the
fallback is for.

`VoiceIntent` is a discriminated union, so `durationMinutes` exists only on
`LOG_TIME` and `UNKNOWN` has no target field at all. Narrowing on `type` is
the only way to reach either.

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

Two cases come back as `null` rather than a guess: nothing scored above the
threshold, and the top two candidates were too close to tell apart. For the
second, `rank()` returns the full scored list, so you can ask which one
they meant instead of picking one.

If none of that fits, implement `TargetResolver` yourself. It receives the
spoken name and the command it came from, and returns one of your records
or nothing. Nothing else in the package notices.

## Listening

In a browser, `WebSpeechRecognizer` drives the engine that is already
there:

```ts
import { isWebSpeechSupported, WebSpeechRecognizer } from 'jiffy-voice'

if (!isWebSpeechSupported()) {
  // Firefox and every non-browser runtime land here. Offer a text field.
}
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
import { createEmbeddedVoice, VoiceSession, WebSpeechRecognizer } from 'jiffy-voice'

const voice = createEmbeddedVoice({ candidates })

const session = new VoiceSession({
  recognizer: new WebSpeechRecognizer(),
  // The second argument is the recognizer's whole answer when there was
  // one, so its alternatives survive rather than being dropped for a string.
  handle: (transcript, heard) => voice.interpret(heard ?? transcript),
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

## Other recognizers

Recognition has two ports because the two shapes are genuinely different.
An engine that owns the microphone and revises its guess as someone talks
is a `SpeechRecognizer`. One that takes bytes you already have and answers
once is a `SpeechToText`.

### React Native, and anything else with a platform engine

There is no Web Speech API outside the browser, and no one React Native
speech library worth depending on: the field has three, they disagree, and
any of them in the install path would put a native module in front of every
consumer including the ones running in a browser. So the shape is an
interface you implement, usually as about a dozen lines of forwarding:

```ts
import { NativeSpeechRecognizer, type NativeSpeechModule } from 'jiffy-voice'
import Voice from '@react-native-voice/voice'

const speech: NativeSpeechModule = {
  subscribe(events) {
    Voice.onSpeechPartialResults = (e) => events.onPartial(e.value ?? [])
    Voice.onSpeechResults = (e) => events.onResults(e.value ?? [])
    Voice.onSpeechError = (e) => events.onError({ code: e.error?.code })
    Voice.onSpeechEnd = () => events.onEnd()
    return () => void Voice.removeAllListeners()
  },
  start: ({ language }) => Voice.start(language ?? 'en-US'),
  stop: () => Voice.stop(),
  cancel: () => Voice.cancel(),
}

const recognizer = new NativeSpeechRecognizer(speech)
```

The adapter owns the awkward part, which is the same one the browser
adapter deals with: a session that ends exactly once, silence that is not
an error, a cancel that discards whatever arrives afterwards, and one
result per session however many events the engine emitted. Android's
numeric error codes and the string codes every other engine reports are
mapped to the same error classes, so a denied microphone is
`MicrophonePermissionDeniedError` wherever it came from.

### A cloud recognition API

`HttpSpeechToText` owns transport and leaves the provider-specific parts as
two functions, because a config format for request and response shapes
would only ever approximate them:

```ts
import { createEmbeddedVoice, HttpSpeechToText } from 'jiffy-voice'

const speechToText = new HttpSpeechToText({
  url: 'https://api.example.com/v1/transcribe',
  headers: { authorization: `Bearer ${key}` },
  parse: (body) => ({ transcript: body.text, confidence: body.confidence }),
})

const voice = createEmbeddedVoice({ candidates, speechToText })
const outcome = await voice.interpretAudio({ data, mimeType: 'audio/webm' })
```

It posts the bytes under the clip's own media type unless you pass
`buildRequest`, applies a timeout, and turns a non-2xx into a
`SpeechServiceError` carrying the status and the provider's message. Uses
the runtime's own fetch and nothing else.

Whichever you use, alternatives are worth passing. A reading that does not
parse falls through to the next one, which recovers the common case where
the top guess is "star tracking dean" and the second guess is right.

Silence comes back as a `fallback`, not an error. A recognizer that is down
throws `TranscriptionFailedError`.

## Confidence

Every command carries a score from 0 to 1. For audio it combines the
recognizer's confidence with the parser's, and the rule is that a
recognizer can lower the parser's score but never raise it: hearing a
phrase clearly does not make an ambiguous phrase less ambiguous. Below that
ceiling the two are averaged rather than multiplied, because they are two
estimates of the same thing rather than two gates that both have to pass.

The parser starts at 0.9 and adjusts: up when the whole utterance is a
known command, down when the phrase is ordinary speech as often as it is a
command ("done", "continue"), when the command sits behind words it could
not account for, and when a duration's unit had to be assumed.

Where the lines fall between running a command, asking about it, and
handing it on is the policy:

| Policy option          | Default | Meaning                                               |
| ---------------------- | ------- | ----------------------------------------------------- |
| `autoIntentConfidence` | 0.8     | At or above this, run it without asking               |
| `minIntentConfidence`  | 0.5     | Below this, not worth confirming either               |
| `autoTargetScore`      | 0.8     | At or above this, use the match without asking        |
| `ambiguityMargin`      | 0.05    | A runner-up this close means the audio did not choose |
| `maxOptions`           | 3       | How many candidates to carry for a prompt             |

Every default is a judgement about cost rather than a tuned number.
Starting a timer on the wrong goal is cheap to undo and expensive to
interrupt for, so the bar for asking sits below the bar for acting and well
above the bar for refusing.

For the layer underneath, `voice.voice.decideText()` returns a
`CommandDecision` with a `reason` and the ranked `options`, and
`classifyCommand` is the same logic as a pure function, so a host can
re-sort a decision against a different policy or a freshly loaded candidate
list without going back through recognition.

Setting `minConfidence` reports anything below it as `UNKNOWN` before the
policy sees it. The transcript and the score survive that downgrade, so you
can still show what was heard.

## Extending the vocabulary

Everything here adds to the built-in table rather than replacing it. An app
that says "clock on" as well as "clock in" wants both.

```ts
const voice = createEmbeddedVoice({
  candidates,
  kindWords: { sprint: 'category', client: 'category' },
  vocabulary: {
    phrases: [
      { phrase: 'clock on', type: 'START_TRACKING' },
      { phrase: 'knock off', type: 'STOP_TRACKING' },
      { phrase: 'invoice', type: 'LOG_TIME', needsDuration: true },
      { phrase: 'take five', type: 'CUSTOM', name: 'BREAK' },
    ],
    fillers: ['bitte'],
  },
})
```

`kindWords` merges over the defaults; mapping a word to `null` drops a
built-in one, which is how an app that means something else by "project"
says so.

Custom commands arrive as a single `CUSTOM` variant carrying a `name`
rather than as new `type` strings. Widening the discriminant to `string`
would cost every consumer their exhaustive switch to buy something only
some of them use:

```ts
if (intent.type === 'CUSTOM' && intent.name === 'BREAK') startBreak()
```

Repeating a phrase already in the table replaces its meaning rather than
doubling it, and `removePhrases` drops one outright, which is how you turn
off a loose match like "done" for an app where stopping is expensive.
`weak` and `needsDuration` work on added phrases exactly as they do on
built-in ones.

Added phrases go through the same folding and filler stripping a transcript
does, so an entry written the way someone would actually say it works.
Compilation is cached against the vocabulary object, so a parser built once
and used on every interim transcript pays for it once.

## Running it as a service

Same core, reached over HTTP instead of by function call. Useful when the
caller is not a JavaScript process, or when several are and you would
rather deploy the vocabulary once than ship it to each of them.

```
make up
```

Brings the service up on port 8080. Or mount the app in a process you
already run:

```ts
import { createHttpApp } from 'jiffy-voice/server'
```

One endpoint. The candidate list travels with the request, because the
service holds no state and has no way to know what your records are:

```
POST /commands
Authorization: Bearer <token>

{
  "transcript": "start tracking time for my deen goal",
  "candidates": [{ "id": "goal_42", "name": "Deen", "kind": "goal" }]
}
```

The response body is a `VoiceOutcome`, the same type `interpret` returns in
process, so a consumer shares one set of types across both modes and can
move between them without touching the code that reads the answer.

| Method | Path      | Purpose                                     |
| ------ | --------- | ------------------------------------------- |
| POST   | /commands | Interpret a transcript. 200 with an outcome |
| GET    | /health   | Liveness. Unauthenticated                   |
| GET    | /ready    | Readiness. Unauthenticated                  |

Errors: 400 for a malformed body, naming the field; 401 for a missing or
rejected token. An utterance the service cannot handle is not an error, it
is a 200 with a `fallback` outcome.

A request may override `wakeWords`, `kindWords`, `minConfidence`, and
`policy`, each falling back to the deployment default.

Tokens are verified through the same `TokenVerifier` interface the JWT
adapter implements, so a platform with its own scheme swaps the adapter
out. Worth being straight about what that buys here: the service resolves
against candidates the request supplies and keeps nothing between calls, so
the identity in the token decides nothing. The check is there to keep the
endpoint from being open, and to put a caller in the logs.

## Configuration

`createEmbeddedVoice` takes:

| Option          | Purpose                                                           |
| --------------- | ----------------------------------------------------------------- |
| `candidates`    | Array or function. Records the built-in resolver matches against  |
| `speechToText`  | Required only to accept audio                                     |
| `minConfidence` | Floor below which a command is reported as `UNKNOWN`. Default 0   |
| `wakeWords`     | Words your app is addressed by, stripped off the front            |
| `kindWords`     | What your users call each kind of thing. Merged over the defaults |
| `vocabulary`    | Extra phrasings, custom commands, and filler                      |
| `matching`      | `minScore` and `ambiguityMargin` for the resolver                 |
| `policy`        | Where the lines sit between running, asking, and handing on       |
| `parser`        | Replaces the rule-based parser                                    |
| `resolver`      | Replaces the fuzzy resolver                                       |

The service reads:

| Variable            | Required         | Purpose                                      |
| ------------------- | ---------------- | -------------------------------------------- |
| `JWT_SECRET`        | one of these two | HMAC secret for token verification           |
| `JWT_JWKS_URI`      |                  | JWKS endpoint, wins if both are set          |
| `PORT`              |                  | Defaults to 8080                             |
| `JWT_ISSUER`        |                  | Expected `iss` claim, if your tokens set one |
| `JWT_AUDIENCE`      |                  | Expected `aud` claim, if your tokens set one |
| `JWT_USER_ID_CLAIM` |                  | Claim holding the user id, defaults to `sub` |
| `WAKE_WORDS`        |                  | Comma-separated, applied to every request    |
| `MIN_CONFIDENCE`    |                  | Confidence floor, applied to every request   |
| `LOG_LEVEL`         |                  | Defaults to `info`                           |

## Kubernetes

Deployment, Service, ConfigMap, Secret template, and an HPA are in
[k8s/](./k8s/README.md).

```
make k8s-validate     # client-side validation, no cluster needed
make k8s-deploy       # applies k8s/ to the current context
```

Nothing coordinates between replicas and nothing needs to: every request
carries the candidate list it wants resolved and is answered from its own
body, so adding pods is the whole of horizontal scaling and losing one
costs nothing but the requests in flight on it.

## Architecture

Ports and adapters. The core (`src/core`, `src/domain`) has no framework,
model, or network dependency. It depends only on interfaces in `src/ports`,
and adapters implement them:

| Port               | Purpose                               | Implementations                                 |
| ------------------ | ------------------------------------- | ----------------------------------------------- |
| `SpeechRecognizer` | Live microphone to transcript         | `adapters/web-speech`, `adapters/native-speech` |
| `SpeechToText`     | Recorded audio to transcript          | `adapters/http-speech`                          |
| `IntentParser`     | Transcript to intent                  | `adapters/rule-based`                           |
| `TargetResolver`   | Spoken name to one of your record ids | `adapters/fuzzy`                                |
| `TokenVerifier`    | Service-mode auth                     | `adapters/jwt`                                  |

`VoiceCommandService` is the whole of the core: it holds the ports and
knows the order to call them in. `createEmbeddedVoice` is a thin factory
over it that picks sensible adapters, and `parseCommand` is the parser as a
plain synchronous function for callers that have a transcript already.

`src/http` and `src/server` are the service-mode adapters, reachable only
through the `jiffy-voice/server` subpath. Nothing under `src/index.ts`
imports anything in them, which is what keeps a web framework out of an
embedder's bundle.

## Status

Working and tested, but young. Treat the API as unstable until 1.0.

In place: both modes, both recognition ports with three adapters between
them, the decision and fallback layers, the extensibility surface,
Kubernetes manifests, and a tag-triggered release. Covered by 672 tests,
including an end-to-end suite that runs the real pieces together.

Known limits, none of them hidden anywhere else in this document:

- One utterance is one command. A sentence holding two parses as the
  first, and the second is lost rather than forwarded.
- English only. The folding step reduces text to lowercase ASCII, so an
  utterance in another script comes back empty, which reads as having
  heard nothing.
- `START_TRACKING` carries no duration, so "start tracking for 30 minutes"
  starts a timer and drops the 30 minutes.
- Nothing bundles a native speech module, by design. React Native hosts
  write the small wrapper shown above.
- The container image and the k8s manifests are validated but have not
  been run against a real daemon or cluster from this repository.

## Development

```
make help              # every target
make install
make test              # everything, including the end-to-end suite
make test-integration  # just the end-to-end suite
make check             # lint, typecheck, test, build
make up                # the service, in Docker
```

The end-to-end suite in `src/integration` runs the real recognizers,
parser, resolver, policy, and HTTP app together, faking only a browser's
speech engine, a phone's, and somebody's cloud API. It needs no
infrastructure, so it stays in the default run rather than behind a flag
nobody remembers to pass.

## Releasing

Push a tag matching `v*`. CI builds and pushes the container image to GHCR
and publishes the npm package.

The two halves are independent. The image needs no secret beyond the
repository's own token; the npm publish needs an `NPM_TOKEN` repository
secret, and skips with a warning rather than failing the run when there
isn't one.

That token has to be an **automation** token. A classic or granular token
belonging to an account with two-factor auth enabled gets a 403, because
there is no second factor for CI to supply.

## License

MIT
