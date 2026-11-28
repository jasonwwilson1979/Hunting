# HuntMap as an iPhone / iPad app (Capacitor)

The iOS build is a thin native shell around the same web app: the files are **inside
the app**, so it opens with no signal, no server and no browser cache. Spots, tracks,
maps and fences live in the app's own storage (IndexedDB inside WKWebView).

> **What I could not test:** this repository was developed on Linux. The scaffolding,
> config and copy script are here and verified; `npx cap add ios`, Xcode and the App
> Store submission need **macOS + Xcode 15+** and an Apple Developer account
> (99 USD/year). Treat the first build as a device test.

## 1. Once, on a Mac

```bash
git clone <your repo> && cd Hunting
npm install @capacitor/core@latest @capacitor/cli@latest @capacitor/ios@latest \
            @capacitor/geolocation@latest @capacitor/local-notifications@latest
npm run native:www          # copies the app into www/ (no server, tests or docs)
npx cap add ios             # creates ios/App/App.xcodeproj
npx cap sync ios
npx cap open ios            # Xcode: set your Team, bundle id, then Run on a device
```

`capacitor.config.json` holds `appId` (`com.example.huntmap`), `appName` and
`webDir: "www"`. Change the app id to your own reverse-DNS name before submitting.

## 2. Info.plist keys (Xcode → App → Info → add rows)

| Key | Value | Why |
| --- | --- | --- |
| `NSLocationWhenInUseUsageDescription` | “HuntMap uses your location to show where you are on the map and to alert you at fence boundaries.” | required, or location is refused silently |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | same text | only if you record tracks with the screen off |
| `UIBackgroundModes` | `location` | only with continuous track recording |
| `UISupportedInterfaceOrientations` | portrait + landscape | map rotation |
| `ITSAppUsesNonExemptEncryption` | `NO` | avoids the export-compliance prompt on every upload |

If you enable background `location`, App Review expects a visible reason and a battery
note in your description — otherwise leave it out; fence alerts then work while the app
is open, which is how a phone in your hand is used anyway.

## 3. Privacy manifest (required for App Store uploads)

Create `ios/App/App/PrivacyInfo.xcprivacy` in Xcode (“Property List”, Xcode 15) with:
`NSPrivacyTracking` = false, one collected type
`NSPrivacyCollectedDataTypePreciseLocation` (linked = false, tracking = false, purpose
`AppFunctionality`), and the accessed-API reasons
`NSPrivacyAccessedAPICategoryUserDefaults` → `CA92.1` and
`NSPrivacyAccessedAPICategoryFileTimestamp` → `C617.1`. Then tick the file's Target
Membership for the App target. (Full XML: see the Apple template; the keys above are
the ones that get rejected when missing.)

## 4. Updating the app after a change

```bash
npm run native:sync     # rebuild www/ and copy it into the Xcode project
```

Then bump Version / Build in Xcode, Product → Archive → Distribute App → App Store
Connect, and test through TestFlight.

## 5. What works in the shell — offline **and** synced

Works offline with no server: maps you load (PDF/TIFF/images), spots, tracks, fences
with alerts, GPX import/export, backup/restore, the sun/UTM/compass panels, and any
base-map tiles you pre-downloaded (**Maps → Download view**).

**Your account, the library and spot/track sync work in the shell too.** The shell is
a different origin (`capacitor://localhost` on iOS, `https://localhost` on Android), so
instead of a session cookie it uses a **bearer token**:

1. In the app: **Tools → Account → Server address** → `https://your.huntmap.host` → *Save*.
2. *Sign in* (or *Create account*). The app calls `POST /api/token/`, stores the token in
   its own database and sends `Authorization: Bearer …` on every API call; no cookies,
   and the bundled files still start the app with no signal.
3. The server accepts that origin for `/api/` only (CORS), for the native origins listed
   in `HUNTMAP_NATIVE_ORIGINS` — other websites get no grant. Tokens are hashed at rest,
   expire after `HUNTMAP_TOKEN_DAYS` (default 365), and *Sign out* **revokes** the token
   on the server so only this device is logged out.

Offline and sync coexist: the app opens from its bundle, keeps writing to IndexedDB, and
the queue is flushed when you are online and signed in. Map files download over the
token as well. What is still web-only is only the `/upload/` HTML page (it is a desktop
form) — the phone has *Copy to my PC library* for that.

Base maps without a server: only tiles already cached, USGS (online), or your own
tiles once the server address is set. Pre-downloading the area you hunt at z12–15 is
usually the right answer for a dead zone.

## 6. App Store notes

- **Guideline 4.2 (minimum functionality)**: a plain website wrapper gets rejected.
  This is not one — it stores maps and track data on the device, works offline, records
  GPS and shows fence alerts as local notifications. Say exactly that in the review
  notes, and that no account is needed for the offline features.
- **Guideline 5.1.1**: the location strings must match what you actually do. Do not
  claim background tracking unless you enabled it.
- **Charging money**: digital features sold inside the app fall under Apple's in-app
  purchase rules (30/15 %). Selling access on your website for use outside the app is
  a different case — take advice before shipping a paywall inside the binary.
- Credits belong in the app (Tools → Licences already lists them) and in the App Store
  description: “© OpenStreetMap contributors (ODbL)” for rendered tiles, USGS for the
  US layers.
- A privacy policy URL is mandatory in App Store Connect; `docs/privacy-policy.md` is a
  starting point.

## 7. Android (same scaffolding)

```bash
npx cap add android && npx cap sync android && npx cap open android
```

`AndroidManifest.xml` needs `ACCESS_FINE_LOCATION` and, for fence notifications on
Android 13+, `POST_NOTIFICATIONS`. Capacitor's plugins usually add these — check before
shipping.

