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

Early. The intent model, ports, parser, and resolver are landing one at a
time; treat the API as unstable until 1.0. Follow
[releases](https://github.com/ZeeshanAdilButt/jiffy-voice/releases) for
what is actually usable.

## Install

```
npm install jiffy-voice
```

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
