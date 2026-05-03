const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// ── Performance: enable GPU & V8 optimizations ─────────────
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-http-cache'); // no net, save mem
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512 --expose-gc');

// ── Lazy require cache for heavy modules ────────────────────
const _cache = {};
function lazyRequire(mod) {
  if (!_cache[mod]) _cache[mod] = require(mod);
  return _cache[mod];
}

// ── pdf-lib: eager load at startup (used by every tool) ─────
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

// Check if Ghostscript is available
function gsPath() {
  try { execSync('which gs', { stdio: 'ignore' }); return 'gs'; } catch(e) {}
  const common = ['/usr/local/bin/gs','/usr/bin/gs','/opt/homebrew/bin/gs',
    'C:\\Program Files\\gs\\gs10.02.1\\bin\\gswin64c.exe',
    'C:\\Program Files (x86)\\gs\\gs10.02.1\\bin\\gswin32c.exe'];
  for (const p of common) { try { if (fs.existsSync(p)) return p; } catch(e) {} }
  return null;
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 960,
    minHeight: 660,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0c0c0c',
    show: false, // show after ready-to-show for faster perceived load
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      backgroundThrottling: false,
      enableRemoteModule: false,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('src/index.html');

  // Show window only when fully rendered — avoids white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}


app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─── File Dialogs ────────────────────────────────────────
ipcMain.handle('dialog:openFiles', async (e, opts) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', opts.multiple ? 'multiSelections' : undefined].filter(Boolean),
    filters: opts.filters || [{ name: 'PDF Files', extensions: ['pdf'] }]
  });
  if (result.canceled) return null;
  return result.filePaths;
});

