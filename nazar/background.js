// background.js - only job: open the setup page on first install.
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?welcome=1') });
  }
});
