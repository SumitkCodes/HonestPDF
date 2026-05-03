const { ipcRenderer } = require('electron');
const path = require('path');

// Tool definitions - short icon labels instead of emojis
const TOOLS = [
  { id:'merge',       ic:'MG', title:'Merge PDF',         desc:'Combine multiple PDFs',         category:'operations' },
  { id:'split',       ic:'SP', title:'Split PDF',          desc:'Split into separate files',     category:'operations' },
  { id:'compress',    ic:'CZ', title:'Compress PDF',       desc:'Reduce file size',              category:'operations' },
  { id:'rotate',      ic:'RT', title:'Rotate PDF',         desc:'Rotate pages',                  category:'operations' },
  { id:'organize',    ic:'OG', title:'Organize Pages',     desc:'Reorder or delete pages',       category:'operations' },
  { id:'repair',      ic:'FX', title:'Repair PDF',         desc:'Fix corrupted files',            category:'operations' },
  { id:'pdfToWord',   ic:'W',  title:'PDF → Word',         desc:'Export as .docx',               category:'fromPdf' },
  { id:'pdfToExcel',  ic:'X',  title:'PDF → Excel',        desc:'Export as .xlsx',               category:'fromPdf' },
  { id:'pdfToPpt',    ic:'P',  title:'PDF → PowerPoint',   desc:'Export as .pptx',               category:'fromPdf' },
  { id:'pdfToJpg',    ic:'J',  title:'PDF → JPG',          desc:'Pages as images',               category:'fromPdf' },
  { id:'wordToPdf',   ic:'W',  title:'Word → PDF',         desc:'Convert .docx',                 category:'toPdf' },
  { id:'excelToPdf',  ic:'X',  title:'Excel → PDF',        desc:'Convert .xlsx',                 category:'toPdf' },
  { id:'pptToPdf',    ic:'P',  title:'PPT → PDF',          desc:'Convert .pptx',                 category:'toPdf' },
  { id:'jpgToPdf',    ic:'I',  title:'Images → PDF',       desc:'JPG / PNG to PDF',              category:'toPdf' },
  { id:'htmlToPdf',   ic:'H',  title:'HTML → PDF',         desc:'Webpage to PDF',                category:'toPdf' },
  { id:'protect',     ic:'🔒', title:'Protect',            desc:'Password protect',              category:'security' },
  { id:'unlock',      ic:'🔓', title:'Unlock',             desc:'Remove password',               category:'security' },
  { id:'sign',        ic:'✎', title:'Sign PDF',            desc:'Embed signature',               category:'security' },
  { id:'watermark',   ic:'WM', title:'Watermark',          desc:'Add text watermark',            category:'enhance' },
  { id:'pageNumbers', ic:'#',  title:'Page Numbers',       desc:'Number your pages',             category:'enhance' },
  { id:'edit',        ic:'Ed', title:'Edit PDF',           desc:'Add text annotations',          category:'enhance' },
  { id:'ocr',         ic:'OCR',title:'OCR',                desc:'Extract text from scans',       category:'advanced' },
  { id:'pdfA',        ic:'/A', title:'PDF / A',            desc:'Archive-ready format',          category:'advanced' },
  { id:'scan',        ic:'SC', title:'Scan to PDF',        desc:'Camera document scan',          category:'advanced' },
];

const SECTIONS = {
  operations: 'Modify',
  fromPdf:    'Export from PDF',
  toPdf:      'Convert to PDF',
  security:   'Security',
  enhance:    'Annotate',
  advanced:   'Advanced',
};

let currentTool = null;
let selectedFiles = [];
let sigCanvas = null, sigCtx = null, isDrawing = false;
let activeCategory = 'all';

// ── Build dashboard ─────────────────────────────────────────
function initDashboard() {
  renderCards(activeCategory);
}

function renderCards(cat) {
  const container = document.getElementById('toolSections');
  const filtered = cat === 'all' ? TOOLS : TOOLS.filter(t => t.category === cat);
  const groups = {};
  filtered.forEach(t => {
    if (!groups[t.category]) groups[t.category] = [];
    groups[t.category].push(t);
  });

  let html = '';
  for (const [key, label] of Object.entries(SECTIONS)) {
    if (!groups[key]) continue;
    html += `<div class="section-label">${label}</div><div class="card-grid">`;
    html += groups[key].map(t => `
      <div class="tool-card" data-tool="${t.id}" onclick="openTool('${t.id}')">
        <div class="tc-icon">${t.ic}</div>
        <div class="tc-name">${t.title}</div>
        <div class="tc-desc">${t.desc}</div>
      </div>`).join('');
    html += '</div>';
  }
  container.innerHTML = html;
}

// ── Category tabs ───────────────────────────────────────────
document.querySelectorAll('.cat-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.cat;
    renderCards(activeCategory);
  });
});

// ── Search ──────────────────────────────────────────────────
document.getElementById('searchInput').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.tool-card').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
  // hide empty section labels
  document.querySelectorAll('.section-label').forEach(lbl => {
    const grid = lbl.nextElementSibling;
    if (!grid) return;
    const visible = grid.querySelectorAll('.tool-card:not([style*="display: none"])');
    lbl.style.display = visible.length ? '' : 'none';
  });
});

// ── Navigation ──────────────────────────────────────────────
document.getElementById('backBtn').addEventListener('click', () => {
  document.getElementById('toolView').classList.add('hidden');
  document.getElementById('dashboardView').classList.remove('hidden');
  document.getElementById('categoryBar').classList.remove('hidden');
  selectedFiles = [];
});

function openTool(id) {
  currentTool = id;
  selectedFiles = [];
  const tool = TOOLS.find(t => t.id === id);
  document.getElementById('toolTitle').textContent = tool.title;
  document.getElementById('toolDescription').textContent = tool.desc;
  document.getElementById('dashboardView').classList.add('hidden');
  document.getElementById('categoryBar').classList.add('hidden');
  document.getElementById('toolView').classList.remove('hidden');
  renderToolUI(id);
}


function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}

function showToast(msg, type='info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function showLoading(text='Processing...') {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

function dropZoneHTML(label, accept, multiple=false) {
  return `<div class="drop-zone" id="dropZone">
    <span class="dz-icon">↑</span>
    <div class="dz-text">${label}</div>
    <div class="dz-hint">or click to browse</div>
    <input type="file" id="fileInput" accept="${accept}" ${multiple?'multiple':''}>
  </div>`;
}

function fileListHTML() {
  return `<div class="file-list" id="fileList"></div>`;
}

function addFileItems(files) {
  const list = document.getElementById('fileList');
  if (!list) return;
  files.forEach(fp => {
    const name = fp.split ? fp.split(/[\\/]/).pop() : fp.name;
    const size = '-';
    const div = document.createElement('div');
    div.className = 'file-item';
    div.innerHTML = `<span class="file-icon">📄</span><span class="file-name">${name}</span><span class="file-size">${size}</span><button class="file-remove" data-path="${fp}" title="Remove">✕</button>`;
    list.appendChild(div);
  });
  list.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const fp = btn.dataset.path;
      selectedFiles = selectedFiles.filter(f => f !== fp);
      btn.closest('.file-item').remove();
    });
  });
}

