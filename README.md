# HonestPDF

**The PDF tool that doesn't spy on you.**

Every time you need to merge a PDF, compress it, or convert it to Word - you end up on some random website that uploads your files to god-knows-where, slaps a watermark, and then asks you to pay $12/month for something that should take 2 seconds.

HonestPDF does all of that. On your machine. Offline. No uploads, no accounts, no subscriptions.

---

## ⬇️ Download

| Platform | Download | Size |
|----------|----------|------|
| **macOS** (Apple Silicon) | [HonestPDF-Mac.dmg](https://github.com/SumitkCodes/HonestPDF/releases/latest) | ~117 MB |
| **Windows** (64-bit) | [HonestPDF-Windows.exe](https://github.com/SumitkCodes/HonestPDF/releases/latest) | ~75 MB |

> **Windows:** It's a portable exe. Just double-click and go. If SmartScreen complains, click "More info" → "Run anyway" - the app isn't signed with a $300/yr certificate, that's all.
>
> **Mac:** Drag to Applications. First launch: right-click → Open (bypasses Gatekeeper for unsigned apps).

---

## Why does this exist?

Because these companies charge you money for basic operations:

| What you need | What they charge | What HonestPDF charges |
|---------------|------------------|----------------------|
| Merge 2 PDFs | $12/month | **$0** |
| Compress a PDF | "Free" (with watermark) | **$0** |
| PDF to Word | $8/month after 2 files | **$0** |
| Remove password | "Premium feature" | **$0** |
| Not upload your tax returns to a server | Impossible | **Default behavior** |

Your files never leave your computer. There is no server. There is no cloud. There is no "free tier." It's just... free.

---

## What it does

### Modify PDFs
- **Merge** - Combine multiple PDFs into one
- **Split** - Break a PDF into separate files  
- **Compress** - Actually reduce file size (uses Ghostscript if installed, canvas fallback otherwise)
- **Rotate** - 90°, 180°, 270°
- **Organize** - Drag to reorder pages, delete ones you don't need
- **Repair** - Fix corrupted/broken PDF files

### Convert FROM PDF
- **PDF → Word** (.docx) - Real text extraction, not screenshots
- **PDF → Excel** (.xlsx) - Structured data with proper columns
- **PDF → PowerPoint** (.pptx) - One slide per page with extracted content
- **PDF → JPG** - Every page as a high-quality image

### Convert TO PDF
- **Word → PDF** - .docx files
- **Excel → PDF** - .xlsx spreadsheets
- **PowerPoint → PDF** - .pptx presentations
- **Images → PDF** - JPG, PNG, drag multiple
- **HTML → PDF** - Paste HTML content

### Security
- **Protect** - Add a password
- **Unlock** - Remove a password  
- **Sign** - Draw your signature and stamp it on the PDF

### Annotate
- **Watermark** - "CONFIDENTIAL", "DRAFT", whatever you want
- **Page Numbers** - Add page numbers to every page
- **Edit** - Add text annotations

### Advanced
- **OCR** - Extract text from scanned documents (image-only PDFs)
- **PDF/A** - Convert to archive-standard format
- **Scan** - Use your camera to scan physical documents

That's **24 tools**. All offline. All free.

---

## No internet required

HonestPDF works completely offline. Once installed, you can turn off WiFi, disconnect ethernet, go to a cabin in the woods - it'll still work. 

The only time the app touches the network is when loading the Inter font from Google Fonts on first launch (and even that gets cached). Everything else runs locally.

---

## What permissions does it need?

| Permission | Why | Can you deny it? |
|-----------|-----|-----------------|
| File system (read) | To open your PDFs | No - it literally can't work without this |
| File system (write) | To save the processed files | No - same reason |
| Camera (optional) | Only for "Scan to PDF" feature | Yes - everything else works without it |

That's it. No contacts, no location, no microphone, no "usage analytics," no telemetry.

---

## Supported platforms

- **macOS** - 10.13+ (Intel & Apple Silicon)
- **Windows** - 10/11 (64-bit)

---

## How to use

1. Download for your platform (links above)
2. Open the app
3. Pick a tool from the dashboard
4. Drop your file(s)
5. Click "Process"
6. Done. File saved.

No account. No sign-up. No "verify your email." No "you've used 2 of your 3 free conversions today."

---

## Tech stack

Not that you need to care, but if you're curious:

- **Electron** - Cross-platform desktop shell
- **pdf-lib** - Core PDF manipulation (merge, split, rotate, protect, etc.)
- **pdfjs-dist** - Text extraction and page rendering
- **Ghostscript** - Heavy-duty compression (optional, uses canvas fallback)
- **tesseract.js** - OCR (runs entirely in-browser, no API calls)
- **docx / exceljs / pptxgenjs** - Document generation for conversions

Everything is bundled. No runtime downloads. No CDN dependencies in the desktop app.

---

## Building from source

```bash
# Clone
git clone https://github.com/SumitkCodes/HonestPDF.git
cd HonestPDF

# Install dependencies
npm install

# Run locally
npm start

# Build installers
npm run build:mac    # → dist/HonestPDF-*.dmg
npm run build:win    # → dist/HonestPDF-*.exe

# Run tests (24 feature tests)
npm test
```

### Optional: Better compression

Install Ghostscript for significantly better PDF compression:

```bash
# macOS
brew install ghostscript

# Windows - download from https://ghostscript.com/releases/gsdnld.html
```

Without Ghostscript, compression still works via canvas re-rendering - just not as aggressively.

---

## License

MIT - do whatever you want with it.

---

Built by [Sumit Das](https://github.com/SumitkCodes) because PDF tools shouldn't cost money or require uploading your documents to strangers.
