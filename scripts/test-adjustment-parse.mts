// One-off check: parse spoken extra-pay/deduction phrases.
import { parseSpokenAdjustment } from '../src/ocr'

const samples = [
  'gas 50',
  'detention 75',
  'deduct advance 300',
  'bonus 100',
  'take off insurance 125.50',
  'tolls 12',
  'extra stop 40',
  'no numbers here',
]

for (const s of samples) {
  console.log('>', s, '=>', JSON.stringify(parseSpokenAdjustment(s)))
}
