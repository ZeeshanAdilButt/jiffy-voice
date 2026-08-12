import type { TargetKind } from '../domain/index.js'

/**
 * The words English uses to say what type of thing was just named. Both the
 * parser and the resolver need this vocabulary: the parser to read the kind
 * out of "my deen goal", and the resolver because a host that calls it with
 * a raw spoken phrase should not be punished for the word "goal" still
 * being attached to the name.
 *
 * "Project" maps to category on the reasoning that an app with projects
 * usually files time under them the way it would a category. An app whose
 * users say "sprint" or "client" replaces this map rather than living with
 * that guess.
 */
export const DEFAULT_KIND_WORDS: Readonly<Record<string, TargetKind>> = {
  goal: 'goal',
  goals: 'goal',
  objective: 'goal',
  task: 'task',
  tasks: 'task',
  todo: 'task',
  item: 'task',
  category: 'category',
  categories: 'category',
  project: 'category',
  bucket: 'category',
  area: 'category',
}
