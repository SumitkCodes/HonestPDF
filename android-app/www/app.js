// HonestPDF Mobile — Browser-compatible (Capacitor Android)
// Uses pdf-lib via CDN, no Node.js required

const TOOLS = [
  { id:'merge', ic:'MG', title:'Merge PDF', desc:'Combine multiple PDFs', category:'operations' },
  { id:'split', ic:'SP', title:'Split PDF', desc:'Split into files', category:'operations' },
  { id:'compress', ic:'CZ', title:'Compress PDF', desc:'Reduce file size', category:'operations' },
  { id:'rotate', ic:'RT', title:'Rotate PDF', desc:'Rotate pages', category:'operations' },
  { id:'protect', ic:'🔒', title:'Protect', desc:'Password protect', category:'security' },
  { id:'unlock', ic:'🔓', title:'Unlock', desc:'Remove password', category:'security' },
  { id:'watermark', ic:'WM', title:'Watermark', desc:'Add text watermark', category:'enhance' },
  { id:'pageNumbers', ic:'#', title:'Page Numbers', desc:'Number pages', category:'enhance' },
  { id:'pdfToJpg', ic:'J', title:'PDF → JPG', desc:'Pages as images', category:'fromPdf' },
  { id:'jpgToPdf', ic:'I', title:'Images → PDF', desc:'JPG/PNG to PDF', category:'toPdf' },
  { id:'organize', ic:'OG', title:'Organize', desc:'Reorder pages', category:'operations' },
  { id:'repair', ic:'FX', title:'Repair', desc:'Fix files', category:'operations' },
];

const SECTIONS = {
  operations:'Modify', fromPdf:'Export', toPdf:'Import',
  security:'Security', enhance:'Annotate', advanced:'Advanced'
};

let currentTool = null, selectedFiles = [];

function renderCards(cat) {
  const c = document.getElementById('toolSections');
  const filtered = cat === 'all' ? TOOLS : TOOLS.filter(t => t.category === cat);
  const groups = {};
  filtered.forEach(t => { if (!groups[t.category]) groups[t.category] = []; groups[t.category].push(t); });
  let h = '';
  for (const [k, l] of Object.entries(SECTIONS)) {
    if (!groups[k]) continue;
    h += `<div class="section-label">${l}</div><div class="card-grid">`;
    h += groups[k].map(t => `
      <div class="tool-card" onclick="openTool('${t.id}')">
        <div class="tc-icon">${t.ic}</div>
        <div class="tc-name">${t.title}</div>
        <div class="tc-desc">${t.desc}</div>
      </div>`).join('');
    h += '</div>';
  }
  c.innerHTML = h;
}

// Tabs
document.querySelectorAll('.tab').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    b.classList.add('active');
    renderCards(b.dataset.cat);
  });
});

// Open tool
function openTool(id) {
  currentTool = id;
  selectedFiles = [];
  const tool = TOOLS.find(t => t.id === id);
  document.getElementById('toolTitle').textContent = tool.title;
  document.getElementById('toolDescription').textContent = tool.desc;
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('tabs').classList.add('hidden');
  document.querySelector('.header').classList.add('hidden');
  document.getElementById('toolView').classList.remove('hidden');
  renderToolUI(id);
}

document.getElementById('backBtn').addEventListener('click', () => {
  document.getElementById('toolView').classList.add('hidden');
  document.getElementById('mainView').classList.remove('hidden');
  document.getElementById('tabs').classList.remove('hidden');
  document.querySelector('.header').classList.remove('hidden');
  selectedFiles = [];
});

function showToast(msg, type='info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function showLoading(msg='Processing…') {
  document.getElementById('loadingText').textContent = msg;
  document.getElementById('loadingOverlay').classList.remove('hidden');
}
function hideLoading() { document.getElementById('loadingOverlay').classList.add('hidden'); }

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}

function dropZoneHTML(label, accept, multiple=false) {
  return `<div class="drop-zone" id="dropZone">
    <span class="dz-icon">↑</span>
    <div class="dz-text">${label}</div>
    <div class="dz-hint">Tap to select file</div>
    <input type="file" id="fileInput" accept="${accept}" ${multiple?'multiple':''}>
  </div>`;
}

function fileListHTML() {
  return `<div class="file-list" id="fileList">${selectedFiles.map((f,i) => `
    <div class="file-item">
      <span class="file-icon">📄</span>
      <span class="file-name">${f.name}</span>
      <span class="file-size">${formatBytes(f.size)}</span>
      <button class="file-remove" onclick="removeFile(${i})">✕</button>
    </div>`).join('')}</div>`;
}

function removeFile(i) { selectedFiles.splice(i,1); renderToolUI(currentTool); }

async function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
}

