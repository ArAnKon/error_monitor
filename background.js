//Service Worker
chrome.webRequest.onCompleted.addListener(
    (details) => {
        //filters 4xx-5xx
        if (details.statusCode >= 400) {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs[0] && tabs[0].id === details.tabId) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'SERVER_ERROR',
                        error: {
                            url: details.url,
                            status: details.statusCode,
                            statusText: details.statusLine,
                            method: details.method,
                            type: details.type,
                            timestamp: new Date().toISOString()
                        }
                    });
                }
            });
        }
    },
    {urls: ["<all_urls>"]},
    ["responseHeaders"]
);

chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0] && tabs[0].id === details.tabId) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'NETWORK_ERROR',
                    error: {
                        url: details.url,
                        error: details.error,
                        method: details.method,
                        type: details.type,
                        timestamp: new Date().toISOString()
                    }
                });
            }
        });
    },
    {urls: ["<all_urls>"]}
);