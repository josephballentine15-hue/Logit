// One-off check: parse a sample J1 gate-receipt email like truckers receive.
import { parseEmailText } from '../src/ocr'

const sample = `J1 for equipment EMHU 269726

EMHU 269726                TSFZ 567
142

============================

PARK AT :
LOT :D LOT   AREA :3

============================

ARRIVAL :
07/06/2026 00:34  NZ020  GLOBAL 2 IL
CARRIER :STAA
SHIPPER :ROBINSCH

DRIVER :SHARITA BALLENTINE
DRIVER ID :********3756/IL
LOAD :54098  LBS
SEAL #:2211
CHECKED BY :AGS: PGT

RCD DEFECTS:
00-No Defects

DAMAGES:
THIS TERMINAL IS EQUIPPED WITH AN
AUTOMATED GATE SYSTEM.

Container Safety Act Information:
LOAD:    54098
CERT PARTY:   CH ROBINSON INTERMODAL`

console.log(JSON.stringify(parseEmailText(sample), null, 2))
