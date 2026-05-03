#!/bin/bash
# Run this after authenticating gh: gh auth login
# Creates a GitHub Release with the DMG and EXE downloads

set -e
cd "$(dirname "$0")"

echo "Creating GitHub Release v1.0.0..."
gh release create v1.0.0 \
  --repo SumitkCodes/HonestPDF \
  --title "HonestPDF v1.0.0" \
  --notes "## HonestPDF v1.0.0

The PDF tool that doesn't spy on you. 24 tools, 100% offline, zero cloud.

### Downloads
| Platform | File |
|----------|------|
| macOS (Apple Silicon) | HonestPDF-Mac.dmg |
| Windows (64-bit) | HonestPDF-Windows.exe |

### Installation
- **Mac:** Open DMG → drag to Applications → right-click → Open on first launch
- **Windows:** Just run the EXE (portable, no install needed)

### What's included
Merge, Split, Compress, Rotate, Organize, Repair, PDF↔Word/Excel/PPT/JPG conversions, Protect, Unlock, Sign, Watermark, Page Numbers, Edit, OCR, PDF/A, Scan - all offline.

Built by [Sumit Das](https://github.com/SumitkCodes)" \
  download_app/mac/HonestPDF-Mac.dmg \
  "download_app/windows/HonestPDF-Windows.exe"

echo "✅ Release created! Check: https://github.com/SumitkCodes/HonestPDF/releases"
