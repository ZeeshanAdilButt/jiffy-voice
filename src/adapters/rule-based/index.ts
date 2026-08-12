export { RuleBasedIntentParser } from './intent-parser.js'
export { parseCommand, type ParseOptions } from './parse.js'
// The compiled table, the rule shape, and the compiler are the parser's own
// business. A host describes a vocabulary; it does not need to hold one.
export type {
  BuiltInPhrase,
  CustomPhrase,
  KindWordOverrides,
  Vocabulary,
  VocabularyPhrase,
} from './vocabulary.js'
