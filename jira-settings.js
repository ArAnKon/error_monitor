class JiraSettings {
    constructor() {
        this.settings = {
            jiraUrl: '',
            email: '',
            apiToken: '',
            projectKey: '',
            issueType: 'Баг',
            priority: '',
            assignee: '',
            components: [],
            labels: [],
            customFields: [],
            attachScreenshot: true,
            attachCurl: true
        };
        this.loadSettings();
    }

    async loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['jiraSettings'], (result) => {
                if (result.jiraSettings) {
                    this.settings = { ...this.settings, ...result.jiraSettings };
                }
                resolve(this.settings);
            });
        });
    }

    async saveSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.set({ jiraSettings: this.settings }, resolve);
        });
    }

    async testConnection() {
        const { jiraUrl, email, apiToken } = this.settings;

        if (!jiraUrl || !email || !apiToken) {
            return { success: false, message: 'Заполните все обязательные поля (URL, Email, API Token)' };
        }

        try {
            const response = await fetch(`${jiraUrl}/rest/api/3/myself`, {
                method: 'GET',
                headers: {
                    'Authorization': 'Basic ' + btoa(`${email}:${apiToken}`),
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                return { success: true, message: `Подключено! Пользователь: ${data.displayName}` };
            } else {
                const error = await response.text();
                return { success: false, message: `Ошибка: ${response.status} - ${error.substring(0, 100)}` };
            }
        } catch (error) {
            return { success: false, message: `Ошибка: ${error.message}` };
        }
    }

    async createIssue(errorData, screenshotDataUrl = null, customTitle = null) {
        const { jiraUrl, email, apiToken, projectKey, issueType, priority, assignee, components, labels, customFields, attachScreenshot, attachCurl } = this.settings;

        if (!jiraUrl || !email || !apiToken || !projectKey) {
            throw new Error('Настройки Jira не заполнены');
        }

        if (!issueType || issueType.trim() === '') {
            throw new Error('Не указан тип задачи. Пожалуйста, выберите тип из списка');
        }

        let description = this.buildDescription(errorData);
        const summary = customTitle || `${errorData.type === 'NETWORK_ERROR' ? '🌐 Network Error' : '🐛 Console Error'}: ${this.truncateSummary(errorData.message, 100)}`;

        const issueData = {
            fields: {
                project: { key: projectKey },
                summary: summary,
                description: description,
                issuetype: { name: issueType }
            }
        };

        if (priority) {
            issueData.fields.priority = { name: priority };
        }

        if (assignee) {
            const accountId = await this.findUserByEmail(assignee);
            if (accountId) {
                issueData.fields.assignee = { accountId: accountId };
            }
        }

        if (components && components.length > 0) {
            issueData.fields.components = components.map(name => ({ name }));
        }

        if (labels && labels.length > 0) {
            issueData.fields.labels = labels;
        }

        for (const customField of customFields) {
            if (customField.key && customField.value) {
                try {
                    issueData.fields[customField.key] = this.parseCustomFieldValue(customField.value);
                } catch (e) {
                    console.warn(`Failed to parse custom field ${customField.key}:`, e);
                    issueData.fields[customField.key] = customField.value;
                }
            }
        }

        const createResponse = await fetch(`${jiraUrl}/rest/api/3/issue`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(`${email}:${apiToken}`),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(issueData)
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            let errorMessage = `Ошибка создания задачи: ${createResponse.status}`;

            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.errors) {
                    const errors = Object.entries(errorJson.errors)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ');
                    errorMessage += ` - ${errors}`;
                } else if (errorJson.errorMessages) {
                    errorMessage += ` - ${errorJson.errorMessages.join(', ')}`;
                } else {
                    errorMessage += ` - ${errorText.substring(0, 200)}`;
                }
            } catch (e) {
                errorMessage += ` - ${errorText.substring(0, 200)}`;
            }

            throw new Error(errorMessage);
        }

        const createResult = await createResponse.json();
        const issueKey = createResult.key;

        let attachmentResults = [];
        if (attachScreenshot && screenshotDataUrl) {
            const screenshotResult = await this.attachScreenshot(issueKey, screenshotDataUrl);
            attachmentResults.push(screenshotResult);
        }

        if (attachCurl && errorData.type === 'NETWORK_ERROR' && errorData.details) {
            const curlResult = await this.attachCurlFile(issueKey, errorData);
            attachmentResults.push(curlResult);
        }

        return {
            success: true,
            issueKey: issueKey,
            issueUrl: `${jiraUrl}/browse/${issueKey}`,
            attachments: attachmentResults
        };
    }

    buildDescription(errorData) {
        const timestamp = new Date(errorData.timestamp).toLocaleString('ru-RU');

        let description = `*🧨 Ошибка в приложении*\n\n`;
        description += `*Время:* ${timestamp}\n`;
        description += `*Тип:* ${errorData.type === 'CONSOLE_ERROR' ? 'Console Error' : 'Network Error'}\n`;
        description += `*URL страницы:* ${errorData.tabUrl || 'N/A'}\n`;
        description += `*Домен:* ${errorData.domain || 'N/A'}\n\n`;

        description += `*Сообщение об ошибке:*\n{code}\n${errorData.message}\n{code}\n\n`;

        if (errorData.type === 'NETWORK_ERROR' && errorData.details) {
            description += `*Детали запроса:*\n`;
            description += `- URL: ${errorData.details.url || 'N/A'}\n`;
            description += `- Метод: ${errorData.details.method || 'GET'}\n`;
            description += `- Статус: ${errorData.details.statusCode || 'N/A'}\n`;
            description += `- Тип: ${errorData.details.type || 'N/A'}\n\n`;

            if (errorData.details.responseBody) {
                description += `*Тело ответа:*\n{code}\n${errorData.details.responseBody.substring(0, 1000)}\n{code}\n\n`;
            }
        }

        if (errorData.reproductionSteps && errorData.reproductionSteps !== 'Не удалось автоматически определить шаги воспроизведения.') {
            description += `*Шаги воспроизведения:*\n`;
            const steps = errorData.reproductionSteps.split('\n');
            for (const step of steps) {
                description += `- ${step}\n`;
            }
            description += `\n`;
        }

        if (errorData.userActions && errorData.userActions.length > 0) {
            description += `*Действия пользователя (последние 10):*\n`;
            const recentActions = errorData.userActions.slice(-10);
            for (const action of recentActions) {
                const time = new Date(action.timestamp).toLocaleTimeString();
                description += `- [${time}] ${action.type}: ${JSON.stringify(action.details).substring(0, 100)}\n`;
            }
            description += `\n`;
        }

        description += `*Окружение:*\n`;
        description += `- User Agent: ${navigator.userAgent}\n`;
        description += `- Разрешение экрана: ${window.screen.width}x${window.screen.height}\n`;
        description += `- Расширение: Error Monitor v1.6\n`;

        return description;
    }

    async attachScreenshot(issueKey, screenshotDataUrl) {
        const { jiraUrl, email, apiToken } = this.settings;

        const blob = await this.dataURLtoBlob(screenshotDataUrl);
        const formData = new FormData();
        formData.append('file', blob, `screenshot-${issueKey}-${Date.now()}.jpg`);

        const response = await fetch(`${jiraUrl}/rest/api/3/issue/${issueKey}/attachments`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(`${email}:${apiToken}`),
                'X-Atlassian-Token': 'no-check'
            },
            body: formData
        });

        if (!response.ok) {
            return { success: false, message: `Ошибка прикрепления скриншота: ${response.status}` };
        }

        return { success: true, message: 'Скриншот прикреплен' };
    }

    async attachCurlFile(issueKey, errorData) {
        const { jiraUrl, email, apiToken } = this.settings;

        const curlCommand = this.generateCurlCommand(errorData);
        const blob = new Blob([curlCommand], { type: 'text/plain' });
        const formData = new FormData();
        formData.append('file', blob, `curl-${issueKey}-${Date.now()}.txt`);

        const response = await fetch(`${jiraUrl}/rest/api/3/issue/${issueKey}/attachments`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(`${email}:${apiToken}`),
                'X-Atlassian-Token': 'no-check'
            },
            body: formData
        });

        if (!response.ok) {
            return { success: false, message: `Ошибка прикрепления cURL: ${response.status}` };
        }

        return { success: true, message: 'cURL прикреплен' };
    }

    generateCurlCommand(error) {
        if (!error.details || !error.details.url) return '# cURL не доступен для этой ошибки';

        const url = error.details.url;
        const method = error.details.method || 'GET';
        const origin = error.tabUrl ? new URL(error.tabUrl).origin : window.location.origin;

        return `# Ошибка от ${new Date(error.timestamp).toLocaleString()}
# Тип: ${error.type}
# Сообщение: ${error.message}

curl -X ${method} "${url}" \\
  -H "Accept: */*" \\
  -H "Origin: ${origin}" \\
  -H "Referer: ${error.tabUrl || window.location.href}" \\
  --compressed \\
  --insecure`;
    }

    dataURLtoBlob(dataURL) {
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

    async findUserByEmail(email) {
        const { jiraUrl, email: authEmail, apiToken } = this.settings;

        try {
            const response = await fetch(`${jiraUrl}/rest/api/3/user/search?query=${encodeURIComponent(email)}`, {
                method: 'GET',
                headers: {
                    'Authorization': 'Basic ' + btoa(`${authEmail}:${apiToken}`)
                }
            });

            if (response.ok) {
                const users = await response.json();
                if (users && users.length > 0) {
                    return users[0].accountId;
                }
            }
        } catch (error) {
            console.error('Error finding user:', error);
        }

        return null;
    }

    async createDraftIssue(errorData, screenshotDataUrl = null, customTitle = null) {
        const { jiraUrl, email, apiToken, projectKey, issueType, priority, assignee, components, labels, customFields, attachScreenshot } = this.settings;

        if (!jiraUrl || !email || !apiToken || !projectKey) {
            throw new Error('Настройки Jira не заполнены');
        }

        const summary = customTitle || `${errorData.type === 'NETWORK_ERROR' ? 'Network Error' : 'Console Error'}: ${this.truncateSummary(errorData.message, 100)}`;
        const description = this.buildDescription(errorData);

        const issueData = {
            fields: {
                project: { key: projectKey },
                summary: summary,
                description: description,
                issuetype: { name: issueType }
            }
        };

        if (priority) issueData.fields.priority = { name: priority };
        if (assignee) {
            const accountId = await this.findUserByEmail(assignee);
            if (accountId) issueData.fields.assignee = { accountId: accountId };
        }
        if (components && components.length > 0) {
            issueData.fields.components = components.map(name => ({ name }));
        }
        if (labels && labels.length > 0) {
            issueData.fields.labels = labels;
        }

        const response = await fetch(`${jiraUrl}/rest/api/3/issue`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(`${email}:${apiToken}`),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(issueData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка: ${response.status} - ${errorText.substring(0, 200)}`);
        }

        const result = await response.json();
        const issueKey = result.key;

        if (attachScreenshot && screenshotDataUrl) {
            await this.attachScreenshot(issueKey, screenshotDataUrl);
        }

        return {
            success: true,
            issueKey: issueKey,
            issueUrl: `${jiraUrl}/browse/${issueKey}`
        };
    }

    parseCustomFieldValue(value) {
        if (!value || typeof value !== 'string') return value;

        const trimmed = value.trim();
        if (trimmed === '') return '';

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                return JSON.parse(trimmed);
            } catch (e) {
                return trimmed;
            }
        }

        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                return JSON.parse(trimmed);
            } catch (e) {
                return trimmed;
            }
        }

        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            return parseFloat(trimmed);
        }

        if (trimmed.toLowerCase() === 'true') return true;
        if (trimmed.toLowerCase() === 'false') return false;

        return trimmed;
    }

    truncateSummary(text, maxLength) {
        if (!text) return 'No error message';
        text = text.replace(/\n/g, ' ');
        if (text.length > maxLength) {
            return text.substring(0, maxLength - 3) + '...';
        }
        return text;
    }
}

const HARDCODED_ISSUE_TYPES = [
    'Баг',
    'Улучшение'
];

document.addEventListener('DOMContentLoaded', async () => {
    const jiraSettings = new JiraSettings();
    await jiraSettings.loadSettings();

    document.getElementById('jiraUrl').value = jiraSettings.settings.jiraUrl;
    document.getElementById('jiraEmail').value = jiraSettings.settings.email;
    document.getElementById('jiraToken').value = jiraSettings.settings.apiToken;
    document.getElementById('projectKey').value = jiraSettings.settings.projectKey;
    document.getElementById('priority').value = jiraSettings.settings.priority;
    document.getElementById('assignee').value = jiraSettings.settings.assignee;
    document.getElementById('components').value = jiraSettings.settings.components.join(', ');
    document.getElementById('labels').value = jiraSettings.settings.labels.join(', ');
    document.getElementById('attachScreenshot').checked = jiraSettings.settings.attachScreenshot;
    document.getElementById('attachCurl').checked = jiraSettings.settings.attachCurl;

    const issueTypeSelect = document.getElementById('issueType');
    populateIssueTypes(issueTypeSelect, jiraSettings.settings.issueType);

    const container = document.getElementById('customFieldsContainer');
    if (jiraSettings.settings.customFields) {
        jiraSettings.settings.customFields.forEach((field) => {
            addCustomFieldRow(field.key, field.value);
        });
    }

    document.getElementById('saveSettings').addEventListener('click', async () => {
        jiraSettings.settings.jiraUrl = document.getElementById('jiraUrl').value.trim();
        jiraSettings.settings.email = document.getElementById('jiraEmail').value.trim();
        jiraSettings.settings.apiToken = document.getElementById('jiraToken').value.trim();
        jiraSettings.settings.projectKey = document.getElementById('projectKey').value.trim().toUpperCase();
        jiraSettings.settings.issueType = document.getElementById('issueType').value.trim();
        jiraSettings.settings.priority = document.getElementById('priority').value;
        jiraSettings.settings.assignee = document.getElementById('assignee').value.trim();

        const componentsValue = document.getElementById('components').value.trim();
        jiraSettings.settings.components = componentsValue ? componentsValue.split(',').map(c => c.trim()) : [];

        const labelsValue = document.getElementById('labels').value.trim();
        jiraSettings.settings.labels = labelsValue ? labelsValue.split(',').map(l => l.trim()) : [];

        jiraSettings.settings.attachScreenshot = document.getElementById('attachScreenshot').checked;
        jiraSettings.settings.attachCurl = document.getElementById('attachCurl').checked;

        const customFields = [];
        document.querySelectorAll('.custom-field-row').forEach(row => {
            const key = row.querySelector('.field-key')?.value;
            const value = row.querySelector('.field-value')?.value;
            if (key && key.trim()) {
                customFields.push({ key: key.trim(), value: value || '' });
            }
        });
        jiraSettings.settings.customFields = customFields;

        await jiraSettings.saveSettings();
        showTestResult('Настройки сохранены!', 'success');

        setTimeout(() => window.close(), 1500);
    });

    document.getElementById('testConnection').addEventListener('click', async () => {
        jiraSettings.settings.jiraUrl = document.getElementById('jiraUrl').value.trim();
        jiraSettings.settings.email = document.getElementById('jiraEmail').value.trim();
        jiraSettings.settings.apiToken = document.getElementById('jiraToken').value.trim();

        const result = await jiraSettings.testConnection();
        showTestResult(result.message, result.success ? 'success' : 'error');
    });

    document.getElementById('addCustomField').addEventListener('click', () => {
        addCustomFieldRow('', '');
    });

    document.getElementById('closeSettings').addEventListener('click', () => {
        window.close();
    });

    function populateIssueTypes(selectElement, selectedValue) {
        if (!selectElement) return;

        selectElement.innerHTML = '';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- Выберите тип задачи --';
        selectElement.appendChild(defaultOption);

        HARDCODED_ISSUE_TYPES.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            if (selectedValue === type) {
                option.selected = true;
            }
            selectElement.appendChild(option);
        });

        if (selectedValue && !HARDCODED_ISSUE_TYPES.includes(selectedValue)) {
            const customOption = document.createElement('option');
            customOption.value = selectedValue;
            customOption.textContent = `${selectedValue} (пользовательский)`;
            customOption.selected = true;
            selectElement.appendChild(customOption);
        }
    }

    function addCustomFieldRow(key = '', value = '') {
        const container = document.getElementById('customFieldsContainer');
        const row = document.createElement('div');
        row.className = 'custom-field-row';
        row.innerHTML = `
            <input type="text" class="field-key" placeholder="Ключ поля (customfield_XXXXX)" value="${escapeHtml(key)}" />
            <input type="text" class="field-value" placeholder="Значение" value="${escapeHtml(value)}" />
            <button type="button" class="remove-field" title="Удалить">✖️</button>
        `;
        row.querySelector('.remove-field').addEventListener('click', () => row.remove());
        container.appendChild(row);
    }

    function showTestResult(message, type) {
        const resultEl = document.getElementById('testResult');
        resultEl.textContent = message;
        resultEl.className = `test-status test-${type === 'success' ? 'success' : 'error'}`;
        resultEl.classList.remove('hidden');

        setTimeout(() => {
            resultEl.classList.add('hidden');
        }, 5000);
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});