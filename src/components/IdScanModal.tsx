import { useRef, useState } from 'react'
import { extractEquipmentIds, ocrImage } from '../ocr'

export type IdField = 'container' | 'chassis' | 'both'

interface Props {
  /** Which field(s) this photo should fill */
  field: IdField
  onClose: () => void
  onResult: (result: { container?: string; chassis?: string }) => void
}

type Stage = 'pick' | 'working' | 'review' | 'error'

export default function IdScanModal({ field, onClose, onResult }: Props) {
  const [stage, setStage] = useState<Stage>('pick')
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [ids, setIds] = useState<string[]>([])
  const [picked, setPicked] = useState(0)
  const [singleAs, setSingleAs] = useState<'container' | 'chassis'>(
    field === 'chassis' ? 'chassis' : 'container',
  )
  const [error, setError] = useState('')
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const title =
    field === 'container'
      ? 'Scan container / trailer'
      : field === 'chassis'
        ? 'Scan chassis'
        : 'Scan container & chassis'

  async function handleFile(file: File) {
    setPreview(URL.createObjectURL(file))
    setStage('working')
    setProgress(0)
    try {
      const text = await ocrImage(file, setProgress)
      const found = extractEquipmentIds(text)
      if (found.length === 0) {
        setError(
          'Could not read an equipment number. Get closer to the plate, keep it straight, and try again in good light.',
        )
        setStage('error')
      } else {
        setIds(found)
        setPicked(0)
        setStage('review')
      }
    } catch (err) {
      console.error(err)
      setError(
        'Text reading failed. If this is your first scan, it needs signal once to download the reader.',
      )
      setStage('error')
    }
  }

  function confirm() {
    if (field === 'container') {
      onResult({ container: ids[picked] })
    } else if (field === 'chassis') {
      onResult({ chassis: ids[picked] })
    } else if (ids.length === 1) {
      onResult(singleAs === 'container' ? { container: ids[0] } : { chassis: ids[0] })
    } else {
      onResult({ container: ids[0], chassis: ids[1] })
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="row-delete" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        {stage === 'pick' && (
          <div className="scan-pick">
            <p className="muted">
              Point the camera at the number plate on the truck
              {field === 'both' ? ' (container and/or chassis)' : ''}. You can also pick a photo
              you already took.
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
          </div>
        )}

        {stage === 'working' && (
          <div className="scan-working">
            {preview && <img src={preview} alt="Plate preview" className="scan-preview" />}
            <div className="progress">
              <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="muted">Reading number… {Math.round(progress * 100)}%</p>
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
          <div className="scan-pick">
            {preview && <img src={preview} alt="Plate preview" className="scan-preview" />}
            <p className="muted">
              Found {ids.length} number{ids.length === 1 ? '' : 's'}. Confirm before adding.
            </p>

            {field === 'both' && ids.length === 1 ? (
              <div className="pay-options">
                <label className={`pay-option ${singleAs === 'container' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="idas"
                    checked={singleAs === 'container'}
                    onChange={() => setSingleAs('container')}
                  />
                  <span>
                    Container / Trailer: <strong className="mono">{ids[0]}</strong>
                  </span>
                </label>
                <label className={`pay-option ${singleAs === 'chassis' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="idas"
                    checked={singleAs === 'chassis'}
                    onChange={() => setSingleAs('chassis')}
                  />
                  <span>
                    Chassis: <strong className="mono">{ids[0]}</strong>
                  </span>
                </label>
              </div>
            ) : field === 'both' && ids.length >= 2 ? (
              <div className="id-preview">
                <div>
                  Container: <strong className="mono">{ids[0]}</strong>
                </div>
                <div>
                  Chassis: <strong className="mono">{ids[1]}</strong>
                </div>
              </div>
            ) : (
              <div className="pay-options">
                {ids.map((id, i) => (
                  <label key={id} className={`pay-option ${picked === i ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="idpick"
                      checked={picked === i}
                      onChange={() => setPicked(i)}
                    />
                    <strong className="mono">{id}</strong>
                  </label>
                ))}
              </div>
            )}

            <button className="btn primary big" onClick={confirm}>
              Use this number
            </button>
            <button className="btn" onClick={() => setStage('pick')}>
              Retake
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
