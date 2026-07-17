// One-off check: run the real OCR + parser against a sample photo.
// Usage: npx tsx scripts/test-ocr.mts <image path>
import { readFile } from 'node:fs/promises'
import { createWorker } from 'tesseract.js'
import { parseRows } from '../src/ocr'

const imagePath = process.argv[2]
if (!imagePath) {
  console.error('Usage: npx tsx scripts/test-ocr.mts <image path>')
  process.exit(1)
}

const buffer = await readFile(imagePath)
const worker = await createWorker('eng')
await worker.setParameters({
  tessedit_char_whitelist:
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$.,/-:%()# ',
  preserve_interword_spaces: '1',
})
const { data } = await worker.recognize(buffer)
await worker.terminate()

console.log('----- RAW OCR TEXT -----')
console.log(data.text)
console.log('----- PARSED ROWS -----')
console.table(parseRows(data.text))
