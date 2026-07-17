# Logit

A simple load log for truckers. Snap a photo of a paper log sheet, let it auto-read the loads,
then edit everything in a lightweight spreadsheet — totals, driver percentage, and deductions
are calculated for you.

## Features

- **Photo scan (OCR)** — take a picture of a paper sheet; container/trailer numbers, chassis
  numbers, dates and rates are extracted automatically and shown for review before adding.
- **Spreadsheet-style editing** — Date, Container/Trailer, Chassis, From, To, Rate, Notes.
  Tap any cell to edit.
- **Pay math built in** — gross total, driver percentage cut, deductions, and final pay.
- **Offline first** — all data is stored on the device (IndexedDB) and the app is a PWA, so it
  keeps working with no signal. The OCR reader downloads once on first use, then works offline.
- **Install on your phone** — open the site in the phone browser and "Add to Home Screen".
- **CSV export** — download a sheet as a spreadsheet file.

## Tech

- React + TypeScript + Vite
- [Dexie](https://dexie.org/) (IndexedDB) for on-device storage
- [Tesseract.js](https://tesseract.projectnaptha.com/) for in-browser OCR
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for offline/installable support

## Development

```bash
npm install
npm run dev       # start dev server
npm run build     # production build (includes the offline service worker)
npm run preview   # serve the production build locally
```

Note: offline support (service worker) is only active in the production build
(`npm run build` + `npm run preview`), not in `npm run dev`.