function setupDropZone(accept, multiple, onFiles) {
  const dz = document.getElementById('dropZone');
  const fi = document.getElementById('fileInput');
  if (!dz || !fi) return;
  fi.addEventListener('change', e => {
    const paths = Array.from(e.target.files).map(f => f.path);
    onFiles(paths);
    fi.value='';
  });
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const paths = Array.from(e.dataTransfer.files).map(f => f.path);
    onFiles(paths);
  });
}

async function saveResult(data, defaultName, filters) {
  const savePath = await ipcRenderer.invoke('dialog:saveFile', { defaultPath: defaultName, filters });
  if (!savePath) return;
  await ipcRenderer.invoke('file:write', savePath, Array.from(data));
  showToast('File saved successfully!', 'success');
  document.getElementById('resultArea') && (document.getElementById('resultArea').querySelector('.result-info').textContent = 'Saved to: ' + savePath);
  setTimeout(() => ipcRenderer.invoke('file:showInFolder', savePath), 500);
}

// ─── Tool UI Renderer ───────────────────────────────────────
function renderToolUI(id) {
  const body = document.getElementById('toolBody');
  body.innerHTML = '';
  const r = document.createElement('div');
  body.appendChild(r);

  switch(id) {
    case 'merge': renderMerge(r); break;
    case 'split': renderSplit(r); break;
    case 'compress': renderCompress(r); break;
    case 'rotate': renderRotate(r); break;
    case 'organize': renderOrganize(r); break;
    case 'repair': renderRepair(r); break;
    case 'pdfToWord': renderConvertFrom(r,'pdfToWord','PDF to Word','.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'); break;
    case 'pdfToExcel': renderConvertFrom(r,'pdfToExcel','PDF to Excel','.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); break;
    case 'pdfToPpt': renderConvertFrom(r,'pdfToPpt','PDF to PowerPoint','.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation'); break;
    case 'pdfToJpg': renderPdfToJpg(r); break;
    case 'wordToPdf': renderToPdf(r,'wordToPdf','Word','Word Files','doc,docx'); break;
    case 'excelToPdf': renderToPdf(r,'excelToPdf','Excel','Excel Files','xls,xlsx'); break;
    case 'pptToPdf': renderToPdf(r,'pptToPdf','PowerPoint','PPT Files','ppt,pptx'); break;
    case 'jpgToPdf': renderJpgToPdf(r); break;
    case 'htmlToPdf': renderHtmlToPdf(r); break;
    case 'protect': renderProtect(r); break;
    case 'unlock': renderUnlock(r); break;
    case 'sign': renderSign(r); break;
    case 'watermark': renderWatermark(r); break;
    case 'pageNumbers': renderPageNumbers(r); break;
    case 'edit': renderEdit(r); break;
    case 'ocr': renderOcr(r); break;
    case 'pdfA': renderPdfA(r); break;
    case 'scan': renderScan(r); break;
  }
}

// ─── Merge ──────────────────────────────────────────────────
function renderMerge(r) {
  r.innerHTML = dropZoneHTML('Drop PDFs here to merge','application/pdf',true) + fileListHTML() +
    `<div class="action-bar"><button class="btn btn-primary" id="mergeBtn">📎 Merge PDFs</button></div><div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('application/pdf',true,paths=>{selectedFiles.push(...paths);addFileItems(paths);});
  document.getElementById('mergeBtn').onclick = async()=>{
    if(selectedFiles.length<2){showToast('Select at least 2 PDFs','error');return;}
    showLoading('Merging PDFs...');
    try{
      const data=await ipcRenderer.invoke('pdf:merge',selectedFiles);
      hideLoading();showResult(r,`Merged ${selectedFiles.length} files`);
      document.getElementById('saveBtn').onclick=()=>saveResult(data,'merged.pdf',[{name:'PDF',extensions:['pdf']}]);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── Split ──────────────────────────────────────────────────
function renderSplit(r) {
  r.innerHTML = dropZoneHTML('Drop a PDF to split','application/pdf') + fileListHTML() +
    `<div class="options-panel">
      <div class="options-title">Split Options</div>
      <div class="option-group"><label class="option-label">Mode</label>
        <select class="option-select" id="splitMode">
          <option value="all">Extract every page as separate PDF</option>
          <option value="range">Custom page ranges</option>
        </select>
      </div>
      <div class="option-group" id="rangeGroup" style="display:none">
        <label class="option-label">Page Ranges (e.g. 1-3, 4-6)</label>
        <input class="option-input" id="rangeInput" placeholder="1-3, 4-6, 7-10">
      </div>
    </div>
    <div class="action-bar"><button class="btn btn-primary" id="splitBtn">✂️ Split PDF</button></div>
    <div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('application/pdf',false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  document.getElementById('splitMode').onchange=e=>{
    document.getElementById('rangeGroup').style.display=e.target.value==='range'?'':'none';
  };
  document.getElementById('splitBtn').onclick=async()=>{
    if(!selectedFiles[0]){showToast('Select a PDF first','error');return;}
    showLoading('Splitting PDF...');
    try{
      let results;
      const mode=document.getElementById('splitMode').value;
      if(mode==='all'){
        results=await ipcRenderer.invoke('pdf:splitAll',selectedFiles[0]);
      } else {
        const raw=document.getElementById('rangeInput').value;
        const ranges=raw.split(',').map(s=>{const[a,b]=s.trim().split('-');return{start:parseInt(a)-1,end:parseInt(b||a)-1};});
        results=await ipcRenderer.invoke('pdf:split',selectedFiles[0],ranges);
      }
      hideLoading();
      const folder=await ipcRenderer.invoke('dialog:openFolder');
      if(!folder){showToast('No folder selected','error');return;}
      for(let i=0;i<results.length;i++){
        await ipcRenderer.invoke('file:write',require('path').join(folder,`page_${i+1}.pdf`),Array.from(results[i]));
      }
      showToast(`Saved ${results.length} files to folder`,'success');
      showResult(r,`Split into ${results.length} files`,false);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── Compress ───────────────────────────────────────────
function renderCompress(r) {
  r.innerHTML = dropZoneHTML('Drop a PDF to compress','application/pdf') + fileListHTML() +
    `<div class="options-panel"><div class="options-title">Compression Level</div>
      <div class="option-group"><label class="option-label">Quality</label>
        <select class="option-select" id="compressQuality">
          <option value="screen">Screen (smallest, ~72 DPI)</option>
          <option value="ebook" selected>eBook (balanced, ~150 DPI)</option>
          <option value="high">High (best quality, ~300 DPI)</option>
        </select>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:8px">Uses Ghostscript if installed, otherwise re-renders pages via canvas. Both methods genuinely reduce file size.</p>
    </div>
    <div class="action-bar"><button class="btn btn-primary" id="compressBtn">📦 Compress PDF</button></div>
    <div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('application/pdf',false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  document.getElementById('compressBtn').onclick = async () => {
    if(!selectedFiles[0]){showToast('Select a PDF first','error');return;}
    const quality = document.getElementById('compressQuality').value;
    showLoading('Compressing PDF...');
    try {
      const res = await ipcRenderer.invoke('pdf:compress', selectedFiles[0], quality);
      if (res.needsRendererCompression) {
        // Ghostscript not available - use canvas rendering
        document.getElementById('loadingText').textContent = 'Rendering pages (no Ghostscript found)...';
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
        const rawData = await ipcRenderer.invoke('file:read', selectedFiles[0]);
        const pdf = await pdfjsLib.getDocument({data: new Uint8Array(rawData)}).promise;
        const scale = quality === 'screen' ? 0.75 : quality === 'high' ? 1.5 : 1.0;
        const jpegQuality = quality === 'screen' ? 0.55 : quality === 'high' ? 0.88 : 0.72;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const jpegPages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          document.getElementById('loadingText').textContent = `Compressing page ${i}/${pdf.numPages}...`;
          const page = await pdf.getPage(i);
          const vp = page.getViewport({scale});
          canvas.width = vp.width; canvas.height = vp.height;
          ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({canvasContext: ctx, viewport: vp}).promise;
          const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', jpegQuality));
          const ab = await blob.arrayBuffer();
          jpegPages.push(Array.from(new Uint8Array(ab)));
        }
        const compRes = await ipcRenderer.invoke('pdf:compressFromImages', jpegPages, res.originalSize);
        hideLoading();
        const saved = compRes.originalSize - compRes.newSize;
        const pct = ((saved / compRes.originalSize) * 100).toFixed(1);
        if (saved <= 0) {
          showResult(r, `File is already well-compressed (${formatBytes(compRes.originalSize)})`);
        } else {
          showResult(r, `Reduced by ${formatBytes(saved)} (${pct}% smaller) - ${formatBytes(compRes.originalSize)} → ${formatBytes(compRes.newSize)}`);
        }
        document.getElementById('saveBtn').onclick = () => saveResult(compRes.data, 'compressed.pdf', [{name:'PDF',extensions:['pdf']}]);
      } else {
        // Ghostscript succeeded
        hideLoading();
        const saved = res.originalSize - res.newSize;
        const pct = ((saved / res.originalSize) * 100).toFixed(1);
        if (saved <= 0) {
          showResult(r, `File already optimized (${formatBytes(res.originalSize)})`);
        } else {
          showResult(r, `Reduced by ${formatBytes(saved)} (${pct}% smaller) via Ghostscript - ${formatBytes(res.originalSize)} → ${formatBytes(res.newSize)}`);
        }
        document.getElementById('saveBtn').onclick = () => saveResult(res.data, 'compressed.pdf', [{name:'PDF',extensions:['pdf']}]);
      }
    } catch(e) { hideLoading(); showToast('Error: '+e.message,'error'); }
  };
}

// ─── Rotate ─────────────────────────────────────────────────
function renderRotate(r) {
  r.innerHTML = dropZoneHTML('Drop a PDF to rotate','application/pdf') + fileListHTML() +
    `<div class="options-panel"><div class="options-title">Rotation</div>
      <div class="option-row">
        <div class="option-group"><label class="option-label">Angle</label>
          <select class="option-select" id="rotAngle"><option value="90">90° Clockwise</option><option value="-90">90° Counter-Clockwise</option><option value="180">180°</option></select>
        </div>
        <div class="option-group"><label class="option-label">Apply To</label>
          <select class="option-select" id="rotPages"><option value="all">All Pages</option><option value="custom">Specific Pages</option></select>
        </div>
      </div>
      <div class="option-group" id="rotCustomGroup" style="display:none">
        <label class="option-label">Page Numbers (e.g. 1,3,5)</label>
        <input class="option-input" id="rotCustomPages" placeholder="1, 3, 5">
      </div>
    </div>
    <div class="action-bar"><button class="btn btn-primary" id="rotateBtn">🔄 Rotate</button></div>
    <div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('application/pdf',false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  document.getElementById('rotPages').onchange=e=>{
    document.getElementById('rotCustomGroup').style.display=e.target.value==='custom'?'':'none';
  };
  document.getElementById('rotateBtn').onclick=async()=>{
    if(!selectedFiles[0]){showToast('Select a PDF first','error');return;}
    showLoading('Rotating...');
    try{
      const angle=parseInt(document.getElementById('rotAngle').value);
      const mode=document.getElementById('rotPages').value;
      let indices=[];
      if(mode==='custom'){
        indices=document.getElementById('rotCustomPages').value.split(',').map(n=>parseInt(n.trim())-1).filter(n=>!isNaN(n));
      }
      const data=await ipcRenderer.invoke('pdf:rotate',selectedFiles[0],angle,indices);
      hideLoading();showResult(r,'PDF rotated successfully');
      document.getElementById('saveBtn').onclick=()=>saveResult(data,'rotated.pdf',[{name:'PDF',extensions:['pdf']}]);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── Organize ───────────────────────────────────────────────
function renderOrganize(r) {
  r.innerHTML = dropZoneHTML('Drop a PDF to organize pages','application/pdf') + fileListHTML() +
    `<div id="organizeArea" class="hidden">
      <div class="options-title" style="margin-bottom:12px">Drag to reorder · Click ✕ to delete pages</div>
      <div class="page-grid" id="pageGrid"></div>
      <div class="action-bar"><button class="btn btn-primary" id="saveOrgBtn">💾 Save Organized PDF</button></div>
    </div>`;
  setupDropZone('application/pdf',false,async paths=>{
    selectedFiles=[paths[0]];
    document.getElementById('fileList').innerHTML='';
    addFileItems([paths[0]]);
    showLoading('Loading pages...');
    try{
      const info=await ipcRenderer.invoke('pdf:getInfo',paths[0]);
      hideLoading();
      document.getElementById('organizeArea').classList.remove('hidden');
      const grid=document.getElementById('pageGrid');
      grid.innerHTML='';
      for(let i=0;i<info.pageCount;i++){
        const div=document.createElement('div');
        div.className='page-thumb';
        div.draggable=true;
        div.dataset.idx=i;
        div.innerHTML=`<div style="background:#fff3;height:80px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:12px">Page</div><div class="page-num">Page ${i+1}</div><button class="page-delete" title="Delete">✕</button>`;
        div.querySelector('.page-delete').onclick=()=>div.remove();
        div.ondragstart=e=>e.dataTransfer.setData('text/plain',div.dataset.idx);
        div.ondragover=e=>e.preventDefault();
        div.ondrop=e=>{e.preventDefault();const from=e.dataTransfer.getData('text/plain');const all=[...grid.children];const fromEl=grid.querySelector(`[data-idx="${from}"]`);grid.insertBefore(fromEl,div);};
        grid.appendChild(div);
      }
      document.getElementById('saveOrgBtn').onclick=async()=>{
        const order=[...grid.querySelectorAll('.page-thumb')].map(el=>parseInt(el.dataset.idx));
        showLoading('Saving...');
        const data=await ipcRenderer.invoke('pdf:organize',selectedFiles[0],order);
        hideLoading();
        saveResult(data,'organized.pdf',[{name:'PDF',extensions:['pdf']}]);
      };
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  });
}

// ─── Repair ─────────────────────────────────────────────────
function renderRepair(r) {
  r.innerHTML = dropZoneHTML('Drop a damaged PDF to repair','application/pdf') + fileListHTML() +
    `<div class="action-bar"><button class="btn btn-primary" id="repairBtn">🔧 Repair PDF</button></div><div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('application/pdf',false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  document.getElementById('repairBtn').onclick=async()=>{
    if(!selectedFiles[0]){showToast('Select a PDF first','error');return;}
    showLoading('Repairing...');
    try{
      const res=await ipcRenderer.invoke('pdf:repair',selectedFiles[0]);
      hideLoading();
      if(res.success){showResult(r,'PDF repaired successfully');document.getElementById('saveBtn').onclick=()=>saveResult(res.data,'repaired.pdf',[{name:'PDF',extensions:['pdf']}]);}
      else{showToast('Repair failed: '+res.error,'error');}
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── Helper: extract text from PDF using pdfjs (renderer-side) ───
async function extractPdfText(filePath) {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
  const rawData = await ipcRenderer.invoke('file:read', filePath);
  const pdf = await pdfjsLib.getDocument({data: new Uint8Array(rawData)}).promise;
  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Preserve layout by grouping items by y-position
    const lines = {};
    content.items.forEach(item => {
      const y = Math.round(item.transform[5]);
      if (!lines[y]) lines[y] = [];
      lines[y].push(item.str);
    });
    const sortedY = Object.keys(lines).sort((a,b) => b-a);
    const pageText = sortedY.map(y => lines[y].join(' ')).join('\n');
    pageTexts.push(pageText);
  }
  return { text: pageTexts.join('\n\n--- PAGE BREAK ---\n\n'), pages: pageTexts, count: pdf.numPages };
}

// ─── Convert From PDF (Word/Excel/PPT) ─────────────────────────
function renderConvertFrom(r, ipcMethod, label, ext, mime) {
  r.innerHTML = dropZoneHTML('Drop a PDF to convert','application/pdf') + fileListHTML() +
    `<div class="action-bar"><button class="btn btn-primary" id="convertBtn">⚡ Convert to ${label.split(' ').pop()}</button></div><div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('application/pdf',false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  document.getElementById('convertBtn').onclick = async () => {
    if(!selectedFiles[0]){showToast('Select a PDF first','error');return;}
    showLoading(`Extracting text from PDF...`);
    try {
      // Step 1: extract real text from PDF
      const extracted = await extractPdfText(selectedFiles[0]);
      if (!extracted.text.trim()) {
        hideLoading();
        showToast('No text found. This may be a scanned PDF - try OCR first.', 'error');
        return;
      }
      showLoading(`Converting to ${label.split(' ').pop()}...`);
      let data;
      if (ipcMethod === 'pdfToWord') {
        data = await ipcRenderer.invoke('pdf:pdfToWord', null, extracted.text);
      } else if (ipcMethod === 'pdfToExcel') {
        data = await ipcRenderer.invoke('pdf:pdfToExcel', extracted.text);
      } else {
        data = await ipcRenderer.invoke('pdf:pdfToPpt', extracted.text, extracted.count);
      }
      hideLoading();
      showResult(r, `Converted ${extracted.count} pages - text extracted and embedded`);
      const name = selectedFiles[0].split(/[\/\\]/).pop().replace('.pdf', ext);
      document.getElementById('saveBtn').onclick = () => saveResult(data, name, [{name: label, extensions: [ext.replace('.','')]}]);
    } catch(e) { hideLoading(); showToast('Error: '+e.message,'error'); }
  };
}

// ─── PDF to JPG ─────────────────────────────────────────────
function renderPdfToJpg(r) {
  r.innerHTML = dropZoneHTML('Drop a PDF to extract images','application/pdf') + fileListHTML() +
    `<div class="options-panel"><div class="options-title">Options</div>
      <div class="option-row">
        <div class="option-group"><label class="option-label">Quality (DPI)</label>
          <select class="option-select" id="jpgDpi"><option value="96">Screen (96 DPI)</option><option value="150" selected>Medium (150 DPI)</option><option value="300">High (300 DPI)</option></select>
        </div>
        <div class="option-group"><label class="option-label">Pages</label>
          <select class="option-select" id="jpgPages"><option value="all">All Pages</option><option value="first">First Page Only</option></select>
        </div>
      </div>
    </div>
    <div class="action-bar"><button class="btn btn-primary" id="jpgBtn">🖼️ Convert to JPG</button></div>
    <div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('application/pdf',false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  document.getElementById('jpgBtn').onclick=async()=>{
    if(!selectedFiles[0]){showToast('Select a PDF first','error');return;}
    showLoading('Converting pages to images...');
    try{
      const info=await ipcRenderer.invoke('pdf:getInfo',selectedFiles[0]);
      const folder=await ipcRenderer.invoke('dialog:openFolder');
      if(!folder){hideLoading();return;}
      const pdfjsLib=require('pdfjs-dist/legacy/build/pdf.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc=require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
      const data=await ipcRenderer.invoke('file:read',selectedFiles[0]);
      const pdf=await pdfjsLib.getDocument({data:new Uint8Array(data)}).promise;
      const total=document.getElementById('jpgPages').value==='first'?1:pdf.numPages;
      const canvas=document.createElement('canvas');
      const scale=parseFloat(document.getElementById('jpgDpi').value)/96;
      for(let i=1;i<=total;i++){
        const page=await pdf.getPage(i);
        const vp=page.getViewport({scale});
        canvas.width=vp.width;canvas.height=vp.height;
        await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
        const blob=await new Promise(res=>canvas.toBlob(res,'image/jpeg',0.92));
        const ab=await blob.arrayBuffer();
        await ipcRenderer.invoke('file:write',require('path').join(folder,`page_${i}.jpg`),Array.from(new Uint8Array(ab)));
      }
      hideLoading();showToast(`Saved ${total} JPG files`,'success');
      showResult(r,`Extracted ${total} page images`,false);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── X to PDF ───────────────────────────────────────────────
function renderToPdf(r,ipcMethod,label,filterName,exts) {
  r.innerHTML = dropZoneHTML(`Drop a ${label} file to convert`,`.${exts.split(',').join(',.')}`) + fileListHTML() +
    `<div class="action-bar"><button class="btn btn-primary" id="toPdfBtn">⚡ Convert to PDF</button></div><div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('.'+exts.split(',').join(',.'),false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  document.getElementById('toPdfBtn').onclick=async()=>{
    if(!selectedFiles[0]){showToast(`Select a ${label} file first`,'error');return;}
    showLoading(`Converting ${label} to PDF...`);
    try{
      const data=await ipcRenderer.invoke(`pdf:${ipcMethod}`,selectedFiles[0]);
      hideLoading();showResult(r,'Converted successfully');
      const name=selectedFiles[0].split(/[\\/]/).pop().replace(/\.[^.]+$/,'.pdf');
      document.getElementById('saveBtn').onclick=()=>saveResult(data,name,[{name:'PDF',extensions:['pdf']}]);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── JPG to PDF ─────────────────────────────────────────────
function renderJpgToPdf(r) {
  r.innerHTML = dropZoneHTML('Drop images (JPG, PNG) here','image/*',true) + fileListHTML() +
    `<div class="options-panel"><div class="options-title">Options</div>
      <div class="option-group"><label class="option-label">Page Size</label>
        <select class="option-select" id="imgPageSize"><option value="fit">Fit to image</option><option value="A4">A4</option></select>
      </div>
    </div>
    <div class="action-bar"><button class="btn btn-primary" id="jpgToPdfBtn">⚡ Create PDF</button></div>
    <div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('image/*',true,paths=>{selectedFiles.push(...paths);addFileItems(paths);});
  document.getElementById('jpgToPdfBtn').onclick=async()=>{
    if(!selectedFiles.length){showToast('Add images first','error');return;}
    showLoading('Creating PDF...');
    try{
      const pageSize=document.getElementById('imgPageSize').value;
      const data=await ipcRenderer.invoke('pdf:jpgToPdf',selectedFiles,{pageSize});
      hideLoading();showResult(r,`Created PDF from ${selectedFiles.length} images`);
      document.getElementById('saveBtn').onclick=()=>saveResult(data,'images.pdf',[{name:'PDF',extensions:['pdf']}]);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── HTML to PDF ─────────────────────────────────────────────
function renderHtmlToPdf(r) {
  r.innerHTML = `
    <div class="options-panel">
      <div class="options-title">HTML Content</div>
      <div class="option-group"><label class="option-label">Paste HTML</label>
        <textarea class="option-textarea" id="htmlInput" placeholder="<h1>Hello</h1><p>Your HTML here...</p>" style="min-height:200px;font-family:monospace;font-size:12px"></textarea>
      </div>
    </div>
    <div class="action-bar">
      <button class="btn btn-secondary" id="loadHtmlFile">📂 Load HTML File</button>
      <button class="btn btn-primary" id="htmlToPdfBtn">⚡ Convert to PDF</button>
    </div>
    <div id="resultArea" class="result-area hidden"></div>`;
  document.getElementById('loadHtmlFile').onclick=async()=>{
    const paths=await ipcRenderer.invoke('dialog:openFiles',{filters:[{name:'HTML',extensions:['html','htm']}]});
    if(paths&&paths[0]){
      const data=await ipcRenderer.invoke('file:read',paths[0]);
      document.getElementById('htmlInput').value=Buffer.from(data).toString('utf8');
    }
  };
  document.getElementById('htmlToPdfBtn').onclick=async()=>{
    const html=document.getElementById('htmlInput').value.trim();
    if(!html){showToast('Enter HTML content first','error');return;}
    showLoading('Converting...');
    try{
      const data=await ipcRenderer.invoke('pdf:htmlToPdf',html);
      hideLoading();showResult(r,'HTML converted to PDF');
      document.getElementById('saveBtn').onclick=()=>saveResult(data,'converted.pdf',[{name:'PDF',extensions:['pdf']}]);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── Protect ────────────────────────────────────────────────
function renderProtect(r) {
  r.innerHTML = dropZoneHTML('Drop a PDF to protect','application/pdf') + fileListHTML() +
    `<div class="options-panel"><div class="options-title">Password Settings</div>
      <div class="option-group"><label class="option-label">Password</label><input class="option-input" type="password" id="pwdInput" placeholder="Enter password"></div>
      <div class="option-group"><label class="option-label">Confirm Password</label><input class="option-input" type="password" id="pwdConfirm" placeholder="Confirm password"></div>
    </div>
    <div class="action-bar"><button class="btn btn-primary" id="protectBtn">🔒 Protect PDF</button></div>
    <div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('application/pdf',false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  document.getElementById('protectBtn').onclick=async()=>{
    if(!selectedFiles[0]){showToast('Select a PDF first','error');return;}
    const pwd=document.getElementById('pwdInput').value;
    const conf=document.getElementById('pwdConfirm').value;
    if(!pwd){showToast('Enter a password','error');return;}
    if(pwd!==conf){showToast('Passwords do not match','error');return;}
    showLoading('Encrypting...');
    try{
      const data=await ipcRenderer.invoke('pdf:protect',selectedFiles[0],pwd);
      hideLoading();showResult(r,'PDF protected with password');
      document.getElementById('saveBtn').onclick=()=>saveResult(data,'protected.pdf',[{name:'PDF',extensions:['pdf']}]);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── Unlock ─────────────────────────────────────────────────
function renderUnlock(r) {
  r.innerHTML = dropZoneHTML('Drop a password-protected PDF','application/pdf') + fileListHTML() +
    `<div class="options-panel"><div class="options-title">Unlock</div>
      <div class="option-group"><label class="option-label">Password</label><input class="option-input" type="password" id="unlockPwd" placeholder="Enter PDF password"></div>
    </div>
    <div class="action-bar"><button class="btn btn-primary" id="unlockBtn">🔓 Unlock PDF</button></div>
    <div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('application/pdf',false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  document.getElementById('unlockBtn').onclick=async()=>{
    if(!selectedFiles[0]){showToast('Select a PDF first','error');return;}
    showLoading('Unlocking...');
    try{
      const res=await ipcRenderer.invoke('pdf:unlock',selectedFiles[0],document.getElementById('unlockPwd').value);
      hideLoading();
      if(res.success){showResult(r,'PDF unlocked successfully');document.getElementById('saveBtn').onclick=()=>saveResult(res.data,'unlocked.pdf',[{name:'PDF',extensions:['pdf']}]);}
      else{showToast('Wrong password or unable to unlock','error');}
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── Sign ───────────────────────────────────────────────────
function renderSign(r) {
  r.innerHTML = dropZoneHTML('Drop a PDF to sign','application/pdf') + fileListHTML() +
    `<div class="options-panel"><div class="options-title">Draw Your Signature</div>
      <div class="sig-canvas-wrapper"><canvas class="sig-canvas" id="sigCanvas" width="500" height="150"></canvas></div>
      <div class="action-bar" style="margin-bottom:0">
        <button class="btn btn-secondary" id="clearSig">Clear</button>
      </div>
    </div>
    <div class="options-panel"><div class="options-title">Placement</div>
      <div class="option-row">
        <div class="option-group"><label class="option-label">Page</label><input class="option-input" type="number" id="sigPage" value="1" min="1"></div>
        <div class="option-group"><label class="option-label">Position</label>
          <select class="option-select" id="sigPos"><option value="bottom-right">Bottom Right</option><option value="bottom-left">Bottom Left</option><option value="bottom-center">Bottom Center</option></select>
        </div>
      </div>
    </div>
    <div class="action-bar"><button class="btn btn-primary" id="signBtn">✍️ Apply Signature</button></div>
    <div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('application/pdf',false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  sigCanvas=document.getElementById('sigCanvas');
  sigCtx=sigCanvas.getContext('2d');
  sigCtx.fillStyle='#fff';sigCtx.fillRect(0,0,500,150);
  sigCtx.strokeStyle='#1a1a2e';sigCtx.lineWidth=2.5;sigCtx.lineCap='round';sigCtx.lineJoin='round';
  sigCanvas.addEventListener('mousedown',e=>{isDrawing=true;sigCtx.beginPath();sigCtx.moveTo(e.offsetX,e.offsetY);});
  sigCanvas.addEventListener('mousemove',e=>{if(!isDrawing)return;sigCtx.lineTo(e.offsetX,e.offsetY);sigCtx.stroke();});
  sigCanvas.addEventListener('mouseup',()=>isDrawing=false);
  document.getElementById('clearSig').onclick=()=>{sigCtx.fillStyle='#fff';sigCtx.fillRect(0,0,500,150);};
  document.getElementById('signBtn').onclick=async()=>{
    if(!selectedFiles[0]){showToast('Select a PDF first','error');return;}
    showLoading('Applying signature...');
    try{
      const imgData=sigCanvas.toDataURL('image/png').split(',')[1];
      const imgBuf=Buffer.from(imgData,'base64');
      const info=await ipcRenderer.invoke('pdf:getInfo',selectedFiles[0]);
      const pageIdx=parseInt(document.getElementById('sigPage').value)-1;
      const pg=info.pages[pageIdx]||info.pages[0];
      const pos=document.getElementById('sigPos').value;
      let x,y;const w=150,h=50;
      if(pos==='bottom-right'){x=pg.width-w-40;y=40;}
      else if(pos==='bottom-left'){x=40;y=40;}
      else{x=(pg.width-w)/2;y=40;}
      const data=await ipcRenderer.invoke('pdf:addSignature',selectedFiles[0],Array.from(imgBuf),pageIdx,x,y,w,h);
      hideLoading();showResult(r,'Signature added successfully');
      document.getElementById('saveBtn').onclick=()=>saveResult(data,'signed.pdf',[{name:'PDF',extensions:['pdf']}]);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── Watermark ──────────────────────────────────────────────
function renderWatermark(r) {
  r.innerHTML = dropZoneHTML('Drop a PDF to watermark','application/pdf') + fileListHTML() +
    `<div class="options-panel"><div class="options-title">Watermark Settings</div>
      <div class="option-group"><label class="option-label">Text</label><input class="option-input" id="wmText" value="CONFIDENTIAL" placeholder="Watermark text"></div>
      <div class="option-row">
        <div class="option-group"><label class="option-label">Font Size</label><input class="option-input" type="number" id="wmSize" value="60" min="10" max="200"></div>
        <div class="option-group"><label class="option-label">Opacity</label><input class="option-range" type="range" id="wmOpacity" min="0.05" max="0.8" step="0.05" value="0.15"><div style="text-align:right;font-size:11px;color:var(--text-muted)" id="wmOpacityVal">15%</div></div>
      </div>
      <div class="option-row">
        <div class="option-group"><label class="option-label">Color</label><input type="color" id="wmColor" value="#888888" style="width:100%;height:42px;border:none;border-radius:8px;cursor:pointer;background:none"></div>
        <div class="option-group"><label class="option-label">Rotation</label><input class="option-input" type="number" id="wmRotation" value="-45" min="-180" max="180"></div>
      </div>
    </div>
    <div class="action-bar"><button class="btn btn-primary" id="wmBtn">💧 Apply Watermark</button></div>
    <div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('application/pdf',false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  document.getElementById('wmOpacity').oninput=e=>{document.getElementById('wmOpacityVal').textContent=Math.round(e.target.value*100)+'%';};
  document.getElementById('wmBtn').onclick=async()=>{
    if(!selectedFiles[0]){showToast('Select a PDF first','error');return;}
    showLoading('Adding watermark...');
    try{
      const hex=document.getElementById('wmColor').value.replace('#','');
      const color=parseInt(hex,16);
      const opts={text:document.getElementById('wmText').value,fontSize:parseInt(document.getElementById('wmSize').value),opacity:parseFloat(document.getElementById('wmOpacity').value),color,rotation:parseInt(document.getElementById('wmRotation').value)};
      const data=await ipcRenderer.invoke('pdf:watermark',selectedFiles[0],opts);
      hideLoading();showResult(r,'Watermark applied');
      document.getElementById('saveBtn').onclick=()=>saveResult(data,'watermarked.pdf',[{name:'PDF',extensions:['pdf']}]);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── Page Numbers ────────────────────────────────────────────
function renderPageNumbers(r) {
  r.innerHTML = dropZoneHTML('Drop a PDF to add page numbers','application/pdf') + fileListHTML() +
    `<div class="options-panel"><div class="options-title">Page Number Settings</div>
      <div class="option-row">
        <div class="option-group"><label class="option-label">Position</label>
          <select class="option-select" id="pnPos">
            <option value="bottom-center">Bottom Center</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-right">Bottom Right</option>
            <option value="top-center">Top Center</option>
            <option value="top-left">Top Left</option>
            <option value="top-right">Top Right</option>
          </select>
        </div>
        <div class="option-group"><label class="option-label">Format</label>
          <select class="option-select" id="pnFormat">
            <option value="number">1, 2, 3</option>
            <option value="pageOfTotal">Page 1 of 10</option>
            <option value="dash">- 1 -</option>
          </select>
        </div>
      </div>
      <div class="option-row">
        <div class="option-group"><label class="option-label">Font Size</label><input class="option-input" type="number" id="pnSize" value="12" min="6" max="24"></div>
        <div class="option-group"><label class="option-label">Start Number</label><input class="option-input" type="number" id="pnStart" value="1" min="0"></div>
      </div>
    </div>
    <div class="action-bar"><button class="btn btn-primary" id="pnBtn">🔢 Add Page Numbers</button></div>
    <div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('application/pdf',false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  document.getElementById('pnBtn').onclick=async()=>{
    if(!selectedFiles[0]){showToast('Select a PDF first','error');return;}
    showLoading('Adding page numbers...');
    try{
      const opts={position:document.getElementById('pnPos').value,format:document.getElementById('pnFormat').value,fontSize:parseInt(document.getElementById('pnSize').value),startNum:parseInt(document.getElementById('pnStart').value)};
      const data=await ipcRenderer.invoke('pdf:pageNumbers',selectedFiles[0],opts);
      hideLoading();showResult(r,'Page numbers added');
      document.getElementById('saveBtn').onclick=()=>saveResult(data,'numbered.pdf',[{name:'PDF',extensions:['pdf']}]);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── Edit PDF ────────────────────────────────────────────────
function renderEdit(r) {
  let annotations=[];let currentPage=0;let pdfInfo=null;
  r.innerHTML = dropZoneHTML('Drop a PDF to edit','application/pdf') + fileListHTML() +
    `<div id="editArea" class="hidden">
      <div class="edit-toolbar">
        <button class="btn btn-secondary" id="addTextBtn">+ Add Text</button>
        <div class="separator"></div>
        <label class="option-label" style="margin:0">Color:</label>
        <input type="color" id="textColor" value="#000000" style="width:36px;height:36px;border:none;border-radius:6px;cursor:pointer;background:none">
        <label class="option-label" style="margin:0">Size:</label>
        <input class="option-input" type="number" id="textSize" value="14" min="6" max="72" style="width:70px">
        <label class="option-label" style="margin:0">Page:</label>
        <input class="option-input" type="number" id="editPage" value="1" min="1" style="width:70px" id="editPage">
        <button class="btn btn-primary" id="saveEditBtn">💾 Save</button>
      </div>
      <div class="options-panel" id="editTextPanel" style="display:none">
        <div class="option-group"><label class="option-label">Text to add</label><input class="option-input" id="editTextInput" placeholder="Enter text..."></div>
        <div class="option-row">
          <div class="option-group"><label class="option-label">X position</label><input class="option-input" type="number" id="editX" value="100"></div>
          <div class="option-group"><label class="option-label">Y position (from bottom)</label><input class="option-input" type="number" id="editY" value="100"></div>
        </div>
        <button class="btn btn-secondary" id="confirmTextBtn">Add to PDF</button>
      </div>
      <div style="margin-top:12px;font-size:13px;color:var(--text-muted)">Annotations added: <span id="annCount">0</span></div>
    </div>`;
  setupDropZone('application/pdf',false,async paths=>{
    selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);
    pdfInfo=await ipcRenderer.invoke('pdf:getInfo',paths[0]);
    document.getElementById('editPage').max=pdfInfo.pageCount;
    document.getElementById('editArea').classList.remove('hidden');
  });
  document.getElementById('addTextBtn').onclick=()=>{
    const p=document.getElementById('editTextPanel');
    p.style.display=p.style.display==='none'?'block':'none';
  };
  document.getElementById('confirmTextBtn').onclick=()=>{
    const text=document.getElementById('editTextInput').value.trim();
    if(!text){showToast('Enter text','error');return;}
    const hex=document.getElementById('textColor').value.replace('#','');
    annotations.push({text,pageIndex:parseInt(document.getElementById('editPage').value)-1,x:parseInt(document.getElementById('editX').value),y:parseInt(document.getElementById('editY').value),fontSize:parseInt(document.getElementById('textSize').value),color:parseInt(hex,16)});
    document.getElementById('annCount').textContent=annotations.length;
    showToast('Text annotation added','success');
  };
  document.getElementById('saveEditBtn').onclick=async()=>{
    if(!selectedFiles[0]||!annotations.length){showToast('Add at least one annotation first','error');return;}
    showLoading('Saving edits...');
    try{
      const data=await ipcRenderer.invoke('pdf:addText',selectedFiles[0],annotations);
      hideLoading();showToast('PDF saved with annotations','success');
      saveResult(data,'edited.pdf',[{name:'PDF',extensions:['pdf']}]);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── OCR ────────────────────────────────────────────────────
function renderOcr(r) {
  r.innerHTML = dropZoneHTML('Drop a PDF or image for OCR','application/pdf,image/*') + fileListHTML() +
    `<div class="options-panel"><div class="options-title">OCR Settings</div>
      <div class="option-group"><label class="option-label">Language</label>
        <select class="option-select" id="ocrLang"><option value="eng">English</option><option value="fra">French</option><option value="deu">German</option><option value="spa">Spanish</option><option value="chi_sim">Chinese (Simplified)</option></select>
      </div>
    </div>
    <div class="action-bar"><button class="btn btn-primary" id="ocrBtn">👁️ Extract Text</button></div>
    <div id="ocrResult" class="hidden">
      <div class="ocr-result" id="ocrText"></div>
      <div class="action-bar">
        <button class="btn btn-secondary" id="copyOcrBtn">📋 Copy Text</button>
        <button class="btn btn-success" id="saveOcrBtn">💾 Save as TXT</button>
      </div>
    </div>`;
  setupDropZone('application/pdf,image/*',false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  document.getElementById('ocrBtn').onclick=async()=>{
    if(!selectedFiles[0]){showToast('Select a file first','error');return;}
    showLoading('Running OCR... This may take a moment.');
    try{
      const Tesseract=require('tesseract.js');
      const lang=document.getElementById('ocrLang').value;
      const result=await Tesseract.recognize(selectedFiles[0],lang,{logger:m=>{if(m.status==='recognizing text')document.getElementById('loadingText').textContent=`OCR: ${Math.round(m.progress*100)}%...`;}});
      hideLoading();
      const text=result.data.text;
      document.getElementById('ocrResult').classList.remove('hidden');
      document.getElementById('ocrText').textContent=text;
      document.getElementById('copyOcrBtn').onclick=()=>{navigator.clipboard.writeText(text);showToast('Copied to clipboard','success');};
      document.getElementById('saveOcrBtn').onclick=async()=>{
        const sp=await ipcRenderer.invoke('dialog:saveFile',{defaultPath:'ocr_output.txt',filters:[{name:'Text',extensions:['txt']}]});
        if(sp){await ipcRenderer.invoke('file:write',sp,Array.from(Buffer.from(text)));showToast('Saved!','success');}
      };
    }catch(e){hideLoading();showToast('OCR Error: '+e.message,'error');}
  };
}

// ─── PDF/A ──────────────────────────────────────────────────
function renderPdfA(r) {
  r.innerHTML = dropZoneHTML('Drop a PDF to convert to PDF/A','application/pdf') + fileListHTML() +
    `<div class="options-panel"><div class="options-title">About PDF/A</div>
      <p style="color:var(--text-secondary);font-size:13px;line-height:1.6">PDF/A is an ISO-standardized version of PDF designed for long-term archiving. This adds required metadata and removes features incompatible with archiving.</p>
    </div>
    <div class="action-bar"><button class="btn btn-primary" id="pdfABtn">🏛️ Convert to PDF/A</button></div>
    <div id="resultArea" class="result-area hidden"></div>`;
  setupDropZone('application/pdf',false,paths=>{selectedFiles=[paths[0]];document.getElementById('fileList').innerHTML='';addFileItems([paths[0]]);});
  document.getElementById('pdfABtn').onclick=async()=>{
    if(!selectedFiles[0]){showToast('Select a PDF first','error');return;}
    showLoading('Converting to PDF/A...');
    try{
      const data=await ipcRenderer.invoke('pdf:toPdfA',selectedFiles[0]);
      hideLoading();showResult(r,'Converted to PDF/A format');
      document.getElementById('saveBtn').onclick=()=>saveResult(data,'archive.pdfa.pdf',[{name:'PDF',extensions:['pdf']}]);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── Scan to PDF ─────────────────────────────────────────────
function renderScan(r) {
  let capturedImages=[];
  r.innerHTML = `
    <div class="options-panel">
      <div class="options-title">Camera Scanner</div>
      <video class="camera-preview" id="camPreview" autoplay playsinline muted></video>
      <div class="action-bar">
        <button class="btn btn-primary" id="startCamBtn">📷 Start Camera</button>
        <button class="btn btn-secondary" id="captureBtn" disabled>⚡ Capture</button>
        <button class="btn btn-secondary" id="stopCamBtn" disabled>⏹ Stop</button>
      </div>
    </div>
    <div id="capturedSection" class="hidden">
      <div class="options-title" style="margin-bottom:8px">Captured Pages (<span id="capCount">0</span>)</div>
      <div class="captured-images" id="capturedImgs"></div>
      <div class="action-bar">
        <button class="btn btn-success" id="scanToPdfBtn">📄 Create PDF</button>
        <button class="btn btn-secondary" id="clearCaptBtn">Clear All</button>
      </div>
    </div>
    <div id="resultArea" class="result-area hidden"></div>`;
  let stream=null;
  document.getElementById('startCamBtn').onclick=async()=>{
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}}});
      document.getElementById('camPreview').srcObject=stream;
      document.getElementById('captureBtn').disabled=false;
      document.getElementById('stopCamBtn').disabled=false;
      document.getElementById('startCamBtn').disabled=true;
    }catch(e){showToast('Camera error: '+e.message,'error');}
  };
  document.getElementById('captureBtn').onclick=()=>{
    const video=document.getElementById('camPreview');
    const canvas=document.createElement('canvas');
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    canvas.getContext('2d').drawImage(video,0,0);
    const dataUrl=canvas.toDataURL('image/jpeg',0.92);
    capturedImages.push(dataUrl);
    const img=document.createElement('img');img.src=dataUrl;img.className='captured-img';
    document.getElementById('capturedImgs').appendChild(img);
    document.getElementById('capCount').textContent=capturedImages.length;
    document.getElementById('capturedSection').classList.remove('hidden');
  };
  document.getElementById('stopCamBtn').onclick=()=>{
    if(stream)stream.getTracks().forEach(t=>t.stop());
    document.getElementById('startCamBtn').disabled=false;
    document.getElementById('captureBtn').disabled=true;
    document.getElementById('stopCamBtn').disabled=true;
  };
  document.getElementById('clearCaptBtn').onclick=()=>{capturedImages=[];document.getElementById('capturedImgs').innerHTML='';document.getElementById('capCount').textContent=0;};
  document.getElementById('scanToPdfBtn').onclick=async()=>{
    if(!capturedImages.length){showToast('Capture at least one page','error');return;}
    showLoading('Creating PDF from scans...');
    try{
      const paths=[];
      for(let i=0;i<capturedImages.length;i++){
        const base64=capturedImages[i].split(',')[1];
        const tmpPath=require('path').join(require('os').tmpdir(),`scan_${Date.now()}_${i}.jpg`);
        require('fs').writeFileSync(tmpPath,Buffer.from(base64,'base64'));
        paths.push(tmpPath);
      }
      const data=await ipcRenderer.invoke('pdf:jpgToPdf',paths,{pageSize:'A4'});
      hideLoading();showResult(r,`Created PDF from ${capturedImages.length} scanned pages`);
      document.getElementById('saveBtn').onclick=()=>saveResult(data,'scanned.pdf',[{name:'PDF',extensions:['pdf']}]);
    }catch(e){hideLoading();showToast('Error: '+e.message,'error');}
  };
}

// ─── Show Result ─────────────────────────────────────────────
function showResult(r,info,showSave=true) {
  const existing=document.getElementById('resultArea');
  if(existing){
    existing.classList.remove('hidden');
    existing.innerHTML=`<div class="result-header"><span class="result-icon">✅</span><span class="result-title">Done!</span></div>
      <div class="result-info">${info}</div>
      ${showSave?'<button class="btn btn-success" id="saveBtn">💾 Save File</button>':''}`;
  }
}

// ─── Init ────────────────────────────────────────────────────
initDashboard();
