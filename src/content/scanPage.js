// Content script for QR scanning
console.log('[content] script loaded');

// Test function to verify injection
function testInjection() {
  console.log('[content] injection test - script is running');
  return true;
}

// QR detection using multiple methods
async function detectQRInCanvas(canvas) {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Try native BarcodeDetector first
    if ('BarcodeDetector' in window) {
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const bitmap = await createImageBitmap(canvas);
        const barcodes = await detector.detect(bitmap);
        
        if (barcodes && barcodes.length > 0) {
          const qrData = barcodes[0].rawValue;
          console.log('[content] BarcodeDetector decoded:', qrData);
          return qrData;
        }
      } catch (e) {
        console.log('[content] BarcodeDetector failed:', e.message);
      }
    }
    
    // Send to background script for ZXing decoding
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DECODE_QR_CANVAS',
        imageData: Array.from(imageData.data),
        width: canvas.width,
        height: canvas.height
      });
      
      if (response?.success && response?.text) {
        console.log('[content] background script decoded:', response.text);
        return response.text;
      }
    } catch (e) {
      console.log('[content] background script decode failed:', e.message);
    }
    
    // Fallback to pattern detection for QR-like images
    let blackPixels = 0;
    let whitePixels = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = (r + g + b) / 3;
      
      if (gray < 128) blackPixels++;
      else whitePixels++;
    }
    
    const totalPixels = blackPixels + whitePixels;
    const blackRatio = blackPixels / totalPixels;
    
    // QR codes typically have ~50% black pixels
    if (blackRatio > 0.3 && blackRatio < 0.7) {
      console.log('[content] potential QR pattern detected', { blackRatio, width: canvas.width, height: canvas.height });
      return {
        text: 'QR-like image detected - Black ratio: ' + (blackRatio * 100).toFixed(1) + '%',
        imageData: Array.from(imageData.data),
        width: canvas.width,
        height: canvas.height
      };
    }
    
    return null;
  } catch (e) {
    console.warn('[content] canvas analysis failed', e);
    return null;
  }
}

async function scanPageImages() {
  const results = [];
  console.log('[content] starting page scan');

  // Test injection
  testInjection();

  // Scan <img> elements
  const images = Array.from(document.images);
  console.log('[content] found <img> count', images.length);
  
  for (const img of images) {
    const src = img.currentSrc || img.src;
    console.log('[content] scanning <img>', { 
      src: src.substring(0, 100), 
      width: img.naturalWidth, 
      height: img.naturalHeight,
      complete: img.complete 
    });
    
    if (!img.complete) {
      console.log('[content] image not loaded yet, skipping');
      continue;
    }
    
    try {
      // Create canvas from image
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      
      const qrResult = await detectQRInCanvas(canvas);
      if (qrResult) {
        if (typeof qrResult === 'string') {
          results.push({ text: qrResult, source: src || '<img>' });
        } else {
          // QR-like image with image data
          results.push({ 
            text: qrResult.text, 
            source: src || '<img>',
            imageData: qrResult.imageData,
            width: qrResult.width,
            height: qrResult.height
          });
        }
      }
    } catch (e) {
      console.warn('[content] failed to process image', src, e?.message || e);
    }
  }

  // Scan <canvas> elements
  const canvases = Array.from(document.querySelectorAll('canvas'));
  console.log('[content] found <canvas> count', canvases.length);
  
  for (const canvas of canvases) {
    console.log('[content] scanning <canvas>', { 
      width: canvas.width, 
      height: canvas.height 
    });
    
    try {
      const qrResult = await detectQRInCanvas(canvas);
      if (qrResult) {
        if (typeof qrResult === 'string') {
          results.push({ text: qrResult, source: '<canvas>' });
        } else {
          // QR-like image with image data
          results.push({ 
            text: qrResult.text, 
            source: '<canvas>',
            imageData: qrResult.imageData,
            width: qrResult.width,
            height: qrResult.height
          });
        }
      }
    } catch (e) {
      console.warn('[content] failed to process canvas', e?.message || e);
    }
  }

  // Scan background images
  const elements = Array.from(document.querySelectorAll('*'));
  let bgCount = 0;
  
  for (const el of elements) {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg.startsWith('url(')) {
      bgCount++;
      console.log('[content] found background image', bg);
    }
  }
  
  console.log('[content] found background images', bgCount);

  console.log('[content] total results', results.length);
  return results;
}

// Listen for scan request
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[content] received message', message);
  
  if (message?.type === 'TEST_INJECTION') {
    console.log('[content] test injection request');
    sendResponse({ success: true, message: 'Content script is working!' });
    return false; // synchronous response
  }
  
  if (message?.type === 'CONTENT_SCAN_IMAGES') {
    console.log('[content] starting scan request');
    
    (async () => {
      try {
        const results = await scanPageImages();
        console.log('[content] scan complete, sending results', results);
        sendResponse({ results });
      } catch (e) {
        console.error('[content] scan error', e);
        sendResponse({ results: [] });
      }
    })();
    
    return true; // Keep message channel open for async response
  }
});

// Confirm script loaded
console.log('[content] script initialization complete');