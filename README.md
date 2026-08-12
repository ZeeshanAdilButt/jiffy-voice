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

For an app whose voice already goes to an assistant, that is the difference
between a timer that starts while the thumb is still on the button and one
that starts after a round trip and a model call. Most of what anyone says to
a timer is "stop", and spending a second and a fraction of a cent working
that out is the wrong trade.

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

## Is this for you?

Worth having when:

- Speech or free text in your app already reaches a general assistant, and
  a handful of commands account for most of it. That ratio is what a fast
  tier is paid out of.
- The commands name things: goals, tasks, clients, whatever your users
  call them. Matching a spoken name against a live record list is the part
  that does not survive being a regex.
- You want the timer to answer with the network down, the model rate
  limited, or the user on a train.

Probably not worth it when:

- Your command set is two phrases with no name in them. A regex is smaller
  than a dependency.
- Everything already goes to a model and both the latency and the bill are
  fine where they are. A second tier only pays for itself when the first
  one answers often.
- Most of what your users say is multi-step, or asks a question, or is not
  in English. Those are all fallbacks here, and a fast path that never
  answers is just a hop.

## Contents

- [Install](#install)
- [Quickstart](#quickstart)
- [Integrating it](#integrating-it)
  - [React, in a browser](#react-in-a-browser)
  - [React Native](#react-native)
  - [Node and other backends](#node-and-other-backends)
  - [As a service](#as-a-service)
- [The two tiers together](#the-two-tiers-together)
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

## Integrating it

Four complete integrations, one per place this tends to be used. Each is
self-contained: paste the file, point `candidates` at your own records, and
it runs. None of them is a fragment that needs another section to be
assembled first.

The reference sections further down go deeper on each piece:
[Resolving a name](#resolving-a-name), [Listening](#listening),
[Confidence](#confidence), and
[Extending the vocabulary](#extending-the-vocabulary).

### React, in a browser

The browser already has a speech engine, so nothing is installed beyond this
package. `WebSpeechRecognizer` drives the engine, `VoiceSession` is the
interaction as a state machine, and `useSyncExternalStore` reads it. The
package imports no React to make that work: the session is a plain store
with a frozen state object and a subscribe that returns its own unsubscribe.

```tsx
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  createEmbeddedVoice,
  heardNothing,
  isWebSpeechSupported,
  MicrophonePermissionDeniedError,
  VoiceSession,
  WebSpeechRecognizer,
  type TargetCandidate,
  type VoiceOutcome,
} from 'jiffy-voice'

// Whatever your app already has loaded. Passed as a function rather than an
// array because it is read on every command, so a list that changes while
// the user works stays current.
function candidates(): TargetCandidate[] {
  return [
    { id: 'goal_42', name: 'Deen', kind: 'goal', aliases: ['Islamic Studies'] },
    { id: 'goal_43', name: 'Fitness', kind: 'goal' },
    { id: 'task_7', name: 'Invoices', kind: 'task' },
  ]
}

const voice = createEmbeddedVoice({ candidates })

function createSession() {
  return new VoiceSession({
    recognizer: new WebSpeechRecognizer({ language: 'en-US' }),
    // The second argument is the recognizer's whole answer when there was
    // one, so its alternatives survive rather than being dropped for a
    // string. A second reading often parses when the first does not.
    handle: (transcript, heard) => voice.interpret(heard ?? transcript),
  })
}

export function useVoiceSession() {
  // Lazy initializer, so one session survives every re-render.
  const [session] = useState(createSession)

  const subscribe = useCallback((onChange: () => void) => session.subscribe(onChange), [session])
  const getState = useCallback(() => session.state, [session])

  // state is one frozen object replaced on every change, which is exactly
  // what useSyncExternalStore wants. Nothing reads the global object until
  // start, so the same snapshot is safe to render on a server.
  return { session, state: useSyncExternalStore(subscribe, getState, getState) }
}

export function MicButton({ onOutcome }: { onOutcome: (outcome: VoiceOutcome) => void }) {
  const { session, state } = useVoiceSession()

  // Read after mount so a server-rendered tree and the first client render
  // agree before the answer changes anything.
  const [supported, setSupported] = useState(true)
  useEffect(() => {
    setSupported(isWebSpeechSupported())
  }, [])

  useEffect(() => {
    if (state.status === 'result' && state.result !== null) onOutcome(state.result)
  }, [state, onOutcome])

  // Firefox and every browser without a speech engine land here. Everything
  // downstream of the transcript is identical, so a text field is a complete
  // fallback rather than a degraded one.
  if (!supported) {
    return <TranscriptField onSubmit={(text) => void voice.interpret(text).then(onOutcome)} />
  }

  const denied = state.error instanceof MicrophonePermissionDeniedError

  return (
    <div>
      <button
        onPointerDown={() => session.start()}
        onPointerUp={() => session.stop()}
        onPointerLeave={() => session.stop()}
        disabled={state.status === 'processing'}
      >
        {state.status === 'listening' ? 'Listening' : 'Hold to talk'}
      </button>
      <button onClick={() => session.cancel()} disabled={state.status === 'idle'}>
        Cancel
      </button>

      {/* Words as they arrive, for showing only. Nothing acts on these. */}
      <p>{state.interimTranscript || state.transcript}</p>

      {heardNothing(state) && <p>Did not catch that.</p>}
      {denied && <p>Microphone access is off for this site. Turn it on in your browser.</p>}
      {state.error !== null && !denied && <p>{state.error.message}</p>}
    </div>
  )
}

function TranscriptField({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (text.trim().length > 0) onSubmit(text)
      }}
    >
      <input value={text} onChange={(event) => setText(event.target.value)} />
      <button type="submit">Interpret</button>
    </form>
  )
}
```

The four things that component is handling, and why each is its own case:

- `state.interimTranscript` is the words as they arrive, and is empty once
  the transcript settles. Showing it is the whole reason a hold-to-talk
  button feels like it is listening.
- `heardNothing(state)` is silence, which ends the session with an empty
  transcript rather than an error. It is a different thing from a command
  that ran and a different thing from a failure, and a UI that conflates
  them tells the user to check their microphone when they simply said
  nothing.
- A denied microphone arrives as `MicrophonePermissionDeniedError`, which is
  worth its own message because it is the one failure the user can fix.
  `AudioCaptureError` and `RecognizerNetworkError` arrive the same way.
- `isWebSpeechSupported()` answers false in Firefox and in every non-browser
  runtime. Nothing is read from the global object until `start`, so
  importing the recognizer in a server bundle is harmless and only the
  feature check has to wait for the client.

Hold to talk rather than a silence timer, because the speaker decides when
they have finished. `session.cancel()` abandons whatever is in flight; a
handler that resolves after it is discarded rather than written over the
state that replaced it.

### React Native

There is no Web Speech API here, and this package deliberately ships no
native dependency: the field has three speech libraries, they disagree, and
any of them in the install path would put a native module in front of every
consumer including the ones running in a browser.

So the first block is yours. It is the only part that knows which library
you picked.

```ts
import Voice from '@react-native-voice/voice'
import { type NativeSpeechModule } from 'jiffy-voice'

const speech: NativeSpeechModule = {
  subscribe(events) {
    Voice.onSpeechPartialResults = (e) => events.onPartial(e.value ?? [])
    Voice.onSpeechResults = (e) => events.onResults(e.value ?? [])
    Voice.onSpeechError = (e) => events.onError({ code: e.error?.code, message: e.error?.message })
    Voice.onSpeechEnd = () => events.onEnd()

    return () => {
      void Voice.removeAllListeners()
    }
  },
  start: ({ language }) => Voice.start(language ?? 'en-US'),
  stop: () => Voice.stop(),
  cancel: () => Voice.cancel(),
}
```

Everything after that is the package's, and is the same session and the same
state machine the browser uses. Only the recognizer changed.

```tsx
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  createEmbeddedVoice,
  heardNothing,
  MicrophonePermissionDeniedError,
  NativeSpeechRecognizer,
  VoiceSession,
  type TargetCandidate,
  type VoiceOutcome,
} from 'jiffy-voice'

function candidates(): TargetCandidate[] {
  return [
    { id: 'goal_42', name: 'Deen', kind: 'goal', aliases: ['Islamic Studies'] },
    { id: 'goal_43', name: 'Fitness', kind: 'goal' },
    { id: 'task_7', name: 'Invoices', kind: 'task' },
  ]
}

const voice = createEmbeddedVoice({ candidates })

function createSession() {
  return new VoiceSession({
    recognizer: new NativeSpeechRecognizer(speech, { language: 'en-US' }),
    handle: (transcript, heard) => voice.interpret(heard ?? transcript),
  })
}

export function MicButton({ onOutcome }: { onOutcome: (outcome: VoiceOutcome) => void }) {
  const [session] = useState(createSession)

  const subscribe = useCallback((onChange: () => void) => session.subscribe(onChange), [session])
  const getState = useCallback(() => session.state, [session])
  const state = useSyncExternalStore(subscribe, getState, getState)

  useEffect(() => {
    if (state.status === 'result' && state.result !== null) onOutcome(state.result)
  }, [state, onOutcome])

  // Android reports numeric error codes and everything else reports strings.
  // Both map to the same class, so this one check covers both platforms.
  const denied = state.error instanceof MicrophonePermissionDeniedError

  return (
    <View>
      <Pressable
        onPressIn={() => session.start()}
        onPressOut={() => session.stop()}
        disabled={state.status === 'processing'}
      >
        <Text>{state.status === 'listening' ? 'Listening' : 'Hold to talk'}</Text>
      </Pressable>

      <Text>{state.interimTranscript || state.transcript}</Text>

      {heardNothing(state) && <Text>Did not catch that.</Text>}
      {denied && <Text>Microphone access is off. Turn it on in Settings.</Text>}
      {state.error !== null && !denied && <Text>{state.error.message}</Text>}
    </View>
  )
}
```

`NativeSpeechRecognizer` owns the awkward part, which is the same one the
browser adapter deals with: a session that ends exactly once, silence that
is not an error, a cancel that discards whatever arrives afterwards, and one
result per session however many events the engine emitted. Asking the OS for
microphone permission before the first `start` is still yours, as it always
is on a phone.

### Node and other backends

The text is already in hand: a transcription service answered, a chat
message arrived, a webhook fired. There is no recognizer and no session,
only `interpret`. This is the smallest integration in the document.

```ts
import { createEmbeddedVoice, type TargetCandidate, type VoiceOutcome } from 'jiffy-voice'

// Yours: whatever this user could be tracking against, flattened to the
// parts matching needs.
declare function trackablesFor(userId: string): Promise<TargetCandidate[]>
declare const entries: {
  create(entry: { userId: string; targetId: string | null; minutes: number }): Promise<void>
}

// Built per call, because the candidate list belongs to the caller. Nothing
// in here opens a connection, reads a file, or holds state between calls, so
// this is a few object allocations. Where every user matches against the
// same records, build one at module scope instead.
export function interpretFor(userId: string, transcript: string): Promise<VoiceOutcome> {
  const voice = createEmbeddedVoice({ candidates: () => trackablesFor(userId) })

  return voice.interpret(transcript)
}

// A webhook, a chat message, a transcript from your speech provider: from
// here they are all the same call.
export async function onMessage(userId: string, transcript: string): Promise<void> {
  const outcome = await interpretFor(userId, transcript)

  if (outcome.kind === 'fallback') {
    // Worth logging. A run of no-matching-target means the candidate list is
    // wrong; a run of unrecognized-command is a vocabulary gap.
    console.log(outcome.reason, outcome.transcript)
    return
  }

  if (outcome.kind === 'command' && outcome.intent.type === 'LOG_TIME') {
    await entries.create({
      userId,
      targetId: outcome.target?.id ?? null,
      minutes: outcome.intent.durationMinutes,
    })
  }
}
```

`candidates` takes no arguments, so a multi-tenant backend builds one
`EmbeddedVoice` per request the way the service mode does internally. That
is deliberate rather than an oversight: the alternative is threading a
caller identity through the resolver port, and a host that wants that can
implement `TargetResolver` directly instead.

To accept audio rather than text here, give the config a `speechToText` and
call `interpretAudio`. See [A cloud recognition API](#a-cloud-recognition-api).

### As a service

Nothing to install. The candidate list travels with the request, and the
response body is the same `VoiceOutcome` the embedded call returns, so
everything reading it is unchanged by which mode you chose.

```ts
import type { TargetCandidate, VoiceOutcome } from 'jiffy-voice'

export async function interpret(
  transcript: string,
  candidates: readonly TargetCandidate[],
  token: string,
): Promise<VoiceOutcome> {
  const response = await fetch('http://jiffy-voice:8080/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ transcript, candidates }),
  })

  if (!response.ok) throw new Error(`jiffy-voice answered ${response.status}`)

  return (await response.json()) as VoiceOutcome
}
```

Importing the package for its types alone costs nothing at runtime, and a
caller that is not a JavaScript process does not need it at all. Endpoints,
errors, auth, and per-request overrides are in
[Running it as a service](#running-it-as-a-service).

## The two tiers together

This is the arrangement the package exists for, as code. Tier one is
`interpret`. Tier two is whatever assistant the app already runs. The
switch is what joins them, and the reason `fallback` is a return value
rather than an error is that this switch has to read as three ordinary
branches, not a happy path with a catch around it.

```ts
import {
  createEmbeddedVoice,
  describeIntent,
  type ActionableIntent,
  type ResolvedTarget,
  type TargetCandidate,
  type VoiceOutcome,
} from 'jiffy-voice'

// Tier two: the assistant you already run. A round trip, a model call, and a
// bill. Everything below exists to reach it less often.
declare function askAssistant(transcript: string): Promise<string>

// Yours, all of it.
declare function loadTrackables(): Promise<TargetCandidate[]>
declare const timers: {
  start(targetId: string | null): Promise<void>
  stop(): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  log(targetId: string | null, minutes: number): Promise<void>
  custom(name: string): Promise<void>
}
declare const ui: {
  say(text: string): void
  chooseBetween(question: string, options: readonly ResolvedTarget[]): Promise<void>
}

const voice = createEmbeddedVoice({ candidates: loadTrackables })

// One case per variant and no default. ActionableIntent is a closed union,
// so a variant added by a later version fails to compile here rather than
// falling through unnoticed.
function run(intent: ActionableIntent, target: ResolvedTarget | null): Promise<void> {
  switch (intent.type) {
    case 'START_TRACKING':
      // A null target means they said "start" without naming anything.
      return timers.start(target?.id ?? null)
    case 'STOP_TRACKING':
      return timers.stop()
    case 'PAUSE':
      return timers.pause()
    case 'RESUME':
      return timers.resume()
    case 'LOG_TIME':
      // durationMinutes is on this variant and no other, so reaching it
      // without narrowing first does not compile.
      return timers.log(target?.id ?? null, intent.durationMinutes)
    case 'CUSTOM':
      // Only reachable for phrases you added to the vocabulary yourself.
      return timers.custom(intent.name)
  }
}

function handle(outcome: VoiceOutcome): Promise<void> {
  switch (outcome.kind) {
    case 'command':
      // Tier one answered it. No model, no network, nothing to wait for.
      return run(outcome.intent, outcome.target)

    case 'confirm':
      // Understood, not sure enough to act on. options is ranked, best
      // first, and is populated even when target is null.
      return ui.chooseBetween(`${describeIntent(outcome.intent)}?`, outcome.options)

    case 'fallback':
      // Tier two, and the reason the arrangement works: handing an utterance
      // on is an ordinary return value rather than a caught error.
      return askAssistant(outcome.transcript).then((reply) => ui.say(reply))
  }
}

export async function onUtterance(transcript: string): Promise<void> {
  await handle(await voice.interpret(transcript))
}
```

Both switches are exhaustive and neither has a `default`. That is not a
style preference: `VoiceOutcome` and `ActionableIntent` are closed unions
and both functions declare a return type, so dropping a case is a
compile error rather than a branch that silently does nothing.

Run `make example-fast-path` to see the same shape against a list of
utterances, with timings and a count of how many were handled locally.

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

// Firefox and every non-browser runtime answer false. Checking first is what
// lets a host offer a text field rather than a button that fails when
// pressed.
const recognizer = isWebSpeechSupported() ? new WebSpeechRecognizer({ language: 'en-US' }) : null
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
import {
  createEmbeddedVoice,
  VoiceSession,
  WebSpeechRecognizer,
  type TargetCandidate,
  type VoiceOutcome,
  type VoiceSessionState,
} from 'jiffy-voice'

declare const candidates: TargetCandidate[]
declare const button: HTMLButtonElement
declare const cancelButton: HTMLButtonElement
declare function render(state: VoiceSessionState<VoiceOutcome>): void

const voice = createEmbeddedVoice({ candidates })

const session = new VoiceSession({
  recognizer: new WebSpeechRecognizer(),
  // The second argument is the recognizer's whole answer when there was
  // one, so its alternatives survive rather than being dropped for a string.
  handle: (transcript, heard) => voice.interpret(heard ?? transcript),
})

session.subscribe((state) => render(state))

button.addEventListener('pointerdown', () => session.start())
button.addEventListener('pointerup', () => session.stop())
cancelButton.addEventListener('click', () => session.cancel())
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

Wired into a component, this is [React, in a browser](#react-in-a-browser)
and [React Native](#react-native).

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
import Voice from '@react-native-voice/voice'
import { NativeSpeechRecognizer, type NativeSpeechModule } from 'jiffy-voice'

const speech: NativeSpeechModule = {
  subscribe(events) {
    Voice.onSpeechPartialResults = (e) => events.onPartial(e.value ?? [])
    Voice.onSpeechResults = (e) => events.onResults(e.value ?? [])
    Voice.onSpeechError = (e) => events.onError({ code: e.error?.code, message: e.error?.message })
    Voice.onSpeechEnd = () => events.onEnd()

    return () => {
      void Voice.removeAllListeners()
    }
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

[React Native](#react-native) has this wired to a button.

### A cloud recognition API

`HttpSpeechToText` owns transport and leaves the provider-specific parts as
two functions, because a config format for request and response shapes
would only ever approximate them:

```ts
import { createEmbeddedVoice, HttpSpeechToText } from 'jiffy-voice'

const speechToText = new HttpSpeechToText({
  url: 'https://api.example.com/v1/transcribe',
  headers: { authorization: `Bearer ${key}` },
  // The argument is unknown, because no two providers agree on a shape and
  // this is where you decide what yours is.
  parse: (body) => {
    const { text, confidence } = body as { text: string; confidence: number }
    return { transcript: text, confidence }
  },
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
import { createEmbeddedVoice } from 'jiffy-voice'

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