ipcMain.handle('dialog:saveFile', async (e, opts) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: opts.defaultPath || 'output.pdf',
    filters: opts.filters || [{ name: 'PDF Files', extensions: ['pdf'] }]
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('file:read', async (e, filePath) => {
  return fs.readFileSync(filePath);
});

ipcMain.handle('file:write', async (e, filePath, data) => {
  fs.writeFileSync(filePath, Buffer.from(data));
  return true;
});

ipcMain.handle('file:showInFolder', async (e, filePath) => {
  shell.showItemInFolder(filePath);
});

// ─── PDF: Get Info ───────────────────────────────────────
ipcMain.handle('pdf:getInfo', async (e, filePath) => {
  const data = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  return {
    pageCount: pdfDoc.getPageCount(),
    title: pdfDoc.getTitle() || '',
    author: pdfDoc.getAuthor() || '',
    subject: pdfDoc.getSubject() || '',
    creator: pdfDoc.getCreator() || '',
    producer: pdfDoc.getProducer() || '',
    pages: pages.map((p, i) => ({
      index: i,
      width: p.getWidth(),
      height: p.getHeight()
    })),
    fileSize: data.length
  };
});

// ─── PDF: Merge ──────────────────────────────────────────
ipcMain.handle('pdf:merge', async (e, filePaths) => {
  const mergedPdf = await PDFDocument.create();
  for (const fp of filePaths) {
    const data = fs.readFileSync(fp);
    const srcPdf = await PDFDocument.load(data, { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
    copiedPages.forEach(p => mergedPdf.addPage(p));
  }
  return Buffer.from(await mergedPdf.save());
});

// ─── PDF: Split ──────────────────────────────────────────
ipcMain.handle('pdf:split', async (e, filePath, ranges) => {
  const data = fs.readFileSync(filePath);
  const srcPdf = await PDFDocument.load(data, { ignoreEncryption: true });
  const results = [];
  for (const range of ranges) {
    const newPdf = await PDFDocument.create();
    const indices = [];
    for (let i = range.start; i <= range.end && i < srcPdf.getPageCount(); i++) {
      indices.push(i);
    }
    const copiedPages = await srcPdf.copyPages(srcPdf, indices);
    copiedPages.forEach(p => newPdf.addPage(p));
    results.push(Buffer.from(await newPdf.save()));
  }
  return results;
});

ipcMain.handle('pdf:splitAll', async (e, filePath) => {
  const data = fs.readFileSync(filePath);
  const srcPdf = await PDFDocument.load(data, { ignoreEncryption: true });
  const results = [];
  for (let i = 0; i < srcPdf.getPageCount(); i++) {
    const newPdf = await PDFDocument.create();
    const [page] = await newPdf.copyPages(srcPdf, [i]);
    newPdf.addPage(page);
    results.push(Buffer.from(await newPdf.save()));
  }
  return results;
});

// ─── PDF: Compress ───────────────────────────────────────
ipcMain.handle('pdf:compress', async (e, filePath, quality) => {
  const originalSize = fs.statSync(filePath).size;
  const gs = gsPath();

  // Try Ghostscript first — real image + stream compression
  if (gs) {
    const outFile = path.join(app.getPath('temp'), `compressed_${Date.now()}.pdf`);
    const setting = quality === 'screen' ? '/screen' : quality === 'high' ? '/printer' : '/ebook';
    try {
      execSync(`"${gs}" -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=${setting} -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outFile}" "${filePath}"`);
      const compressed = fs.readFileSync(outFile);
      try { fs.unlinkSync(outFile); } catch(e) {}
      return { data: Buffer.from(compressed), originalSize, newSize: compressed.length, method: 'ghostscript' };
    } catch(gsErr) { try { fs.unlinkSync(outFile); } catch(e) {} }
  }

  // Fallback: signal renderer to do canvas-based compression
  return { needsRendererCompression: true, originalSize, filePath };
});

// ─── PDF: Compress (renderer-provided image data) ─────────
ipcMain.handle('pdf:compressFromImages', async (e, jpegPages, originalSize) => {
  const { PDFDocument: PD } = require('pdf-lib');
  const outPdf = await PD.create();
  for (const pageData of jpegPages) {
    const img = await outPdf.embedJpg(Buffer.from(pageData));
    const dims = img.scale(1);
    const page = outPdf.addPage([dims.width, dims.height]);
    page.drawImage(img, { x: 0, y: 0, width: dims.width, height: dims.height });
  }
  const out = await outPdf.save();
  return { data: Buffer.from(out), originalSize, newSize: out.length, method: 'canvas' };
});

// ─── PDF: Rotate ─────────────────────────────────────────
ipcMain.handle('pdf:rotate', async (e, filePath, angle, pageIndices) => {
  const data = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const indicesToRotate = pageIndices && pageIndices.length > 0 ? pageIndices : pages.map((_, i) => i);
  for (const idx of indicesToRotate) {
    if (idx < pages.length) {
      const page = pages[idx];
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees(currentRotation + angle));
    }
  }
  return Buffer.from(await pdfDoc.save());
});

// ─── PDF: Watermark ──────────────────────────────────────
ipcMain.handle('pdf:watermark', async (e, filePath, options) => {
  const data = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  const { text, fontSize, opacity, color, rotation } = options;
  const r = ((color >> 16) & 255) / 255;
  const g = ((color >> 8) & 255) / 255;
  const b = (color & 255) / 255;

  for (const page of pages) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);
    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: (height - textHeight) / 2,
      size: fontSize,
      font,
      color: rgb(r, g, b),
      opacity: opacity,
      rotate: degrees(rotation || -45)
    });
  }
  return Buffer.from(await pdfDoc.save());
});

// ─── PDF: Page Numbers ───────────────────────────────────
ipcMain.handle('pdf:pageNumbers', async (e, filePath, options) => {
  const data = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const { position, format, fontSize, startNum } = options;

  pages.forEach((page, i) => {
    const { width, height } = page.getSize();
    const pageNum = (startNum || 1) + i;
    let text = `${pageNum}`;
    if (format === 'pageOfTotal') text = `Page ${pageNum} of ${pages.length}`;
    else if (format === 'dash') text = `- ${pageNum} -`;
    const textWidth = font.widthOfTextAtSize(text, fontSize || 12);

    let x, y;
    switch (position) {
      case 'bottom-left': x = 40; y = 30; break;
      case 'bottom-right': x = width - textWidth - 40; y = 30; break;
      case 'top-center': x = (width - textWidth) / 2; y = height - 40; break;
      case 'top-left': x = 40; y = height - 40; break;
      case 'top-right': x = width - textWidth - 40; y = height - 40; break;
      default: x = (width - textWidth) / 2; y = 30; break;
    }

    page.drawText(text, { x, y, size: fontSize || 12, font, color: rgb(0.3, 0.3, 0.3) });
  });
  return Buffer.from(await pdfDoc.save());
});

