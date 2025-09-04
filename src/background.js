// Background service worker
console.log('[bg] installed');

// Import QR decoder utility
import { decodeQRFromImageData } from './utils/qrDecoder.js';

// Get active tab
async function getActiveTab() {
  try {
    console.log('[bg] requesting activeTab permission...');
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[bg] tabs query result:', tabs);

    if (!tabs || tabs.length === 0) {
      console.error('[bg] no tabs found');
      return null;
    }

    const activeTab = tabs[0];
    console.log('[bg] active tab found:', activeTab);
    return activeTab;
  } catch (e) {
    console.error('[bg] error querying tabs:', e);
    return null;
  }
}

// Ensure content script is injected
async function ensureContentScriptInjected(tabId) {
  try {
    console.log('[bg] attempting to inject content script into tab:', tabId);
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/scanPage.js']
    });
    console.log('[bg] content script injection result:', result);
    return true;
  } catch (e) {
    console.error('[bg] inject error details:', {
      message: e.message,
      stack: e.stack,
      tabId: tabId
    });
    return false;
  }
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[bg] received message:', message);
  
  if (message?.type === 'TEST_CONTENT_SCRIPT') {
    console.log('[bg] TEST_CONTENT_SCRIPT received');
    
    (async () => {
      try {
        const activeTab = await getActiveTab();
        if (!activeTab) {
          console.log('[bg] no active tab found');
          sendResponse({ success: false, error: 'No active tab found. Make sure you are on a web page.' });
          return;
        }
        
        console.log('[bg] TEST_CONTENT_SCRIPT on tab', activeTab.id, activeTab.url);
        
        const injected = await ensureContentScriptInjected(activeTab.id);
        if (!injected) {
          sendResponse({ success: false, error: 'Failed to inject content script' });
          return;
        }
        
        // Test the content script
        const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'TEST_INJECTION' });
        console.log('[bg] test response:', response);
        sendResponse({ success: true, response });
      } catch (e) {
        console.error('[bg] test error:', e);
        sendResponse({ success: false, error: e.message });
      }
    })();
    
    return true; // Keep message channel open for async response
  }
  
  if (message?.type === 'SCAN_PAGE_IMAGES') {
    console.log('[bg] SCAN_PAGE_IMAGES received');
    
    (async () => {
      try {
        const activeTab = await getActiveTab();
        if (!activeTab) {
          console.log('[bg] no active tab found');
          sendResponse({ results: [] });
          return;
        }
        
        console.log('[bg] SCAN_PAGE_IMAGES on tab', activeTab.id, activeTab.url);
        
        const injected = await ensureContentScriptInjected(activeTab.id);
        if (!injected) {
          sendResponse({ results: [] });
          return;
        }
        
        // Get images from content script
        const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'CONTENT_SCAN_IMAGES' });
        console.log('[bg] received results from content script:', response?.results?.length || 0);
        
        // Process each result and try to decode QR codes
        const processedResults = [];
        if (response?.results) {
          for (const result of response.results) {
            console.log('[bg] processing result:', result);
            
            if (result.imageData && result.width && result.height) {
              // Try to decode using background script
              try {
                const decodedText = await decodeQRFromImageData(result.imageData, result.width, result.height);
                if (decodedText) {
                  processedResults.push({ 
                    text: decodedText, 
                    source: result.source,
                    imageData: result.imageData,
                    width: result.width,
                    height: result.height
                  });
                } else {
                  processedResults.push(result);
                }
              } catch (e) {
                console.warn('[bg] failed to process image:', e);
                processedResults.push(result);
              }
            } else {
              processedResults.push(result);
            }
          }
        }
        
        console.log('[bg] sending processed results:', processedResults.length);
        sendResponse({ results: processedResults });
      } catch (e) {
        console.error('[bg] scan error:', e);
        sendResponse({ results: [] });
      }
    })();
    
    return true; // Keep message channel open for async response
  }
  
  if (message?.type === 'DECODE_QR_CANVAS') {
    console.log('[bg] DECODE_QR_CANVAS received');
    
    (async () => {
      try {
        const { imageData, width, height } = message;
        
        // Decode QR code using utility
        const decodedText = await decodeQRFromImageData(imageData, width, height);
        sendResponse({ success: true, text: decodedText });
      } catch (e) {
        console.error('[bg] decode error:', e);
        sendResponse({ success: false, error: e.message });
      }
    })();
    
    return true; // Keep message channel open for async response
  }
});