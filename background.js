chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'wl-check',
    title: 'Run WL Check',
    contexts: ['page', 'frame']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'wl-check') return;

  // Check that we have wallets before injecting anything
  const data = await chrome.storage.sync.get('wallets');
  const wallets = (data.wallets || []);

  if (wallets.length === 0) {
    // Open popup so user can add wallets
    await chrome.action.openPopup().catch(() => {});
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
  } catch (e) {
    console.error('WL Checker: failed to inject content script:', e.message);
  }
});