// ─── PDF: Organize (reorder/delete pages) ────────────────
ipcMain.handle('pdf:organize', async (e, filePath, newOrder) => {
  const data = fs.readFileSync(filePath);
  const srcPdf = await PDFDocument.load(data, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();
  const copiedPages = await newPdf.copyPages(srcPdf, newOrder);
  copiedPages.forEach(p => newPdf.addPage(p));
  return Buffer.from(await newPdf.save());
});

// ─── PDF: Protect ────────────────────────────────────────
ipcMain.handle('pdf:protect', async (e, filePath, password) => {
  const data = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
  const encrypted = await pdfDoc.save({
    userPassword: password,
    ownerPassword: password,
  });
  return Buffer.from(encrypted);
});

// ─── PDF: Unlock ─────────────────────────────────────────
ipcMain.handle('pdf:unlock', async (e, filePath, password) => {
  const data = fs.readFileSync(filePath);
  try {
    const pdfDoc = await PDFDocument.load(data, { password, ignoreEncryption: true });
    return { success: true, data: Buffer.from(await pdfDoc.save()) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── PDF: JPG to PDF ─────────────────────────────────────
ipcMain.handle('pdf:jpgToPdf', async (e, imagePaths, options) => {
  const pdfDoc = await PDFDocument.create();
  for (const imgPath of imagePaths) {
    const imgData = fs.readFileSync(imgPath);
    const ext = path.extname(imgPath).toLowerCase();
    let image;
    if (ext === '.png') {
      image = await pdfDoc.embedPng(imgData);
    } else {
      image = await pdfDoc.embedJpg(imgData);
    }
    const dims = image.scale(1);
    const pageWidth = options?.pageSize === 'A4' ? 595.28 : dims.width;
    const pageHeight = options?.pageSize === 'A4' ? 841.89 : dims.height;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    const scale = Math.min(pageWidth / dims.width, pageHeight / dims.height);
    const scaledW = dims.width * scale;
    const scaledH = dims.height * scale;
    page.drawImage(image, {
      x: (pageWidth - scaledW) / 2,
      y: (pageHeight - scaledH) / 2,
      width: scaledW,
      height: scaledH
    });
  }
  return Buffer.from(await pdfDoc.save());
});

// ─── PDF: Edit (add text/images) ─────────────────────────
ipcMain.handle('pdf:addText', async (e, filePath, annotations) => {
  const data = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const ann of annotations) {
    const page = pdfDoc.getPages()[ann.pageIndex];
    if (!page) continue;
    const useFont = ann.bold ? boldFont : font;
    const r = ((ann.color >> 16) & 255) / 255;
    const g = ((ann.color >> 8) & 255) / 255;
    const b = (ann.color & 255) / 255;
    page.drawText(ann.text, {
      x: ann.x,
      y: ann.y,
      size: ann.fontSize || 14,
      font: useFont,
      color: rgb(r, g, b)
    });
  }
  return Buffer.from(await pdfDoc.save());
});

// ─── PDF: Sign (add signature image) ─────────────────────
ipcMain.handle('pdf:addSignature', async (e, filePath, sigData, pageIndex, x, y, w, h) => {
  const data = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
  const sigImage = await pdfDoc.embedPng(Buffer.from(sigData));
  const page = pdfDoc.getPages()[pageIndex];
  if (page) {
    page.drawImage(sigImage, { x, y, width: w, height: h });
  }
  return Buffer.from(await pdfDoc.save());
});

// ─── PDF: Repair ─────────────────────────────────────────
ipcMain.handle('pdf:repair', async (e, filePath) => {
  const data = fs.readFileSync(filePath);
  try {
    const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true, throwOnInvalidObject: false });
    const repaired = await pdfDoc.save();
    return { success: true, data: Buffer.from(repaired) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── PDF: PDF/A conversion ────────────────────────────────
ipcMain.handle('pdf:toPdfA', async (e, filePath) => {
  const data = fs.readFileSync(filePath);
  // Try Ghostscript for proper PDF/A-2b compliance
  const gs = gsPath();
  if (gs) {
    const outFile = path.join(app.getPath('temp'), `pdfa_${Date.now()}.pdf`);
    try {
      execSync(`"${gs}" -dPDFA=2 -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dPDFACompatibilityPolicy=1 -sOutputFile="${outFile}" "${filePath}"`);
      const result = fs.readFileSync(outFile);
      try { fs.unlinkSync(outFile); } catch(e) {}
      return Buffer.from(result);
    } catch(e) { try { fs.unlinkSync(outFile); } catch(e) {} }
  }
  // Fallback: add required metadata
  const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
  pdfDoc.setTitle(pdfDoc.getTitle() || 'Untitled');
  pdfDoc.setAuthor(pdfDoc.getAuthor() || 'HonestPDF');
  pdfDoc.setSubject(pdfDoc.getSubject() || '');
  pdfDoc.setCreator('HonestPDF');
  pdfDoc.setProducer('HonestPDF - PDF/A Converter');
  pdfDoc.setCreationDate(new Date());
  pdfDoc.setModificationDate(new Date());
  return Buffer.from(await pdfDoc.save());
});

// ─── PDF: HTML to PDF ────────────────────────────────────
ipcMain.handle('pdf:htmlToPdf', async (e, htmlContent) => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  const tmpFile = path.join(app.getPath('temp'), 'html_to_pdf_temp.html');
  fs.writeFileSync(tmpFile, htmlContent);
  await win.loadFile(tmpFile);
  const pdfData = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
  });
  win.destroy();
  try { fs.unlinkSync(tmpFile); } catch (e) {}
  return Buffer.from(pdfData);
});

// ─── Conversions: PDF to Word (uses extracted text from renderer) ────
ipcMain.handle('pdf:pdfToWord', async (e, _unused, textContent) => {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
  const lines = textContent.split('\n');
  const paragraphs = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return new Paragraph({ children: [] }); // blank line = spacing
    return new Paragraph({
      children: [new TextRun({ text: trimmed, size: 24, font: 'Calibri' })],
      spacing: { after: 120 }
    });
  });
  const doc = new Document({
    creator: 'HonestPDF',
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 } } }, children: paragraphs }]
  });
  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
});

