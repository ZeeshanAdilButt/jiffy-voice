/**
 * The two-tier arrangement this package is built for.
 *
 * An app with a general assistant already has something that understands
 * "move my deen block to Thursday and tell me how much I did last week".
 * That something costs a round trip and a model call. Most of what people
 * actually say to a timer is "stop", and paying for a model to work that out
 * is the wrong trade.
 *
 * So: try locally first, forward what does not resolve. The point of the
 * fallback outcome is that forwarding is an ordinary return value rather
 * than an error path.
 *
 * Run with: make example-fast-path
 */
import {
  createEmbeddedVoice,
  describeIntent,
  type TargetCandidate,
  type VoiceOutcome,
} from '../src/index.js'

const candidates: TargetCandidate[] = [
  { id: 'goal_42', name: 'Deen', kind: 'goal', aliases: ['Islamic Studies'] },
  { id: 'goal_43', name: 'Fitness', kind: 'goal' },
  { id: 'task_7', name: 'Invoices', kind: 'task' },
  { id: 'cat_2', name: 'Deep Work', kind: 'category' },
]

// Stands in for the assistant the host already runs. The only thing that
// matters here is that reaching it is expensive and reaching the parser
// is not.
async function askTheAssistant(transcript: string): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 5))
  return `[model] handled "${transcript}"`
}

function report(outcome: VoiceOutcome): string {
  switch (outcome.kind) {
    case 'command':
      return `run ${describeIntent(outcome.intent)} on ${outcome.target?.id ?? 'the current timer'}`
    case 'confirm':
      return `ask: ${describeIntent(outcome.intent)}? candidates: ${
        outcome.options.map((option) => `${option.name} (${option.score})`).join(', ') || 'none'
      }`
    case 'fallback':
      return `forward (${outcome.reason})`
  }
}

const utterances = [
  'start tracking time for my deen goal',
  'stop',
  'log an hour and a half to my deen goal',
  // A vowel the recognizer got wrong still lands on the right record.
  'start tracking dean',
  // Understood, but the name is only close enough to be worth asking about.
  'start tracking dee',
  // Understood, but the phrase is ordinary speech as often as a command.
  'done',
  // Beyond this package on purpose: it is a question, not a command.
  'how much time did i spend on deen last week',
  // A whole workflow. Exactly what the assistant is for.
  'move my deen block to thursday and add a task to review invoices',
]

async function main() {
  const voice = createEmbeddedVoice({ candidates })

  let local = 0
  let forwarded = 0

  for (const said of utterances) {
    const started = performance.now()
    const outcome = await voice.interpret(said)
    const elapsed = performance.now() - started

    console.log(`said:     ${said}`)
    console.log(`outcome:  ${report(outcome)}  (${elapsed.toFixed(2)}ms, no model call)`)

    if (outcome.kind === 'fallback') {
      forwarded += 1
      console.log(`          ${await askTheAssistant(outcome.transcript)}`)
    } else {
      local += 1
    }

    console.log()
  }

  console.log(`${local} handled locally, ${forwarded} forwarded`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
