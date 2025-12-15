// Обработчик для создания скриншотов
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "CAPTURE_SCREENSHOT") {
        chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 80 }, (dataUrl) => {
            sendResponse({ screenshot: dataUrl });
        });
        return true;
    }

    // Обработчик для открытия истории с конкретной ошибкой
    if (request.type === "OPEN_HISTORY_WITH_ERROR") {
        chrome.windows.create({
            url: chrome.runtime.getURL("history.html"),
            type: "popup",
            width: 900,
            height: 700
        });
        return true;
    }
});

// Перехват сетевых ошибок
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

// Обработчик для обновления настроек
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.notificationTimer || changes.notificationPosition) {
            // Отправляем сообщение всем вкладкам об обновлении настроек
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            type: "NOTIFICATION_TIMER_UPDATE",
                            position: changes.notificationPosition?.newValue || "bottom-right",
                            timer: changes.notificationTimer?.newValue || 10000
                        }).catch(() => {});
                    }
                });
            });
        }
    }
});