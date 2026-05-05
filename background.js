chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === "CAPTURE_SCREENSHOT") {
        chrome.tabs.captureVisibleTab(null, {format: 'jpeg', quality: 80}, function(dataUrl) {
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

    if (request.type === "POLLINATIONS_API_CALL") {
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 30000);

        fetch('https://text.pollinations.ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{
                    role: 'user',
                    content: request.prompt
                }],
                model: 'openai',
                seed: Date.now()
            }),
            signal: controller.signal
        })
        .then(function(response) {
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error('API returned ' + response.status);
            }
            return response.text();
        })
        .then(function(text) {
            sendResponse({success: true, text: text.trim()});
        })
        .catch(function(error) {
            clearTimeout(timeoutId);
            sendResponse({success: false, error: error.message});
        });

        return true;
    }
});

chrome.tabs.onRemoved.addListener(function(tabId) {
    chrome.storage.local.get(['tabStates'], function(result) {
        var tabStates = result.tabStates || {};
        if (tabStates[tabId]) {
            delete tabStates[tabId];
            chrome.storage.local.set({tabStates: tabStates});
            console.log('[Error Monitor] Removed state for closed tab ' + tabId);
        }
    });
});

setInterval(function() {
    chrome.tabs.query({}, function(tabs) {
        var activeTabIds = new Set(tabs.map(function(tab) { return tab.id; }));

        chrome.storage.local.get(['tabStates'], function(result) {
            var tabStates = result.tabStates || {};
            var changed = false;

            Object.keys(tabStates).forEach(function(tabIdStr) {
                var tabId = parseInt(tabIdStr);
                if (!activeTabIds.has(tabId)) {
                    delete tabStates[tabIdStr];
                    changed = true;
                    console.log('[Error Monitor] Cleaned up stale state for tab ' + tabId);
                }
            });

            if (changed) {
                chrome.storage.local.set({tabStates: tabStates});
            }
        });
    });
}, 60 * 60 * 1000);


chrome.webRequest.onCompleted.addListener(
    function(details) {
        if (details.statusCode >= 400) {
            chrome.tabs.sendMessage(details.tabId, {
                type: "NETWORK_ERROR",
                error: details
            }).catch(function() {});
        }
    },
    {urls: ["<all_urls>"]},
    ["responseHeaders"]
);


chrome.webRequest.onErrorOccurred.addListener(
    function(details) {
        chrome.tabs.sendMessage(details.tabId, {
            type: "NETWORK_ERROR",
            error: details
        }).catch(function() {});
    },
    {urls: ["<all_urls>"]}
);


chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local') {
        if (changes.notificationTimer || changes.notificationPosition) {

            chrome.tabs.query({}, function(tabs) {
                tabs.forEach(function(tab) {
                    if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            type: "NOTIFICATION_SETTINGS_UPDATE",
                            position: changes.notificationPosition ? changes.notificationPosition.newValue : "bottom-right",
                            timer: changes.notificationTimer ? changes.notificationTimer.newValue : 10000
                        }).catch(function() {});
                    }
                });
            });
        }
    }
});
