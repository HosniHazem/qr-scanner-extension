import { BrowserMultiFormatReader } from '@zxing/browser';

const reader = new BrowserMultiFormatReader();

async function decodeImageElement(imageElement) {
  try {
    const result = await reader.decodeFromImageElement(imageElement);
    return result?.getText?.() || null;
  } catch (e) {
    console.warn('[content] decodeFromImageElement failed', imageElement.src || imageElement.tagName, e?.message || e);
    return null;
  }
}

function extractBackgroundImageUrls() {
  const urls = new Set();
  const elements = Array.from(document.querySelectorAll('*'));
  for (const el of elements) {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg.startsWith('url(')) {
      const match = bg.match(/url\(["']?(.*?)["']?\)/);
      if (match && match[1]) urls.add(match[1]);
    }
  }
  return Array.from(urls);
}

async function loadUrlAsImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      console.warn('[content] failed to load background image', url, e);
      resolve(null);
    };
    img.src = url;
  });
}

function isSameOrigin(url) {
  try {
    const u = new URL(url, location.href);
    return u.origin === location.origin;
  } catch {
    return false;
  }
}

async function scanPageImages() {
  const results = [];

  const images = Array.from(document.images);
  console.log('[content] found <img> count', images.length);
  for (const img of images) {
    const src = img.currentSrc || img.src;
    const sameOrigin = isSameOrigin(src);
    console.log('[content] scan <img>', { src, sameOrigin, width: img.naturalWidth, height: img.naturalHeight });
    const text = await decodeImageElement(img);
    if (text) {
      results.push({ text, source: src || '<img>' });
    }
  }

  const canvases = Array.from(document.querySelectorAll('canvas'));
  console.log('[content] found <canvas> count', canvases.length);
  for (const c of canvases) {
    try {
      const dataUrl = c.toDataURL('image/png');
      const img = await loadUrlAsImage(dataUrl);
      if (!img) continue;
      const text = await decodeImageElement(img);
      if (text) results.push({ text, source: '<canvas>' });
    } catch (e) {
      console.warn('[content] canvas toDataURL failed (tainted?)', e?.message || e);
    }
  }

  const bgUrls = extractBackgroundImageUrls();
  console.log('[content] found CSS background urls', bgUrls.length);
  for (const url of bgUrls) {
    console.log('[content] scan background url', url);
    const img = await loadUrlAsImage(url);
    if (!img) continue;
    const text = await decodeImageElement(img);
    if (text) results.push({ text, source: url });
  }

  console.log('[content] total decoded results', results.length);
  return results;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'CONTENT_SCAN_IMAGES') {
    (async () => {
      try {
        const results = await scanPageImages();
        sendResponse({ results });
      } catch (e) {
        console.error('[content] scan error', e);
        sendResponse({ results: [] });
      }
    })();
    return true;
  }
});