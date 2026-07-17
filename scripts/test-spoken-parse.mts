// One-off check: parse spoken-load phrases and an SMS-style dispatch text.
import { parseSpokenText, parseEmailText } from '../src/ocr'

const spokenSamples = [
  'container E M H U 650693 chassis T S F Z 567142 from G4 to 63rd rate 220',
  'june 22 container EMHU 262325 chassis DDRZ 563677 from G4 to 47th UPS paid 220 dollars note 10 dollar fuel',
  'EMHU 249113 DDRZ 567355 from 47th to G2 rate $110',
]

for (const s of spokenSamples) {
  console.log('>', s)
  console.log(JSON.stringify(parseSpokenText(s)))
  console.log()
}

const sms = `New load 7/18: EMHU 269726 on chassis TSFZ 567142.
Pick up GLOBAL 2, drop 63RD UPS. Rate $195. Seal # 2211`
console.log('> SMS sample')
console.log(JSON.stringify(parseEmailText(sms)))
