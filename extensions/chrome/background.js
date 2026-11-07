// GYSM Agent: opens the side panel from the toolbar button and adds a
// right-click menu to ask about the selected text or the page.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "gysm-selection", title: "Ask GYSM about “%s”", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "gysm-page", title: "Ask GYSM about this page", contexts: ["page"] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const text =
    info.menuItemId === "gysm-selection"
      ? `About this text from the page: “${String(info.selectionText || "").slice(0, 1500)}”\n\n`
      : "About this page: ";
  chrome.storage.session.set({ gysmPrefill: { text, at: Date.now() } }).catch(() => {});
  if (tab && tab.id != null) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});
