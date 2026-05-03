# HonestPDF — Downloads

**Author:** [Sumit Das](https://github.com/SumitkCodes)  
**Version:** 1.0.0  
**License:** MIT

> Complete offline PDF toolkit. No cloud, no tracking — everything runs on your device.

---

## 📦 Ready-to-Install

| Platform | File | Size |
|----------|------|------|
| **macOS** (Apple Silicon) | `mac/HonestPDF-Mac.dmg` | ~117 MB |
| **Windows** (64-bit) | `windows/HonestPDF-Windows.exe` | ~75 MB |

### macOS Installation
1. Open `HonestPDF-Mac.dmg`
2. Drag **HonestPDF** to the **Applications** folder
3. First launch: Right-click → Open (to bypass Gatekeeper for unsigned apps)

### Windows Installation
1. Run `HonestPDF-Windows.exe` (portable — no install needed)
2. If SmartScreen warns: Click "More info" → "Run anyway"

---

## 📱 Android APK

The Android project is fully set up but requires **Android Studio** to build the APK.

### Prerequisites
1. Install [Android Studio](https://developer.android.com/studio)
2. During setup, install:
   - Android SDK
   - Android SDK Platform-Tools
   - Android SDK Build-Tools

### Build Steps
```bash
# From the project root
cd android-app

# Open in Android Studio
npx cap open android

# OR build from command line (if SDK is configured):
cd android
./gradlew assembleDebug

# APK will be at:
# android/app/build/outputs/apk/debug/app-debug.apk
```

Copy the built APK to `download_app/android/HonestPDF.apk`

---

## 🔧 Features (24 tools)

**Modify:** Merge, Split, Compress, Rotate, Organize, Repair  
**Export:** PDF → Word, Excel, PowerPoint, JPG  
**Import:** Word, Excel, PPT, Images, HTML → PDF  
**Security:** Protect, Unlock, Sign  
**Annotate:** Watermark, Page Numbers, Edit  
**Advanced:** OCR, PDF/A, Scan

---

Built with ❤️ by [Sumit Das](https://github.com/SumitkCodes)
