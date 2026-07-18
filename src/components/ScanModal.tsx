import { useEffect, useRef, useState } from 'react'
import { ocrImage, parseRows, parseEmailText, parseSpokenText } from '../ocr'
import type { ParsedRow } from '../types'
import { parseMoneyInput } from '../format'
import { SpeechRec, explainSpeechError } from '../speech'

interface Props {
  onClose: () => void
  onAddRows: (rows: ParsedRow[]) => void
}

type Stage = 'pick' | 'working' | 'review' | 'error'

export default function ScanModal({ onClose, onAddRows }: Props) {
  const [stage, setStage] = useState<Stage>('pick')
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedRow[]>([])
  const [error, setError] = useState('')
  const [emailText, setEmailText] = useState('')
  const [spoken, setSpoken] = useState('')
  const [listening, setListening] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null)

  useEffect(() => () => recRef.current?.abort?.(), [])

  function handleEmailText() {
    const row = parseEmailText(emailText)
    if (!row) {
      setError(
        'Could not find a container or chassis number in that text. Make sure the whole email or text message was copied.',
      )
      setStage('error')
    } else {
      setParsed([row])
      setStage('review')
    }
  }

  function toggleListening() {
    if (listening) {
      recRef.current?.stop()
      return
    }
    const rec = new SpeechRec()
    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let transcript = ''
      for (const result of e.results) transcript += result[0].transcript
      setSpoken(transcript)
    }
    rec.onend = () => setListening(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      setListening(false)
      const explanation = explainSpeechError(e.error)
      if (explanation) {
        setError(explanation)
        setStage('error')
      }
    }
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  function handleSpoken() {
    recRef.current?.stop()
    setParsed([parseSpokenText(spoken)])
    setStage('review')
  }

  async function handleFile(file: File) {
    setPreview(URL.createObjectURL(file))
    setStage('working')
    setProgress(0)
    try {
      const text = await ocrImage(file, setProgress)
      const rows = parseRows(text)
      if (rows.length === 0) {
        setError(
          'Could not find any loads in that photo. Try a straighter, well-lit shot, or add rows by hand.',
        )
        setStage('error')
      } else {
        setParsed(rows)
        setStage('review')
      }
    } catch (err) {
      console.error(err)
      setError(
        'Text reading failed. If this is your first scan, it needs signal once to download the reader — after that it works offline.',
      )
      setStage('error')
    }
  }

  function updateParsed(index: number, patch: Partial<ParsedRow>) {
    setParsed((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const included = parsed.filter((r) => r.include)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Add loads</h2>
          <button className="row-delete" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        {stage === 'pick' && (
          <div className="scan-pick">
            <p className="muted">
              Photo of your paper log sheet — Logit reads container, chassis, dates and rates. You
              can fix anything before adding.
            </p>
            <button className="btn primary big" onClick={() => cameraRef.current?.click()}>
              📷 Take photo
            </button>
            <button className="btn big" onClick={() => galleryRef.current?.click()}>
              🖼 Choose from photos
            </button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
            />

            <div className="or-divider">or</div>

            <p className="muted">
              Got the load by email or text message? Copy it and paste it here — no photo needed.
            </p>
            <textarea
              className="email-paste"
              rows={4}
              placeholder={'Paste email or text message here…\n\nJ1 for equipment EMHU 269726\nSEAL #: …'}
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
            />
            <button
              className="btn primary"
              disabled={emailText.trim().length === 0}
              onClick={handleEmailText}
            >
              Read pasted message
            </button>

            {SpeechRec && (
              <>
                <div className="or-divider">or</div>
                <p className="muted">
                  Say the load out loud, for example: “container EMHU 650693 chassis TSFZ 567142
                  from G4 to 63rd rate 220”.
                </p>
                <button
                  className={`btn big ${listening ? 'listening' : ''}`}
                  onClick={toggleListening}
                >
                  {listening ? '⏺ Listening… tap to stop' : '🎤 Speak a load'}
                </button>
                {spoken && (
                  <>
                    <textarea
                      className="email-paste"
                      rows={3}
                      value={spoken}
                      onChange={(e) => setSpoken(e.target.value)}
                    />
                    <button className="btn primary" onClick={handleSpoken}>
                      Use spoken load
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {stage === 'working' && (
          <div className="scan-working">
            {preview && <img src={preview} alt="Sheet preview" className="scan-preview" />}
            <div className="progress">
              <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="muted">Reading text… {Math.round(progress * 100)}%</p>
          </div>
        )}

        {stage === 'error' && (
          <div className="scan-pick">
            <p className="error-text">{error}</p>
            <button className="btn primary" onClick={() => setStage('pick')}>
              Try again
            </button>
          </div>
        )}

        {stage === 'review' && (
          <div className="scan-review">
            <p className="muted">
              Found {parsed.length} load{parsed.length === 1 ? '' : 's'}. Uncheck anything wrong,
              tap a value to fix it.
            </p>
            <div className="table-wrap review-wrap">
              <table className="loads review">
                <thead>
                  <tr>
                    <th></th>
                    <th>Date</th>
                    <th>Container</th>
                    <th>Chassis</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Rate</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((row, i) => (
                    <tr key={i} className={row.include ? '' : 'excluded'}>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={(e) => updateParsed(i, { include: e.target.checked })}
                        />
                      </td>
                      <td>
                        <input
                          value={row.date}
                          onChange={(e) => updateParsed(i, { date: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="mono"
                          value={row.container}
                          onChange={(e) =>
                            updateParsed(i, { container: e.target.value.toUpperCase() })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="mono"
                          value={row.chassis}
                          onChange={(e) =>
                            updateParsed(i, { chassis: e.target.value.toUpperCase() })
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={row.from}
                          onChange={(e) => updateParsed(i, { from: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          value={row.to}
                          onChange={(e) => updateParsed(i, { to: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="num"
                          inputMode="decimal"
                          value={row.rate != null ? String(row.rate) : ''}
                          onChange={(e) =>
                            updateParsed(i, { rate: parseMoneyInput(e.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={row.notes}
                          onChange={(e) => updateParsed(i, { notes: e.target.value })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="btn-row">
              <button
                className="btn primary"
                disabled={included.length === 0}
                onClick={() => onAddRows(included)}
              >
                Add {included.length} load{included.length === 1 ? '' : 's'}
              </button>
              <button className="btn" onClick={() => setStage('pick')}>
                Rescan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
