// Web Speech API — prefixed on iOS/Chrome, missing in some browsers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SpeechRec: any =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition

/** Turn a SpeechRecognition error code into advice the driver can act on. */
export function explainSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone is blocked. Tap the lock/settings icon in the address bar and allow the mic, then try again.'
    case 'network':
      return 'Voice recognition could not reach the speech service. It needs internet and a supported browser (Chrome, Edge, or Safari on a phone) — it does not work in this preview window.'
    case 'no-speech':
      return 'Didn’t catch anything — tap the mic and start talking right away.'
    case 'audio-capture':
      return 'No microphone was found on this device.'
    case 'aborted':
      return ''
    default:
      return `Voice input failed (${code}). Try Chrome, Edge, or your phone browser.`
  }
}
