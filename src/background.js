chrome.runtime.onInstalled.addListener(() => {
  console.log('[bg] installed');
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentScriptInjected(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/scanPage.js']
    });
    console.log('[bg] content script injected');
  } catch (e) {
    console.warn('[bg] inject error (possibly already injected or disallowed)', e?.message || e);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SCAN_PAGE_IMAGES') {
    (async () => {
      const tab = await getActiveTab();
      console.log('[bg] SCAN_PAGE_IMAGES on tab', tab?.id, tab?.url);
      if (!tab?.id) return sendResponse({ results: [] });
      await ensureContentScriptInjected(tab.id);
      try {
        chrome.tabs.sendMessage(tab.id, { type: 'CONTENT_SCAN_IMAGES' }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[bg] sendMessage error', chrome.runtime.lastError?.message);
            sendResponse({ results: [] });
          } else {
            console.log('[bg] received results', response?.results?.length || 0);
            sendResponse({ results: response?.results || [] });
          }
        });
      } catch (e) {
        console.error('[bg] scan dispatch failed', e?.message || e);
        sendResponse({ results: [] });
      }
    })();
    return true; // async
  }
});