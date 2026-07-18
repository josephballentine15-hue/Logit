# Publishing Logit to the App Store & Google Play

Logit is wrapped with [Capacitor](https://capacitorjs.com/) so the same React app can ship as a real downloadable app on both stores.

**Live web app (already live):** https://josephballentine15-hue.github.io/Logit/

---

## What you need

| Store | Account | Cost | Build machine |
| --- | --- | --- | --- |
| **Google Play** | [Google Play Console](https://play.google.com/console) | **$25 one-time** | Windows is fine (Android Studio) |
| **Apple App Store** | [Apple Developer Program](https://developer.apple.com/programs/) | **$99 / year** | **Mac with Xcode**, or a cloud Mac builder |

Store review usually takes a few days after you submit. Both stores will ask for privacy info, screenshots, and a short description.

---

## Everyday developer commands

```bash
npm run cap:sync      # rebuild web app + copy into android/ and ios/
npm run cap:android   # open Android Studio
npm run cap:ios       # open Xcode (needs a Mac)
```

Always run `npm run cap:sync` after changing the web code before building a store release.

---

## Android (Google Play) — doable on this Windows PC

1. Create a [Google Play Console](https://play.google.com/console) developer account ($25).
2. Install [Android Studio](https://developer.android.com/studio).
3. From the Logit folder run:
   ```bash
   npm run cap:android
   ```
4. In Android Studio:
   - Let Gradle finish syncing.
   - **Build → Generate Signed Bundle / APK → Android App Bundle**.
   - Create a new upload keystore (keep the password somewhere safe — losing it means you can't update the app).
5. In Play Console create the app **Logit**, upload the `.aab` file, fill listing details, and submit for review.

App ID already set: `com.logit.app`

---

## iOS (App Store) — needs a Mac (or cloud Mac)

The `ios/` project folder is already in this repo. Building and uploading still requires Xcode.

### Option A — You have a Mac

1. Join the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year).
2. On the Mac: clone this repo, `npm install`, then:
   ```bash
   npm run cap:ios
   ```
3. In Xcode: set your Team (signing), bump version if needed, then **Product → Archive → Distribute App → App Store Connect**.

### Option B — No Mac (cloud build)

Services like [Codemagic](https://codemagic.io/) or [GitHub Actions macOS runners](https://docs.github.com/en/actions/using-github-hosted-runners/using-github-hosted-runners) can build the `ios/` folder for you once your Apple Developer account is linked. We can wire that up when you're ready.

---

## Before first store submission

- [ ] Google Play developer account
- [ ] Apple Developer account (for iPhone)
- [ ] App icon as a **1024×1024 PNG** (stores don't accept SVG)
- [ ] A few phone screenshots of the app
- [ ] Short store description (what's Logit, who it's for)
- [ ] Privacy policy URL (required by both stores — can be a simple page)
- [ ] Test on a real phone before submitting

---

## Privacy note for the stores

Logit stores all load data **on the device**. Nothing is uploaded to a Logit server. Say that clearly in the store privacy forms — it makes review smoother.

Camera / mic / speech are only used when the driver taps those features (photo scan and voice entry).
