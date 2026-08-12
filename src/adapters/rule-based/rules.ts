import type { ActionableIntent } from '../../domain/index.js'

export type BuiltInIntentType = Exclude<ActionableIntent['type'], 'CUSTOM'>

interface RuleFields {
  readonly phrase: readonly string[]
  /**
   * Ordinary enough in unrelated speech that matching it is a guess worth
   * discounting. "Done" almost always means stop; it also turns up in the
   * middle of someone thinking out loud.
   */
  readonly weak: boolean
  /**
   * Meaningless without a quantity of time. "Log" with no duration is not a
   * command to start a timer, it is an unfinished sentence.
   */
  readonly needsDuration: boolean
}

export interface BuiltInRule extends RuleFields {
  readonly type: BuiltInIntentType
}

export interface CustomRule extends RuleFields {
  readonly type: 'CUSTOM'
  readonly name: string
}

export type CommandRule = BuiltInRule | CustomRule

interface RuleGroup {
  readonly type: BuiltInIntentType
  readonly phrases: readonly string[]
  readonly weakPhrases?: readonly string[]
  readonly needsDuration?: boolean
}

const GROUPS: readonly RuleGroup[] = [
  {
    type: 'START_TRACKING',
    phrases: [
      'start tracking time',
      'start tracking',
      'start working on',
      'start work on',
      'start the timer',
      'start a timer',
      'start timer',
      'start the clock',
      'start',
      'begin tracking time',
      'begin tracking',
      'begin working on',
      'begin work on',
      'begin',
      'clock in on',
      'clock into',
      'clock in',
      'punch in',
      'switch over to',
      'switch to',
      'new timer for',
      'new timer',
    ],
    weakPhrases: [
      'track time',
      'track',
      'im working on',
      'i am working on',
      'working on',
      'work on',
      'time me on',
    ],
  },
  {
    type: 'STOP_TRACKING',
    phrases: [
      'stop tracking time',
      'stop tracking',
      'stop working on',
      'stop the timer',
      'stop timer',
      'stop the clock',
      'stop the session',
      'stop',
      'end tracking',
      'end the timer',
      'end timer',
      'end the session',
      'end session',
      'finish tracking',
      'clock out of',
      'clock out',
      'punch out',
      'im finished',
      'i am finished',
      'im done',
      'i am done',
    ],
    weakPhrases: ['end', 'finish up', 'finish', 'finished', 'done', 'thats it', 'wrap up'],
  },
  {
    type: 'PAUSE',
    phrases: [
      'pause tracking',
      'pause the timer',
      'pause timer',
      'pause',
      'take a break',
      'put it on hold',
      'hold the timer',
    ],
    weakPhrases: ['hold on'],
  },
  {
    type: 'RESUME',
    phrases: [
      'resume tracking',
      'resume the timer',
      'resume timer',
      'resume',
      'unpause',
      'un pause',
      'continue tracking',
      'continue the timer',
      'continue timer',
      'start again',
      'back to work',
      'pick up where i left off',
    ],
    weakPhrases: ['continue', 'keep going', 'carry on', 'im back', 'i am back'],
  },
  {
    type: 'LOG_TIME',
    needsDuration: true,
    phrases: [
      'log',
      'add',
      'record',
      'put',
      'enter',
      'bill',
      'credit',
      'ive spent',
      'i spent',
      'spent',
      'i worked',
      'worked for',
      'worked',
    ],
  },
]

function toRules(group: RuleGroup): BuiltInRule[] {
  const strong = group.phrases.map((phrase) => ({
    phrase: phrase.split(' '),
    type: group.type,
    weak: false,
    needsDuration: group.needsDuration ?? false,
  }))

  const weak = (group.weakPhrases ?? []).map((phrase) => ({
    phrase: phrase.split(' '),
    type: group.type,
    weak: true,
    needsDuration: group.needsDuration ?? false,
  }))

  return [...strong, ...weak]
}

export const BASE_RULES: readonly CommandRule[] = GROUPS.flatMap(toRules)

/**
 * Longest phrase first, which is the whole of the disambiguation strategy:
 * "start again" is a resume and "start tracking" is not, and both would
 * match the bare "start" rule if a shorter phrase were ever tried first.
 *
 * The sort is stable, so two phrases of the same length keep the order they
 * were declared in and the table stays deterministic.
 */
export function sortRules(rules: readonly CommandRule[]): readonly CommandRule[] {
  return [...rules].sort((a, b) => b.phrase.length - a.phrase.length)
}

export const COMMAND_RULES: readonly CommandRule[] = sortRules(BASE_RULES)

/** Politeness and throat-clearing, only ever stripped from the front. */
export const LEADING_PHRASES: readonly string[] = [
  'hey there',
  'hey',
  'hi',
  'hello',
  'yo',
  'yeah',
  'yep',
  'ok',
  'okay',
  'so',
  'well',
  'alright',
  'all right',
  'please',
  'just',
  'now',
  'can you',
  'could you',
  'would you',
  'will you',
  'can we',
  'i want to',
  'i want you to',
  'i would like to',
  'id like to',
  'i need to',
  'i need you to',
  'we need to',
  'lets',
  'let us',
  'go ahead and',
  'you can',
]

/** Only ever stripped from the end. */
export const TRAILING_PHRASES: readonly string[] = [
  'please',
  'thanks',
  'thank you',
  'for me',
  'will you',
  'would you',
  'ok',
  'okay',
  'alright',
]
