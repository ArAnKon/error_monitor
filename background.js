chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "CAPTURE_SCREENSHOT") {
        chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 80 }, (dataUrl) => {
            sendResponse({ screenshot: dataUrl });
        });
        return true;
    }
});

chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (details.statusCode >= 400) {
            chrome.tabs.sendMessage(details.tabId, {
                type: "NETWORK_ERROR",
                error: details
            });
        }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
);

chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
        chrome.tabs.sendMessage(details.tabId, {
            type: "NETWORK_ERROR",
            error: details
        });
    },
    { urls: ["<all_urls>"] }
);