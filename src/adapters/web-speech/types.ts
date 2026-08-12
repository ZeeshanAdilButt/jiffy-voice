/**
 * The slice of the Web Speech API this adapter touches, declared here rather
 * than pulled from the DOM lib. The package targets Node and the browser from
 * one build, and adding "dom" to the compiler's lib for four interfaces would
 * put every global in the browser's namespace into scope for code that has no
 * business seeing them.
 *
 * Structural typing means the real API satisfies these without any
 * declaration merging, and so does a fake in a test.
 */

export interface SpeechRecognitionAlternativeLike {
  readonly transcript: string
  readonly confidence: number
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: SpeechRecognitionAlternativeLike | undefined
}

export interface SpeechRecognitionResultListLike {
  readonly length: number
  readonly [index: number]: SpeechRecognitionResultLike | undefined
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultListLike
}

export interface SpeechRecognitionErrorEventLike {
  readonly error: string
  readonly message?: string
}

export interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

export interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike
}

/**
 * Where the constructor is looked up. Chrome and Safari still only expose the
 * prefixed name; Firefox and older engines expose neither.
 */
export interface SpeechRecognitionScope {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}
