/**
 * Running jiffy-voice in-process: a candidate list, a handful of things
 * someone might say, and the typed commands that come back.
 *
 * Nothing here needs a microphone or a recognizer. Audio arrives through
 * the SpeechToText port, and a host that has one passes it to
 * createEmbeddedVoice; everything below is unchanged by that.
 *
 * Run with: make example-embedded
 */
import {
  createEmbeddedVoice,
  describeIntent,
  isUnresolved,
  type TargetCandidate,
} from '../src/index.js'

// Whatever the host already has. Only the parts matching needs are here;
// the ids are what the host gets back and the only thing it acts on.
const candidates: TargetCandidate[] = [
  { id: 'goal_42', name: 'Deen', kind: 'goal', aliases: ['Islamic Studies'] },
  { id: 'goal_43', name: 'Fitness', kind: 'goal' },
  { id: 'task_7', name: 'Invoices', kind: 'task' },
  { id: 'cat_3', name: 'Deep Work', kind: 'category' },
]

const utterances = [
  'start tracking time for my deen goal',
  'hey, can you pause for a second?',
  'resume',
  "i'm working on the invoices task",
  'log an hour and a half to my deen goal',
  // A recognizer mishearing the vowel still lands on the right record.
  'start tracking my dean goal',
  // Named something the host has never heard of.
  'start tracking my gardening goal',
  // Not a command this understands, and it says so rather than guessing.
  'what did i work on yesterday',
  'stop tracking',
]

async function main() {
  const voice = createEmbeddedVoice({ candidates })

  for (const said of utterances) {
    const command = await voice.handleText(said)
    const { intent, target } = command

    console.log(`heard:  ${said}`)
    console.log(`intent: ${describeIntent(intent)} (confidence ${intent.confidence})`)

    if (target !== null) {
      console.log(`target: ${target.id} "${target.name}" matched on "${target.matchedOn}"`)
    } else if (isUnresolved(command)) {
      console.log('target: named, but no record matched. Ask which one they meant')
    }

    console.log()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
