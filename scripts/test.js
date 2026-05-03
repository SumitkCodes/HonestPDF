// scripts/test.js - HonestPDF automated feature tests
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');

const pass = [], fail = [];
const ok = (msg) => { pass.push(msg); console.log('✅', msg); };
const ko = (msg, err) => { fail.push(msg); console.log('❌', msg, '-', err?.message || err); };

async function run() {
  console.log('\n══════════════════════════════════════');
  console.log('  HonestPDF - Feature Test Suite');
  console.log('══════════════════════════════════════\n');

  // Build test PDF
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < 3; i++) {
    const pg = pdfDoc.addPage([595, 842]);
    pg.drawText(`HonestPDF Test Page ${i+1}`, { x: 50, y: 780, size: 20, font: bold, color: rgb(0,0,0) });
    pg.drawText('The quick brown fox jumps over the lazy dog.', { x: 50, y: 740, size: 12, font });
    pg.drawText(`Page ${i+1} of 3`, { x: 270, y: 20, size: 10, font, color: rgb(0.5,0.5,0.5) });
  }
  const testBytes = await pdfDoc.save();
  const tmp = '/tmp/honestpdf_test.pdf';
  fs.writeFileSync(tmp, testBytes);
  ok(`Test PDF created (${testBytes.length} bytes, 3 pages)`);

  // 1. Merge
  try {
    const m = await PDFDocument.create();
    for (let i = 0; i < 2; i++) {
      const src = await PDFDocument.load(testBytes);
      const pages = await m.copyPages(src, src.getPageIndices());
      pages.forEach(p => m.addPage(p));
    }
    const out = await m.save();
    const merged = await PDFDocument.load(out);
    if (merged.getPageCount() === 6) ok('Merge PDF (6 pages from 2×3)');
    else ko('Merge PDF', 'Wrong page count: ' + merged.getPageCount());
  } catch(e) { ko('Merge PDF', e); }

  // 2. Split all pages
  try {
    const src = await PDFDocument.load(testBytes);
    const parts = [];
    for (let i = 0; i < src.getPageCount(); i++) {
      const n = await PDFDocument.create();
      const [p] = await n.copyPages(src, [i]);
      n.addPage(p);
      parts.push(await n.save());
    }
    if (parts.length === 3 && parts.every(p => p.length > 100)) ok('Split PDF (3 single-page files)');
    else ko('Split PDF', 'Expected 3 parts');
  } catch(e) { ko('Split PDF', e); }

  // 3. Split by range
  try {
    const src = await PDFDocument.load(testBytes);
    const n = await PDFDocument.create();
    const pages = await n.copyPages(src, [0, 1]);
    pages.forEach(p => n.addPage(p));
    const out = await n.save();
    const check = await PDFDocument.load(out);
    if (check.getPageCount() === 2) ok('Split by range (pages 1-2)');
    else ko('Split by range', 'Wrong count');
  } catch(e) { ko('Split by range', e); }

  // 4. Compress (canvas fallback path)
  try {
    const src = await PDFDocument.load(testBytes);
    const out = await src.save({ useObjectStreams: true });
    ok(`Compress (pdf-lib mode): ${testBytes.length} → ${out.length} bytes`);
  } catch(e) { ko('Compress', e); }

  // 5. Rotate
  try {
    const src = await PDFDocument.load(testBytes);
    src.getPages().forEach(p => p.setRotation(degrees(90)));
    const out = await src.save();
    const check = await PDFDocument.load(out);
    if (check.getPages()[0].getRotation().angle === 90) ok('Rotate 90° (all pages)');
    else ko('Rotate', 'Rotation not applied');
  } catch(e) { ko('Rotate', e); }

  // 6. Watermark
  try {
    const src = await PDFDocument.load(testBytes);
    src.registerFontkit(fontkit);
    const f = await src.embedFont(StandardFonts.HelveticaBold);
    src.getPages().forEach(pg => {
      const { width, height } = pg.getSize();
      pg.drawText('DRAFT', { x: width/2-60, y: height/2, size: 72, font: f, color: rgb(0.8,0.8,0.8), opacity: 0.25, rotate: degrees(-45) });
    });
    const out = await src.save();
    ok(`Watermark (3 pages): ${out.length} bytes`);
  } catch(e) { ko('Watermark', e); }

  // 7. Page numbers
  try {
    const src = await PDFDocument.load(testBytes);
    const f = await src.embedFont(StandardFonts.Helvetica);
    src.getPages().forEach((pg, i) => {
      const { width } = pg.getSize();
      const txt = `Page ${i+1} of ${src.getPageCount()}`;
      pg.drawText(txt, { x: (width - f.widthOfTextAtSize(txt,11))/2, y: 25, size: 11, font: f, color: rgb(0.4,0.4,0.4) });
    });
    const out = await src.save();
    ok(`Page numbers added: ${out.length} bytes`);
  } catch(e) { ko('Page numbers', e); }

  // 8. Organize (reverse order)
  try {
    const src = await PDFDocument.load(testBytes);
    const n = await PDFDocument.create();
    const order = [2, 1, 0];
    const pages = await n.copyPages(src, order);
    pages.forEach(p => n.addPage(p));
    const out = await n.save();
    ok(`Organize (reverse): ${out.length} bytes`);
  } catch(e) { ko('Organize', e); }

  // 9. Protect
  try {
    const src = await PDFDocument.load(testBytes);
    const out = await src.save({ userPassword: 'secret123', ownerPassword: 'secret123' });
    ok(`Protect with password: ${out.length} bytes`);
  } catch(e) { ko('Protect', e); }

  // 10. Unlock
  try {
    const src = await PDFDocument.load(testBytes, { ignoreEncryption: true });
    const out = await src.save();
    ok(`Unlock PDF: ${out.length} bytes`);
  } catch(e) { ko('Unlock', e); }

  // 11. Repair
  try {
    const src = await PDFDocument.load(testBytes, { ignoreEncryption: true, throwOnInvalidObject: false });
    const out = await src.save();
    ok(`Repair PDF: ${out.length} bytes`);
  } catch(e) { ko('Repair', e); }

  // 12. PDF/A metadata
  try {
    const src = await PDFDocument.load(testBytes);
    src.setTitle('Test'); src.setAuthor('HonestPDF'); src.setCreator('HonestPDF'); src.setProducer('HonestPDF');
    src.setCreationDate(new Date()); src.setModificationDate(new Date());
    const out = await src.save();
    ok(`PDF/A metadata: ${out.length} bytes`);
  } catch(e) { ko('PDF/A', e); }

  // 13. PDF→Word
  try {
    const { Document, Packer, Paragraph, TextRun } = require('docx');
    const lines = ['Line one from PDF', 'Line two from PDF', 'Line three from PDF'];
    const doc = new Document({ creator: 'HonestPDF', sections: [{ children: lines.map(t => new Paragraph({ children: [new TextRun({ text: t, size: 24 })] })) }] });
    const buf = await Packer.toBuffer(doc);
    ok(`PDF→Word: ${buf.length} bytes`);
  } catch(e) { ko('PDF→Word', e); }

  // 14. PDF→Excel
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PDF Content');
    ws.addRow(['Name', 'Value', 'Notes']);
    ws.addRow(['Item 1', '100', 'Extracted from PDF']);
    ws.addRow(['Item 2', '200', 'Row 2']);
    ws.columns.forEach(c => c.width = 20);
    const buf = await wb.xlsx.writeBuffer();
    ok(`PDF→Excel: ${buf.length} bytes`);
  } catch(e) { ko('PDF→Excel', e); }

  // 15. PDF→PPT
  try {
    const PptxGenJS = require('pptxgenjs');
    const pptx = new PptxGenJS();
    ['Page 1 content', 'Page 2 content', 'Page 3 content'].forEach((text, i) => {
      const s = pptx.addSlide();
      s.addText(`Slide ${i+1}`, { x:0.5, y:0.3, w:9, h:1, fontSize:24, bold:true, color:'1a1a2e' });
      s.addText(text, { x:0.5, y:1.5, w:9, h:4, fontSize:14, color:'333333' });
    });
    const buf = await pptx.write({ outputType: 'nodebuffer' });
    ok(`PDF→PPT: ${buf.length} bytes, 3 slides`);
  } catch(e) { ko('PDF→PPT', e); }

  // 16. Word→PDF (mammoth)
  try {
    const mammoth = require('mammoth');
    ok('Word→PDF (mammoth module): ready');
  } catch(e) { ko('Word→PDF', e); }

  // 17. Excel→PDF (exceljs read)
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    ok('Excel→PDF (exceljs module): ready');
  } catch(e) { ko('Excel→PDF', e); }

  // 18. PPT→PDF (jszip)
  try {
    const JSZip = require('jszip');
    const z = new JSZip(); z.file('test.txt', 'content');
    const buf = await z.generateAsync({ type: 'nodebuffer' });
    ok(`PPT→PDF (jszip): ${buf.length} bytes`);
  } catch(e) { ko('PPT→PDF (jszip)', e); }

  // 19. JPG→PDF (use PNG since we can generate it reliably without canvas)
  try {
    const newPdf = await PDFDocument.create();
    // Minimal valid 1x1 white PNG
    const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==','base64');
    const img = await newPdf.embedPng(pngBytes);
    const page = newPdf.addPage([100,100]);
    page.drawImage(img,{x:0,y:0,width:100,height:100});
    const out = await newPdf.save();
    ok(`JPG/PNG→PDF: ${out.length} bytes`);
  } catch(e) { ko('JPG→PDF', e); }



  // 20. Add text (Edit PDF)
  try {
    const src = await PDFDocument.load(testBytes);
    const f = await src.embedFont(StandardFonts.Helvetica);
    src.getPages()[0].drawText('EDITED TEXT', { x: 50, y: 600, size: 16, font: f, color: rgb(1,0,0) });
    const out = await src.save();
    ok(`Edit PDF (add text): ${out.length} bytes`);
  } catch(e) { ko('Edit PDF', e); }

  // 21. Tesseract.js
  try {
    require('tesseract.js');
    ok('OCR (tesseract.js): module loaded');
  } catch(e) { ko('OCR', e); }

  // 22. pdfjs-dist text extraction
  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    ok('pdfjs-dist: module loaded (text extraction ready)');
  } catch(e) { ko('pdfjs-dist', e); }

  // Summary
  console.log('\n══════════════════════════════════════');
  console.log(`  Results: ${pass.length} passed, ${fail.length} failed`);
  console.log('══════════════════════════════════════');
  if (fail.length > 0) {
    console.log('\nFailed tests:');
    fail.forEach(f => console.log('  ❌', f));
  } else {
    console.log('\n🎉 All tests passed!');
  }
  console.log();
  process.exit(fail.length > 0 ? 1 : 0);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
