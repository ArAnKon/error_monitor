chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.statusCode >= 400) {
      chrome.tabs.sendMessage(details.tabId, {
        type: "SERVER_ERROR",
        error: details,
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"],
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    chrome.tabs.sendMessage(details.tabId, {
      type: "NETWORK_ERROR",
      error: details,
    });
  },
  { urls: ["<all_urls>"] },
  [],
);

