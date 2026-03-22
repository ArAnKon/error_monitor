chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "CAPTURE_SCREENSHOT") {
        chrome.tabs.captureVisibleTab(null, {format: 'jpeg', quality: 80}, (dataUrl) => {
            sendResponse({screenshot: dataUrl});
        });
        return true;
    }


    if (request.type === "OPEN_HISTORY_WITH_ERROR") {
        chrome.windows.create({
            url: chrome.runtime.getURL("history.html"),
            type: "popup",
            width: 900,
            height: 700
        });
        return true;
    }


    if (request.type === "GET_TAB_ID") {
        if (sender.tab) {
            sendResponse({tabId: sender.tab.id});
        } else {
            sendResponse({tabId: null});
        }
        return true;
    }
});


chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.get(['tabStates'], (result) => {
        const tabStates = result.tabStates || {};
        if (tabStates[tabId]) {
            delete tabStates[tabId];
            chrome.storage.local.set({tabStates});
            console.log(`[Error Monitor] Removed state for closed tab ${tabId}`);
        }
    });
});


setInterval(() => {
    chrome.tabs.query({}, (tabs) => {
        const activeTabIds = new Set(tabs.map(tab => tab.id));

        chrome.storage.local.get(['tabStates'], (result) => {
            const tabStates = result.tabStates || {};
            let changed = false;

            Object.keys(tabStates).forEach(tabIdStr => {
                const tabId = parseInt(tabIdStr);
                if (!activeTabIds.has(tabId)) {
                    delete tabStates[tabIdStr];
                    changed = true;
                    console.log(`[Error Monitor] Cleaned up stale state for tab ${tabId}`);
                }
            });

            if (changed) {
                chrome.storage.local.set({tabStates});
            }
        });
    });
}, 60 * 60 * 1000);


chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (details.statusCode >= 400) {
            chrome.tabs.sendMessage(details.tabId, {
                type: "NETWORK_ERROR",
                error: details
            }).catch(() => {
            });
        }
    },
    {urls: ["<all_urls>"]},
    ["responseHeaders"]
);

chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
        chrome.tabs.sendMessage(details.tabId, {
            type: "NETWORK_ERROR",
            error: details
        }).catch(() => {
        });
    },
    {urls: ["<all_urls>"]}
);


chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.notificationTimer || changes.notificationPosition) {

            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            type: "NOTIFICATION_SETTINGS_UPDATE",
                            position: changes.notificationPosition?.newValue || "bottom-right",
                            timer: changes.notificationTimer?.newValue || 10000
                        }).catch(() => {
                        });
                    }
                });
            });
        }
    }
});