// ─── Conversions: PDF to Excel (uses extracted text from renderer) ────
ipcMain.handle('pdf:pdfToExcel', async (e, textContent) => {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HonestPDF';
  const sheet = workbook.addWorksheet('PDF Content');
  // Style header row
  sheet.addRow(['Extracted Content from PDF']).font = { bold: true, size: 13 };
  sheet.addRow([]);
  const lines = textContent.split('\n').filter(l => l.trim());
  lines.forEach(line => {
    // Try to detect tab/multi-space separated columns
    const cells = line.split(/\t|(?:  {2,})/).map(c => c.trim()).filter(Boolean);
    const row = sheet.addRow(cells.length > 1 ? cells : [line.trim()]);
    row.eachCell(cell => { cell.font = { size: 11 }; cell.alignment = { wrapText: true }; });
  });
  sheet.columns.forEach(col => { col.width = 30; });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
});

// ─── Conversions: PDF to PowerPoint (uses extracted text from renderer) ─
ipcMain.handle('pdf:pdfToPpt', async (e, textContent, pageCount) => {
  const PptxGenJS = require('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const pages = textContent.split('\n\n--- PAGE BREAK ---\n\n');
  pages.forEach((pageText, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    // Title: first non-empty line
    const lines = pageText.split('\n').filter(l => l.trim());
    const title = lines[0] || `Page ${i + 1}`;
    const body = lines.slice(1).join('\n');
    slide.addText(title, { x: 0.5, y: 0.3, w: 9, h: 1, fontSize: 24, bold: true, color: '1a1a2e' });
    if (body) slide.addText(body, { x: 0.5, y: 1.5, w: 9, h: 4.5, fontSize: 14, color: '333333', valign: 'top', wrap: true });
    slide.addText(`${i + 1}`, { x: 9, y: 6.8, w: 0.5, h: 0.3, fontSize: 10, color: '999999', align: 'right' });
  });
  const data = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.from(data);
});

// ─── Conversions: Word to PDF ────────────────────────────
ipcMain.handle('pdf:wordToPdf', async (e, filePath) => {
  const mammoth = require('mammoth');
  const result = await mammoth.convertToHtml({ path: filePath });
  const html = `<!DOCTYPE html><html><head><style>
    body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 40px; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
    img { max-width: 100%; } table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #ddd; padding: 8px; }
  </style></head><body>${result.value}</body></html>`;

  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  const tmpFile = path.join(app.getPath('temp'), 'word_to_pdf_temp.html');
  fs.writeFileSync(tmpFile, html);
  await win.loadFile(tmpFile);
  await new Promise(r => setTimeout(r, 1000));
  const pdfData = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
  win.destroy();
  try { fs.unlinkSync(tmpFile); } catch (e) {}
  return Buffer.from(pdfData);
});

// ─── Conversions: Excel to PDF ───────────────────────────
ipcMain.handle('pdf:excelToPdf', async (e, filePath) => {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  let html = `<!DOCTYPE html><html><head><style>
    body { font-family: 'Helvetica', sans-serif; padding: 20px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 11px; }
    th { background: #f5f5f5; font-weight: bold; }
    h2 { color: #333; border-bottom: 2px solid #4ecdc4; padding-bottom: 5px; }
  </style></head><body>`;

  workbook.eachSheet(sheet => {
    html += `<h2>${sheet.name}</h2><table>`;
    sheet.eachRow((row, rowNum) => {
      html += '<tr>';
      row.eachCell((cell, colNum) => {
        const tag = rowNum === 1 ? 'th' : 'td';
        html += `<${tag}>${cell.value || ''}</${tag}>`;
      });
      html += '</tr>';
    });
    html += '</table>';
  });
  html += '</body></html>';

  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  const tmpFile = path.join(app.getPath('temp'), 'excel_to_pdf_temp.html');
  fs.writeFileSync(tmpFile, html);
  await win.loadFile(tmpFile);
  await new Promise(r => setTimeout(r, 1000));
  const pdfData = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
  win.destroy();
  try { fs.unlinkSync(tmpFile); } catch (e) {}
  return Buffer.from(pdfData);
});

// ─── Conversions: PowerPoint to PDF ──────────────────────
ipcMain.handle('pdf:pptToPdf', async (e, filePath) => {
  const JSZip = require('jszip');
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);
  const slides = [];
  const slideFiles = Object.keys(zip.files).filter(f => f.match(/ppt\/slides\/slide\d+\.xml/)).sort();

  for (const sf of slideFiles) {
    const content = await zip.files[sf].async('text');
    const textMatches = content.match(/<a:t>(.*?)<\/a:t>/g) || [];
    const texts = textMatches.map(m => m.replace(/<\/?a:t>/g, ''));
    slides.push(texts.join(' '));
  }

  let html = `<!DOCTYPE html><html><head><style>
    body { font-family: 'Helvetica', sans-serif; margin: 0; padding: 0; }
    .slide { width: 100%; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 60px; box-sizing: border-box; page-break-after: always; background: white; }
    .slide-content { font-size: 24px; color: #333; text-align: center; max-width: 800px; }
    .slide-num { position: absolute; bottom: 20px; right: 30px; color: #999; font-size: 12px; }
  </style></head><body>`;

  slides.forEach((text, i) => {
    html += `<div class="slide"><div class="slide-content">${text}</div><div class="slide-num">${i + 1}</div></div>`;
  });
  html += '</body></html>';

  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  const tmpFile = path.join(app.getPath('temp'), 'ppt_to_pdf_temp.html');
  fs.writeFileSync(tmpFile, html);
  await win.loadFile(tmpFile);
  await new Promise(r => setTimeout(r, 1000));
  const pdfData = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', landscape: true });
  win.destroy();
  try { fs.unlinkSync(tmpFile); } catch (e) {}
  return Buffer.from(pdfData);
});
