// Обработка завершенных запросов с ошибками
chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (details.statusCode >= 400) {
            chrome.tabs.sendMessage(details.tabId, {
                type: "NETWORK_ERROR", // Используем NETWORK_ERROR для всех сетевых ошибок
                error: {
                    url: details.url,
                    statusCode: details.statusCode, // Это настоящий HTTP статус-код
                    method: details.method,
                    timestamp: Date.now(),
                    error: `HTTP ${details.statusCode}`,
                    type: details.type
                },
            });
        }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
);

// Обработка ошибок сети (когда запрос не дошел до сервера)
chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
        chrome.tabs.sendMessage(details.tabId, {
            type: "NETWORK_ERROR",
            error: {
                url: details.url,
                statusCode: 0, // 0 означает, что это не HTTP ошибка, а сетевая проблема
                method: details.method,
                timestamp: Date.now(),
                error: details.error,
                type: details.type
            },
        });
    },
    { urls: ["<all_urls>"] }
);