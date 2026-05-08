chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === "CAPTURE_SCREENSHOT") {
        chrome.tabs.captureVisibleTab(null, {format: 'jpeg', quality: 80}, function(dataUrl) {
            sendResponse({screenshot: dataUrl});
        });
        return true;
    }
    async function createJiraIssue(error, screenshotDataUrl, customTitle = null) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['jiraSettings'], async (result) => {
                const settings = result.jiraSettings;

                if (!settings || !settings.jiraUrl || !settings.email || !settings.apiToken || !settings.projectKey) {
                    reject(new Error('Jira settings not configured'));
                    return;
                }

                try {
                    const description = buildJiraDescription(error);
                    const summary = customTitle || `${error.type === 'NETWORK_ERROR' ? 'Network Error' : 'Console Error'}: ${truncateSummary(error.message, 100)}`;

                    const issueData = {
                        fields: {
                            project: { key: settings.projectKey },
                            summary: summary,
                            description: description,
                            issuetype: { name: settings.issueType || 'Bug' }
                        }
                    };

                    if (settings.priority) {
                        issueData.fields.priority = { name: settings.priority };
                    }

                    if (settings.assignee) {
                        const accountId = await findUserByEmail(settings, settings.assignee);
                        if (accountId) {
                            issueData.fields.assignee = { accountId: accountId };
                        }
                    }

                    if (settings.components && settings.components.length > 0) {
                        issueData.fields.components = settings.components.map(name => ({ name }));
                    }

                    if (settings.labels && settings.labels.length > 0) {
                        issueData.fields.labels = settings.labels;
                    }

                    if (settings.customFields) {
                        for (const field of settings.customFields) {
                            if (field.key && field.value) {
                                issueData.fields[field.key] = field.value;
                            }
                        }
                    }

                    const createResponse = await fetch(`${settings.jiraUrl}/rest/api/3/issue`, {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Basic ' + btoa(`${settings.email}:${settings.apiToken}`),
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(issueData)
                    });

                    if (!createResponse.ok) {
                        const errorText = await createResponse.text();
                        throw new Error(`Jira API error: ${createResponse.status} - ${errorText}`);
                    }

                    const createResult = await createResponse.json();
                    const issueKey = createResult.key;

                    if (settings.attachScreenshot && screenshotDataUrl) {
                        await attachScreenshotToJira(settings, issueKey, screenshotDataUrl);
                    }

                    if (settings.attachCurl && error.type === 'NETWORK_ERROR' && error.details) {
                        await attachCurlToJira(settings, issueKey, error);
                    }

                    resolve({
                        success: true,
                        issueKey: issueKey,
                        issueUrl: `${settings.jiraUrl}/browse/${issueKey}`
                    });

                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    function buildJiraDescription(error) {
        const timestamp = new Date(error.timestamp).toLocaleString('ru-RU');

        let description = `*Ошибка*\n\n`;
        description += `*Время:* ${timestamp}\n`;
        description += `*Тип:* ${error.type === 'CONSOLE_ERROR' ? 'Console Error' : 'Network Error'}\n`;
        description += `*URL страницы:* ${error.tabUrl || 'N/A'}\n`;
        description += `*Домен:* ${error.domain || 'N/A'}\n\n`;

        description += `*Сообщение об ошибке:*\n{code}\n${error.message}\n{code}\n\n`;

        if (error.type === 'NETWORK_ERROR' && error.details) {
            description += `*Детали запроса:*\n`;
            description += `- URL: ${error.details.url || 'N/A'}\n`;
            description += `- Метод: ${error.details.method || 'GET'}\n`;
            description += `- Статус: ${error.details.statusCode || 'N/A'}\n\n`;

            if (error.details.responseBody) {
                description += `*Тело ответа:*\n{code}\n${error.details.responseBody.substring(0, 1000)}\n{code}\n\n`;
            }
        }

        if (error.reproductionSteps && error.reproductionSteps !== 'Не удалось автоматически определить шаги воспроизведения.') {
            description += `*Шаги воспроизведения:*\n`;
            const steps = error.reproductionSteps.split('\n');
            for (const step of steps) {
                description += `- ${step}\n`;
            }
            description += `\n`;
        }

        return description;
    }

    async function attachScreenshotToJira(settings, issueKey, screenshotDataUrl) {
        const blob = await dataURLtoBlob(screenshotDataUrl);
        const formData = new FormData();
        formData.append('file', blob, `screenshot-${issueKey}-${Date.now()}.jpg`);

        const response = await fetch(`${settings.jiraUrl}/rest/api/3/issue/${issueKey}/attachments`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(`${settings.email}:${settings.apiToken}`),
                'X-Atlassian-Token': 'no-check'
            },
            body: formData
        });

        if (!response.ok) {
            console.error('Failed to attach screenshot:', await response.text());
        }
    }

    function dataURLtoBlob(dataURL) {
        const arr = dataURL.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    }

    function truncateSummary(text, maxLength) {
        if (!text) return 'No error message';
        text = text.replace(/\n/g, ' ');
        if (text.length > maxLength) {
            return text.substring(0, maxLength - 3) + '...';
        }
        return text;
    }

//Обработчик в chrome.runtime.onMessage.addListener
    if (request.type === "CREATE_JIRA_ISSUE") {
        createJiraIssue(request.error, request.screenshot, request.customTitle)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
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