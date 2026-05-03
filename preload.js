// preload.js - Loaded before renderer, sets up globals for performance
const { contextBridge } = require('electron');

// Polyfill Buffer for renderer (already available with nodeIntegration, but ensure it)
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

// Pre-warm: touch pdfjs-dist path resolution so first use is fast
try {
  require.resolve('pdfjs-dist/legacy/build/pdf.js');
  require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
} catch(e) {}

// Mark preload done for timing
global.__honestpdf_preload = Date.now();