function renderToolUI(id) {
  const body = document.getElementById('toolBody');
  const accept = '.pdf';
  
  body.innerHTML = `
    ${dropZoneHTML('Select PDF file', accept, id === 'merge')}
    ${selectedFiles.length ? fileListHTML() : ''}
    ${id === 'rotate' ? `<div class="options-panel"><div class="options-title">Options</div>
      <div class="option-group"><label class="option-label">Angle</label>
      <select class="option-select" id="rotateAngle"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></div></div>` : ''}
    ${id === 'watermark' ? `<div class="options-panel"><div class="options-title">Options</div>
      <div class="option-group"><label class="option-label">Text</label><input class="option-input" id="watermarkText" value="CONFIDENTIAL"></div></div>` : ''}
    ${id === 'protect' ? `<div class="options-panel"><div class="options-title">Options</div>
      <div class="option-group"><label class="option-label">Password</label><input class="option-input" id="pdfPassword" type="password" placeholder="Enter password"></div></div>` : ''}
    ${id === 'jpgToPdf' ? dropZoneHTML('Select images', 'image/*', true).replace('id="dropZone"', 'id="dropZone"').replace('id="fileInput"','id="fileInput"') : ''}
    <div class="action-bar">
      <button class="btn btn-primary" onclick="executeTool()" ${!selectedFiles.length?'disabled':''}>Process</button>
    </div>
    <div id="resultArea"></div>`;

  const input = document.getElementById('fileInput');
  if (input) {
    input.addEventListener('change', e => {
      for (const f of e.target.files) selectedFiles.push(f);
      renderToolUI(id);
    });
  }
}

async function executeTool() {
  if (!selectedFiles.length) return showToast('Select a file first', 'error');
  showLoading();
  
  try {
    const { PDFDocument, StandardFonts, rgb, degrees } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
    const file = selectedFiles[0];
    const bytes = new Uint8Array(await readFileAsArrayBuffer(file));
    let resultBytes, resultName;

    switch (currentTool) {
      case 'merge': {
        const merged = await PDFDocument.create();
        for (const f of selectedFiles) {
          const src = await PDFDocument.load(await readFileAsArrayBuffer(f));
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach(p => merged.addPage(p));
        }
        resultBytes = await merged.save();
        resultName = 'merged.pdf';
        break;
      }
      case 'split': {
        const src = await PDFDocument.load(bytes);
        // Split into individual pages and download first page as demo
        const newPdf = await PDFDocument.create();
        const [p] = await newPdf.copyPages(src, [0]);
        newPdf.addPage(p);
        resultBytes = await newPdf.save();
        resultName = 'page-1.pdf';
        showToast(`PDF has ${src.getPageCount()} pages — downloaded page 1`, 'info');
        break;
      }
      case 'compress': {
        const src = await PDFDocument.load(bytes);
        resultBytes = await src.save({ useObjectStreams: true });
        resultName = 'compressed.pdf';
        break;
      }
      case 'rotate': {
        const angle = parseInt(document.getElementById('rotateAngle')?.value || '90');
        const src = await PDFDocument.load(bytes);
        src.getPages().forEach(p => p.setRotation(degrees(angle)));
        resultBytes = await src.save();
        resultName = 'rotated.pdf';
        break;
      }
      case 'watermark': {
        const text = document.getElementById('watermarkText')?.value || 'DRAFT';
        const src = await PDFDocument.load(bytes);
        const font = await src.embedFont(StandardFonts.HelveticaBold);
        src.getPages().forEach(pg => {
          const { width, height } = pg.getSize();
          pg.drawText(text, { x: width/2 - 80, y: height/2, size: 54, font, color: rgb(.8,.8,.8), opacity: .2, rotate: degrees(-45) });
        });
        resultBytes = await src.save();
        resultName = 'watermarked.pdf';
        break;
      }
      case 'pageNumbers': {
        const src = await PDFDocument.load(bytes);
        const font = await src.embedFont(StandardFonts.Helvetica);
        const total = src.getPageCount();
        src.getPages().forEach((pg, i) => {
          const { width } = pg.getSize();
          const txt = `${i+1} / ${total}`;
          pg.drawText(txt, { x: (width - font.widthOfTextAtSize(txt,10))/2, y: 20, size: 10, font, color: rgb(.4,.4,.4) });
        });
        resultBytes = await src.save();
        resultName = 'numbered.pdf';
        break;
      }
      case 'protect': {
        const pw = document.getElementById('pdfPassword')?.value;
        if (!pw) { hideLoading(); return showToast('Enter a password', 'error'); }
        const src = await PDFDocument.load(bytes);
        resultBytes = await src.save({ userPassword: pw, ownerPassword: pw });
        resultName = 'protected.pdf';
        break;
      }
      case 'unlock': {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        resultBytes = await src.save();
        resultName = 'unlocked.pdf';
        break;
      }
      case 'organize': {
        const src = await PDFDocument.load(bytes);
        const newPdf = await PDFDocument.create();
        const indices = [...Array(src.getPageCount()).keys()].reverse();
        const pages = await newPdf.copyPages(src, indices);
        pages.forEach(p => newPdf.addPage(p));
        resultBytes = await newPdf.save();
        resultName = 'reorganized.pdf';
        break;
      }
      case 'repair': {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false });
        resultBytes = await src.save();
        resultName = 'repaired.pdf';
        break;
      }
      default:
        hideLoading();
        return showToast('This tool is available on desktop only', 'info');
    }

    if (resultBytes) {
      const blob = new Blob([resultBytes], { type: 'application/pdf' });
      downloadBlob(blob, resultName);
      document.getElementById('resultArea').innerHTML = `
        <div class="result-area">
          <div class="result-header"><span class="result-icon">✓</span><span class="result-title">Done</span></div>
          <div class="result-info">Output: ${resultName} (${formatBytes(resultBytes.length)})</div>
        </div>`;
      showToast('File saved!', 'success');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    console.error(err);
  }
  hideLoading();
}

// Init
renderCards('all');
