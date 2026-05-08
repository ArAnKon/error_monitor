let allHistory = [];
let filteredHistory = [];
let darkThemeEnabled = false;
let jiraSettings = null;
let pendingErrorForJira = null;
let pendingScreenshotForJira = null;

document.addEventListener('DOMContentLoaded', () => {
    loadThemeSettings();
    loadHistory();
    setupEventListeners();
});

function loadHistory() {
    chrome.storage.local.get(["errorHistory", "errorToShowInHistory", "openHistoryOnLoad"], (result) => {
        if (result.errorHistory) {
            allHistory = result.errorHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            filteredHistory = [...allHistory];
            renderHistory();
            updateStats();

            if (result.openHistoryOnLoad && result.errorToShowInHistory) {
                const errorToShow = allHistory.find(error => error.id === result.errorToShowInHistory);
                if (errorToShow) {
                    setTimeout(() => {
                        showErrorDetail(errorToShow);
                        chrome.storage.local.remove(['errorToShowInHistory', 'openHistoryOnLoad']);
                    }, 500);
                }
            }
        } else {
            showEmptyState();
        }
    });
}

function setupEventListeners() {
    document.getElementById('backButton').addEventListener('click', () => {
        window.close();
    });

    document.getElementById('typeFilter').addEventListener('change', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    document.getElementById('timeFilter').addEventListener('change', applyFilters);
    document.getElementById('searchInput').addEventListener('input', applyFilters);

    document.getElementById('sendToJira').addEventListener('click', () => sendToJira());
    document.getElementById('openJiraSettings')?.addEventListener('click', openJiraSettings);
    document.getElementById('closeJiraModal')?.addEventListener('click', closeJiraModal);
    document.getElementById('closeTitleModal')?.addEventListener('click', closeTitleModal);
    document.getElementById('cancelTitleModal')?.addEventListener('click', closeTitleModal);
    document.getElementById('confirmSendToJira')?.addEventListener('click', confirmSendToJira);

    document.getElementById('clearHistory').addEventListener('click', clearHistory);
    document.getElementById('backToList').addEventListener('click', showList);
    document.getElementById('copyCurl').addEventListener('click', () => {
        const curlCommand = document.getElementById('curlCommand').textContent;
        if (curlCommand) {
            navigator.clipboard.writeText(curlCommand).then(() => {
                showSuccessMessage('cURL скопирован в буфер обмена!');
                setTimeout(() => downloadCurl(), 500);
            }).catch(err => {
                console.error('Failed to copy cURL:', err);
                showSuccessMessage('Ошибка копирования cURL');
            });
        }
    });
    document.getElementById('copyDetails').addEventListener('click', copyErrorDetails);
    document.getElementById('analyzeWithAI').addEventListener('click', analyzeErrorWithAI);
    document.getElementById('generatePlayback').addEventListener('click', generatePlaybackSteps);
}

function matchesTimeFilter(error, timeFilter) {
    if (timeFilter === 'all') return true;
    const errorTime = new Date(error.timestamp);
    const now = new Date();
    if (isNaN(errorTime.getTime())) return false;
    switch (timeFilter) {
        case 'today': {
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            return errorTime >= todayStart;
        }
        case 'week': {
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return errorTime >= weekAgo;
        }
        case 'month': {
            const monthAgo = new Date(now);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return errorTime >= monthAgo;
        }
        default: return true;
    }
}

function applyFilters() {
    const typeFilter = document.getElementById('typeFilter').value;
    const timeFilter = document.getElementById('timeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const searchText = document.getElementById('searchInput').value.toLowerCase();

    filteredHistory = allHistory.filter(error => {
        if (typeFilter !== 'all' && error.type !== typeFilter) return false;
        if (!matchesTimeFilter(error, timeFilter)) return false;
        if (statusFilter !== 'all' && error.type === 'NETWORK_ERROR') {
            const statusCode = error.details?.statusCode;
            switch (statusFilter) {
                case '4xx':
                    if (!statusCode || statusCode < 400 || statusCode >= 500) return false;
                    break;
                case '5xx':
                    if (!statusCode || statusCode < 500) return false;
                    break;
                default:
                    if (statusFilter !== 'all' && statusCode !== parseInt(statusFilter)) return false;
            }
        }
        if (searchText && !error.message.toLowerCase().includes(searchText)) return false;
        return true;
    });
    renderHistory();
    updateStats();
}

function groupErrorsByDay(errors) {
    const groups = {};
    const sortedErrors = [...errors].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    sortedErrors.forEach(error => {
        const date = new Date(error.timestamp);
        const dateKey = date.toDateString();
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(error);
    });
    return groups;
}

function formatDateDisplay(dateString) {
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Неизвестная дата';
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === today.toDateString()) return 'Сегодня';
        if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (error) {
        return 'Неизвестная дата';
    }
}

function renderHistory() {
    const listElement = document.getElementById('historyList');
    if (filteredHistory.length === 0) {
        showEmptyState();
        return;
    }
    const groupedErrors = groupErrorsByDay(filteredHistory);
    let html = '';
    Object.keys(groupedErrors).sort((a, b) => new Date(b) - new Date(a)).forEach(dateKey => {
        const dayErrors = groupedErrors[dateKey];
        html += `<div class="day-section">
                    <div class="day-header">
                        <div class="day-title">${formatDateDisplay(dateKey)}</div>
                        <div class="day-count">${dayErrors.length}</div>
                    </div>
                    <div class="errors-list">`;
        dayErrors.forEach((error, index) => {
            const statusCode = error.details?.statusCode;
            const statusIndicator = getStatusIndicator(statusCode, error.type);
            const hasScreenshotClass = error.hasScreenshot ? 'has-screenshot' : '';
            html += `<div class="error-item ${hasScreenshotClass}" data-date="${dateKey}" data-index="${index}">
                        <div class="error-header">
                            <span class="error-type-badge ${error.type === 'CONSOLE_ERROR' ? 'console' : 'network'}">
                                ${error.type === 'CONSOLE_ERROR' ? 'Console Error' : 'Network Error'}
                                ${statusIndicator}
                            </span>
                            <span class="error-time">${formatTime(error.timestamp)}</span>
                        </div>
                        <div class="error-message">${truncateText(error.message, 120)}</div>
                        <div class="error-url">${error.domain || truncateText(error.tabUrl, 60)}</div>
                    </div>`;
        });
        html += `</div></div>`;
    });
    listElement.innerHTML = html;
    document.querySelectorAll('.error-item').forEach(item => {
        item.addEventListener('click', () => {
            const dateKey = item.dataset.date;
            const index = parseInt(item.dataset.index);
            const groupedErrors = groupErrorsByDay(filteredHistory);
            const error = groupedErrors[dateKey][index];
            showErrorDetail(error);
        });
    });
}

function getStatusIndicator(statusCode, errorType) {
    if (errorType !== 'NETWORK_ERROR' || !statusCode) return '';
    let statusClass = '';
    let statusText = statusCode.toString();
    if (statusCode >= 400 && statusCode < 500) statusClass = 'status-4xx';
    else if (statusCode >= 500) statusClass = 'status-5xx';
    else if (statusCode === 0) { statusClass = 'status-error'; statusText = 'ERR'; }
    return statusClass ? `<span class="status-indicator ${statusClass}">${statusText}</span>` : '';
}

function showErrorDetail(error) {
    document.getElementById('historyList').classList.add('hidden');
    document.getElementById('errorDetail').classList.remove('hidden');
    document.getElementById('detailType').textContent = error.type === 'CONSOLE_ERROR' ? 'Console Error' : 'Network Error';
    document.getElementById('detailType').className = `detail-type ${error.type === 'CONSOLE_ERROR' ? 'console' : 'network'}`;
    document.getElementById('detailTime').textContent = formatDetailedTime(error.timestamp);
    document.getElementById('detailUrl').textContent = error.tabUrl || 'N/A';
    document.getElementById('detailMessage').textContent = error.message;
    window.currentErrorDetail = error;
    loadScreenshotForError(error);
    document.getElementById('aiAnalysisSection').classList.add('hidden');
    document.getElementById('aiAnalysisResult').textContent = '';
    document.getElementById('aiLoading').classList.add('hidden');
    const networkSection = document.getElementById('networkDetails');
    const curlButton = document.getElementById('copyCurl');
    const curlPreview = document.getElementById('curlPreview');
    const aiButton = document.getElementById('analyzeWithAI');
    aiButton.classList.remove('hidden');
    const playbackButton = document.getElementById('generatePlayback');
    playbackButton.classList.remove('hidden');
    const jiraButton = document.getElementById('sendToJira');
    jiraButton.classList.remove('hidden');
    document.getElementById('playbackSection').classList.add('hidden');
    document.getElementById('playbackSteps').innerHTML = '';
    document.getElementById('playbackLoading').classList.add('hidden');
    if (error.type === 'NETWORK_ERROR' && error.details) {
        networkSection.classList.remove('hidden');
        curlButton.classList.remove('hidden');
        curlPreview.classList.remove('hidden');
        document.getElementById('detailRequestUrl').textContent = error.details.url || 'N/A';
        document.getElementById('detailMethod').textContent = error.details.method || 'GET';
        document.getElementById('detailStatusCode').textContent = error.details.statusCode || 'N/A';
        document.getElementById('detailRequestType').textContent = error.details.type || 'N/A';
        const curlCommand = generateCurlCommand(error);
        document.getElementById('curlCommand').textContent = curlCommand;
        document.getElementById('copyCurl').dataset.curl = curlCommand;
        const responseBody = error.details.responseBody;
        const responseBodyElement = document.getElementById('detailResponseBody');
        if (responseBody) {
            responseBodyElement.textContent = responseBody;
            responseBodyElement.parentElement.style.display = 'block';
        } else {
            responseBodyElement.textContent = 'Тело ответа недоступно';
            responseBodyElement.parentElement.style.display = 'block';
        }
    } else {
        networkSection.classList.add('hidden');
        curlButton.classList.add('hidden');
        curlPreview.classList.add('hidden');
    }
    addReproductionStepsSection(error);
}

function addReproductionStepsSection(error) {
    const detailContent = document.querySelector('.detail-content');
    const existingStepsSection = document.getElementById('reproductionStepsSection');
    if (existingStepsSection) existingStepsSection.remove();
    if (error.reproductionSteps && error.reproductionSteps !== 'Не удалось автоматически определить шаги воспроизведения.') {
        const stepsSection = document.createElement('div');
        stepsSection.id = 'reproductionStepsSection';
        stepsSection.className = 'detail-section';
        stepsSection.innerHTML = `
            <label>Шаги воспроизведения</label>
            <div class="reproduction-steps">
                <pre class="steps-content">${error.reproductionSteps}</pre>
            </div>
            <button id="copySteps" class="action-button copy-steps-button" title="Скопировать шаги воспроизведения">
                📋 Скопировать шаги
            </button>
        `;
        const messageSection = document.getElementById('detailMessage').parentElement;
        detailContent.insertBefore(stepsSection, messageSection.nextSibling);
        document.getElementById('copySteps').addEventListener('click', () => {
            navigator.clipboard.writeText(error.reproductionSteps).then(() => {
                showSuccessMessage('Шаги воспроизведения скопированы!');
            }).catch(err => {
                console.error('Failed to copy steps:', err);
                showSuccessMessage('Ошибка копирования шагов');
            });
        });
    }
}

function loadScreenshotForError(error) {
    const screenshotSection = document.getElementById('screenshotSection');
    const noScreenshotSection = document.getElementById('noScreenshot');
    const screenshotImg = document.getElementById('screenshotImage');
    if (error.screenshot) {
        screenshotImg.src = error.screenshot;
        screenshotSection.classList.remove('hidden');
        noScreenshotSection.classList.add('hidden');
    } else {
        screenshotSection.classList.add('hidden');
        noScreenshotSection.classList.remove('hidden');
    }
}

function showList() {
    document.getElementById('errorDetail').classList.add('hidden');
    document.getElementById('historyList').classList.remove('hidden');
}

function generateCurlCommand(error) {
    if (!error.details || !error.details.url) return 'cURL не доступен для этой ошибки';
    const url = error.details.url;
    const method = error.details.method || 'GET';
    const origin = error.tabUrl ? new URL(error.tabUrl).origin : window.location.origin;
    return `curl -X ${method} "${url}" \\
  -H "Accept: */*" \\
  -H "Origin: ${origin}" \\
  -H "Referer: ${error.tabUrl || window.location.href}" \\
  --compressed \\
  --insecure`;
}

function copyCurl() {
    const curlCommand = document.getElementById('copyCurl').dataset.curl;
    navigator.clipboard.writeText(curlCommand).then(() => {
        showSuccessMessage('cURL скопирован в буфер обмена!');
    }).catch(err => {
        console.error('Failed to copy cURL:', err);
        showSuccessMessage('Ошибка копирования cURL');
    });
}

function downloadCurl() {
    const curlCommand = document.getElementById('copyCurl').dataset.curl;
    if (!curlCommand) {
        showSuccessMessage('Нет cURL команды для скачивания');
        return;
    }
    const blob = new Blob([curlCommand], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T')[0];
    link.download = `curl-command-${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showSuccessMessage('cURL команда скачана как .txt файл!');
}

function copyErrorDetails() {
    const error = window.currentErrorDetail;
    if (!error) return;
    let details = `Тип: ${error.type === 'CONSOLE_ERROR' ? 'Console Error' : 'Network Error'}
Время: ${formatDetailedTime(error.timestamp)}
URL страницы: ${error.tabUrl || 'N/A'}
Сообщение: ${error.message}
${error.details ? `Детали запроса:
- URL: ${error.details.url || 'N/A'}
- Метод: ${error.details.method || 'N/A'}
- Статус: ${error.details.statusCode || 'N/A'}
- Тип: ${error.details.type || 'N/A'}` : ''}
${error.hasScreenshot ? 'Есть скриншот: Да' : 'Есть скриншот: Нет'}`.trim();
    if (error.reproductionSteps && error.reproductionSteps !== 'Не удалось автоматически определить шаги воспроизведения.') {
        details += `\n\nШаги воспроизведения:\n${error.reproductionSteps}`;
    }
    navigator.clipboard.writeText(details).then(() => {
        showSuccessMessage('Детали ошибки скопированы!');
    }).catch(err => {
        console.error('Failed to copy details:', err);
        showSuccessMessage('Ошибка копирования деталей');
    });
}

async function generatePlaybackSteps() {
    const error = window.currentErrorDetail;
    if (!error) {
        showSuccessMessage('Нет данных об ошибке');
        return;
    }
    const playbackButton = document.getElementById('generatePlayback');
    const playbackSection = document.getElementById('playbackSection');
    const playbackLoading = document.getElementById('playbackLoading');
    const playbackSteps = document.getElementById('playbackSteps');
    playbackSection.classList.remove('hidden');
    playbackLoading.classList.remove('hidden');
    playbackSteps.innerHTML = '';
    playbackButton.disabled = true;
    const originalButtonText = playbackButton.textContent;
    playbackButton.textContent = '🎬 Генерация...';
    try {
        if (!window.errorMonitorAI) {
            showFallbackSteps(error);
            showSuccessMessage('AI недоступен, показаны стандартные шаги');
            return;
        }
        const result = await window.errorMonitorAI.generatePlaybackSteps(error);
        if (result.success && result.playbackSteps && result.playbackSteps.length > 0) {
            displayPlaybackSteps(result.playbackSteps);
            showSuccessMessage(`Сгенерировано ${result.playbackSteps.length} шагов воспроизведения!`);
        } else {
            showFallbackSteps(error);
            showSuccessMessage('Шаги воспроизведения загружены (стандартные)');
        }
    } catch (err) {
        console.error('[AI] Error generating playback steps:', err);
        showFallbackSteps(error);
        showSuccessMessage('Ошибка AI, показаны стандартные шаги');
    } finally {
        playbackLoading.classList.add('hidden');
        playbackButton.disabled = false;
        playbackButton.textContent = originalButtonText;
    }
}

function displayPlaybackSteps(steps) {
    const playbackSteps = document.getElementById('playbackSteps');
    if (!steps || steps.length === 0) {
        playbackSteps.innerHTML = '<div class="error-message">Не удалось сгенерировать шаги</div>';
        return;
    }
    let html = '<ol class="steps-list">';
    for (const step of steps) {
        let description = step.description || '';
        if (description.length > 100) description = description.substring(0, 97) + '...';
        html += `<li class="step-item">
            <span class="step-number">${step.step || (html.match(/step-item/g) || []).length + 1}</span>
            <div class="step-content">
                <div class="step-description">${escapeHtml(description)}</div>`;
        if (step.value && step.value.trim()) {
            html += `<div class="step-value">Значение: <code>${escapeHtml(String(step.value).substring(0, 100))}</code></div>`;
        }
        if (step.selector && step.selector.trim()) {
            html += `<div class="step-selector">Селектор: <code>${escapeHtml(String(step.selector).substring(0, 80))}</code></div>`;
        }
        html += `</div></li>`;
    }
    html += '</ol>';
    playbackSteps.innerHTML = html;
}

function showFallbackSteps(error) {
    const playbackSteps = document.getElementById('playbackSteps');
    let stepsText = error.reproductionSteps;
    if (stepsText && stepsText !== 'Не удалось автоматически определить шаги воспроизведения.') {
        const lines = stepsText.split('\n');
        let html = '<ol class="steps-list">';
        let stepNumber = 1;
        const seen = new Set();
        for (const line of lines) {
            let cleanLine = line.replace(/^\d+\.\s*/, '').trim();
            if (!cleanLine || cleanLine.startsWith('Ошибка:')) continue;
            cleanLine = cleanStepDescription(cleanLine);
            if (cleanLine.length < 3) continue;
            const key = cleanLine.toLowerCase().replace(/[^а-яёa-z0-9]/g, '');
            if (seen.has(key)) continue;
            seen.add(key);
            html += `<li class="step-item">
                <span class="step-number">${stepNumber}</span>
                <div class="step-content">
                    <div class="step-description">${escapeHtml(cleanLine)}</div>
                </div>
            </li>`;
            stepNumber++;
        }
        const errorMsg = error.message.length > 100 ? error.message.substring(0, 97) + '...' : error.message;
        html += `<li class="step-item error-step">
            <span class="step-number">${stepNumber}</span>
            <div class="step-content">
                <div class="step-description error">❌ Ошибка: ${escapeHtml(errorMsg)}</div>
            </div>
        </li>`;
        html += '</ol>';
        if (stepNumber > 1) {
            playbackSteps.innerHTML = html;
            return;
        }
    }
    playbackSteps.innerHTML = generateBasicSteps(error);
}

function cleanStepDescription(description) {
    if (!description) return '';
    let cleaned = String(description);
    cleaned = cleaned.replace(/([а-яА-Яa-zA-Z])([А-ЯA-Z])/g, '$1. $2');
    cleaned = cleaned.replace(/[Вв]аш город[^.]*\./, '');
    cleaned = cleaned.replace(/Отложенные[^.]*/, '');
    cleaned = cleaned.replace(/click\s+/gi, '');
    cleaned = cleaned.replace(/input\s+/gi, '');
    cleaned = cleaned.replace(/navigate\s+/gi, '');
    if (cleaned.length > 100) {
        const lastDot = cleaned.lastIndexOf('.', 100);
        const lastComma = cleaned.lastIndexOf(',', 100);
        const cutPos = Math.max(lastDot, lastComma);
        if (cutPos > 50) cleaned = cleaned.substring(0, cutPos + 1);
        else cleaned = cleaned.substring(0, 97) + '...';
    }
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    if (cleaned.length > 0) cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    return cleaned;
}

function generateBasicSteps(error) {
    let url = error.tabUrl || error.url || '';
    let domain = error.domain || '';
    try {
        if (url) {
            const urlObj = new URL(url);
            domain = urlObj.hostname;
        }
    } catch (e) {}
    let html = '<ol class="steps-list">';
    let stepNumber = 1;
    if (domain) {
        html += `<li class="step-item">
            <span class="step-number">${stepNumber}</span>
            <div class="step-content">
                <div class="step-description">Открыть страницу ${escapeHtml(domain)}</div>
            </div>
        </li>`;
        stepNumber++;
    }
    if (error.type === 'NETWORK_ERROR' && error.details) {
        const method = error.details.method || 'GET';
        const requestUrl = error.details.url || '';
        if (requestUrl) {
            let shortUrl = requestUrl;
            try {
                const urlObj = new URL(requestUrl);
                shortUrl = urlObj.pathname || requestUrl;
                if (shortUrl.length > 50) shortUrl = shortUrl.substring(0, 47) + '...';
            } catch (e) {}
            html += `<li class="step-item">
                <span class="step-number">${stepNumber}</span>
                <div class="step-content">
                    <div class="step-description">Выполнить ${escapeHtml(method)} запрос на ${escapeHtml(shortUrl)}</div>
                </div>
            </li>`;
            stepNumber++;
        }
    }
    const errorMsg = error.message.length > 100 ? error.message.substring(0, 97) + '...' : error.message;
    html += `<li class="step-item error-step">
        <span class="step-number">${stepNumber}</span>
        <div class="step-content">
            <div class="step-description error">❌ Ошибка: ${escapeHtml(errorMsg)}</div>
        </div>
    </li>`;
    html += '</ol>';
    return html;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

async function analyzeErrorWithAI() {
    const error = window.currentErrorDetail;
    if (!error) {
        showSuccessMessage('Нет данных об ошибке');
        return;
    }
    const aiButton = document.getElementById('analyzeWithAI');
    const aiSection = document.getElementById('aiAnalysisSection');
    const aiLoading = document.getElementById('aiLoading');
    const aiResult = document.getElementById('aiAnalysisResult');
    aiSection.classList.remove('hidden');
    aiLoading.classList.remove('hidden');
    aiResult.textContent = '';
    aiResult.classList.add('loading');
    aiButton.disabled = true;
    const originalText = aiButton.textContent;
    aiButton.textContent = '🤖 Анализ...';
    try {
        if (!window.errorMonitorAI) throw new Error('AI сервис недоступен');
        const result = await window.errorMonitorAI.analyzeError(error);
        aiLoading.classList.add('hidden');
        aiResult.classList.remove('loading');
        if (result.success && result.analysis) {
            aiResult.textContent = result.analysis;
            showSuccessMessage('Анализ завершен!');
        } else {
            aiResult.textContent = 'Не удалось получить анализ от AI. Попробуйте позже.\n\n' + (result.message || '');
            showSuccessMessage('Ошибка при анализе');
        }
    } catch (err) {
        console.error('[AI] Analysis error:', err);
        aiLoading.classList.add('hidden');
        aiResult.classList.remove('loading');
        aiResult.textContent = 'Ошибка при вызове AI сервиса: ' + err.message;
        showSuccessMessage('Ошибка AI анализа');
    } finally {
        aiButton.disabled = false;
        aiButton.textContent = originalText;
    }
}

function updateStats() {
    const total = filteredHistory.length;
    const consoleCount = filteredHistory.filter(e => e.type === 'CONSOLE_ERROR').length;
    const networkCount = filteredHistory.filter(e => e.type === 'NETWORK_ERROR').length;
    document.getElementById('totalCount').textContent = total;
    document.getElementById('consoleCount').textContent = consoleCount;
    document.getElementById('networkCount').textContent = networkCount;
}

function clearHistory() {
    if (confirm('Вы уверены, что хотите очистить всю историю ошибок?')) {
        chrome.storage.local.remove('errorHistory', () => {
            allHistory = [];
            filteredHistory = [];
            renderHistory();
            updateStats();
            showSuccessMessage('История очищена!');
        });
    }
}

function showEmptyState() {
    document.getElementById('historyList').innerHTML = `<div class="empty-state"><p>История ошибок пуста</p></div>`;
}

function showSuccessMessage(message) {
    const existingMessage = document.querySelector('.success-message');
    if (existingMessage) existingMessage.remove();
    const successMsg = document.createElement('div');
    successMsg.className = 'success-message';
    successMsg.textContent = message;
    document.body.appendChild(successMsg);
    setTimeout(() => successMsg.remove(), 2000);
}

function formatTime(timestamp) {
    try {
        if (timestamp instanceof Date) return timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        return '--:--';
    } catch (error) { return '--:--'; }
}

function formatDetailedTime(timestamp) {
    try {
        if (timestamp instanceof Date) return timestamp.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) return date.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return 'Неизвестно';
    } catch (error) { return 'Неизвестно'; }
}

function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function loadThemeSettings() {
    chrome.storage.local.get(["darkThemeEnabled"], (result) => {
        darkThemeEnabled = result.darkThemeEnabled || false;
        updateTheme(darkThemeEnabled);
    });
}

function updateTheme(isDark) {
    if (isDark) document.body.classList.add("dark-theme");
    else document.body.classList.remove("dark-theme");
}

// ========== JIRA ==========

async function sendToJira() {
    const error = window.currentErrorDetail;
    if (!error) {
        showSuccessMessage('Нет данных об ошибке');
        return;
    }

    const settings = await loadJiraSettings();

    if (!settings || !settings.jiraUrl || !settings.email || !settings.apiToken || !settings.projectKey) {
        const modal = document.getElementById('jiraModal');
        const settingsInfo = document.getElementById('jiraSettingsInfo');
        modal.classList.remove('hidden');
        settingsInfo.classList.remove('hidden');
        document.getElementById('jiraLoading').classList.add('hidden');
        document.getElementById('jiraResult').classList.add('hidden');
        return;
    }

    if (!settings.issueType) {
        showSuccessMessage('Сначала настройте тип задачи в настройках Jira');
        return;
    }

    pendingErrorForJira = error;

    if (settings.attachScreenshot && !error.screenshot) {
        pendingScreenshotForJira = await captureScreenshotForJira();
    } else {
        pendingScreenshotForJira = error.screenshot || null;
    }

    showCreationMethodDialog(error, settings);
}

function showCreationMethodDialog(error, settings) {
    const modal = document.getElementById('jiraModal');
    const loading = document.getElementById('jiraLoading');
    const resultDiv = document.getElementById('jiraResult');
    const settingsInfo = document.getElementById('jiraSettingsInfo');

    modal.classList.remove('hidden');
    settingsInfo.classList.add('hidden');
    loading.classList.add('hidden');

    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `
        <div class="creation-methods">
            <h4 style="margin-bottom: 15px; text-align: center;">📝 Как создать задачу?</h4>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button id="methodApiBtn" class="action-button" style="background: #0052cc; color: white; padding: 12px;">
                    🔐 Через API-токен (не стабилен)
                </button>
                <button id="methodSessionBtn" class="action-button" style="background: #36B37E; color: white; padding: 12px;">
                    🍪 Через вашу сессию в Jira (стабилен, но медленно)
                </button>
            </div>
            <div class="help-text" style="margin-top: 15px; text-align: center;">
                <strong>Через API</strong> - нужно заполнить токен в настройках.<br>
                <strong>Через сессию</strong> - использует ваш текущий логин в Jira (не нужен токен).
            </div>
        </div>
    `;

    document.getElementById('methodApiBtn').addEventListener('click', () => {
        closeJiraModal();
        showIssueTitleModal(error, 'api');
    });

    document.getElementById('methodSessionBtn').addEventListener('click', () => {
        closeJiraModal();
        sendToJiraViaSession(error, settings);
    });
}

async function sendToJiraViaSession(error, settings) {
    const baseUrl = settings.jiraUrl.replace(/\/$/, '');
    const projectKey = settings.projectKey;
    const issueType = settings.issueType;

    let summary = '';
    if (error.type === 'NETWORK_ERROR') {
        const statusCode = error.details?.statusCode || '';
        const url = error.details?.url || '';
        let shortUrl = '';
        try {
            const urlObj = new URL(url);
            shortUrl = urlObj.pathname.substring(0, 80);
        } catch (e) {
            shortUrl = url.substring(0, 80);
        }
        summary = `[${statusCode}] Network error: ${shortUrl}`;
    } else {
        const shortMessage = error.message.length > 100 ? error.message.substring(0, 97) + '...' : error.message;
        summary = `Console error: ${shortMessage}`;
    }

    let description = `*🧨 Ошибка в приложении*\n\n`;
    description += `*Время:* ${new Date(error.timestamp).toLocaleString('ru-RU')}\n`;
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

    description += `*Окружение:*\n`;
    description += `- User Agent: ${navigator.userAgent}\n`;
    description += `- Расширение: Error Monitor v2.0\n`;

    showSuccessMessage('🔍 Открываем Jira и создаем задачу...');
    closeJiraModal();

    //Открываем страницу проекта Jira
    const projectUrl = `${baseUrl}/jira/software/c/projects/${projectKey}/issues/`;
    const tab = await chrome.tabs.create({ url: projectUrl, active: true });
    await waitForTabLoad(tab.id);
    await delay(2000);

    //Внедряем скрипт
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (summary, description, issueType, projectKey, screenshotDataUrl) => {
            console.log('[Jira] Starting automation...');

            //Функция для поиска кнопки "Создать"
            const findCreateButton = () => {
                const selectors = [
                    '[data-testid="issue-create.ui.create.trigger"]',
                    '[data-testid="create-issue-button"]',
                    '[data-testid="global-create-button"]',
                    'button[aria-label="Create"]',
                    'button[aria-label="Создать"]',
                    'button[aria-label="Create issue"]'
                ];

                for (const selector of selectors) {
                    const btn = document.querySelector(selector);
                    if (btn && btn.offsetParent !== null) {
                        return btn;
                    }
                }

                const buttons = document.querySelectorAll('button');
                for (const btn of buttons) {
                    const text = (btn.innerText || '').trim().toLowerCase();
                    if ((text === 'создать' || text === 'create') && btn.offsetParent !== null) {
                        return btn;
                    }
                }
                return null;
            };

            //Функция для поиска поля заголовка в модальном окне
            const findSummaryField = () => {
                const selectors = [
                    'input#summary-field',
                    'input[name="summary"]',
                    'input[data-testid="issue-create.ui.summary.field"]',
                    'input[placeholder*="Summary"]',
                    'input[placeholder*="Название"]',
                    'input[aria-label*="Summary"]',
                    '#summary-field input',
                    'div[role="dialog"] input[type="text"]',
                    'div[role="dialog"] input:first-of-type'
                ];

                for (const selector of selectors) {
                    const field = document.querySelector(selector);
                    if (field && field.offsetParent !== null) {
                        console.log('[Jira] Found summary field:', selector);
                        return field;
                    }
                }
                return null;
            };

            //Функция для поиска поля описания в модальном окне
            const findDescriptionField = () => {
                const selectors = [
                    '#description-field',
                    'textarea[name="description"]',
                    '[data-testid="issue-create.ui.description.field"] textarea',
                    '.ProseMirror',
                    'div[role="dialog"] .ProseMirror',
                    'div[role="dialog"] textarea',
                    'div[role="dialog"] [contenteditable="true"]',
                    'textarea[placeholder*="Description"]',
                    'textarea[placeholder*="Описание"]'
                ];

                for (const selector of selectors) {
                    const field = document.querySelector(selector);
                    if (field && field.offsetParent !== null) {
                        console.log('[Jira] Found description field:', selector);
                        return field;
                    }
                }
                return null;
            };

            //Функция для заполнения полей с повторными попытками
            const fillFieldsWithRetry = async (maxAttempts = 30) => {
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    console.log(`[Jira] Fill attempt ${attempt + 1}/${maxAttempts}`);

                    const summaryField = findSummaryField();
                    const descriptionField = findDescriptionField();

                    let filled = false;

                    if (summaryField) {
                        try {
                            summaryField.click();
                            summaryField.focus();
                            summaryField.value = '';
                            summaryField.value = summary;
                            summaryField.dispatchEvent(new Event('input', { bubbles: true }));
                            summaryField.dispatchEvent(new Event('change', { bubbles: true }));
                            summaryField.dispatchEvent(new Event('blur', { bubbles: true }));
                            console.log('[Jira] Summary filled:', summary.substring(0, 50));
                            filled = true;
                        } catch (e) {
                            console.error('[Jira] Error filling summary:', e);
                        }
                    }

                    if (descriptionField) {
                        try {
                            descriptionField.click();
                            descriptionField.focus();

                            if (descriptionField.isContentEditable || descriptionField.classList.contains('ProseMirror')) {
                                descriptionField.focus();
                                document.execCommand('selectAll', false, null);
                                await new Promise(r => setTimeout(r, 50));
                                document.execCommand('insertText', false, description);
                                console.log('[Jira] Description filled via execCommand, length:', description.length);
                            } else if (descriptionField.tagName === 'TEXTAREA') {
                                descriptionField.value = description;
                                descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
                                descriptionField.dispatchEvent(new Event('change', { bubbles: true }));
                                console.log('[Jira] Description filled via textarea, length:', description.length);
                            } else {
                                descriptionField.value = description;
                                descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
                                console.log('[Jira] Description filled via value, length:', description.length);
                            }

                            filled = true;
                        } catch (e) {
                            console.error('[Jira] Error filling description:', e);
                        }
                    }

                    if (summaryField && descriptionField) {
                        console.log('[Jira] Both fields filled successfully!');

                        const successDiv = document.createElement('div');
                        successDiv.style.cssText = `
                            position: fixed;
                            bottom: 20px;
                            right: 20px;
                            background: #36B37E;
                            color: white;
                            padding: 12px 20px;
                            border-radius: 8px;
                            z-index: 99999;
                            font-family: monospace;
                            font-size: 14px;
                            animation: slideIn 0.3s ease;
                        `;
                        successDiv.innerHTML = '✅ Заголовок и описание вставлены!';
                        document.body.appendChild(successDiv);
                        setTimeout(() => successDiv.remove(), 3000);
                        return true;
                    }

                    await new Promise(r => setTimeout(r, 500));
                }

                console.log('[Jira] Failed to fill fields after max attempts');
                return false;
            };

            const waitForModal = () => {
                return new Promise((resolve) => {
                    let attempts = 0;
                    const maxAttempts = 30;

                    const checkModal = setInterval(() => {
                        attempts++;

                        const modalSelectors = [
                            '[role="dialog"]',
                            '[data-testid="issue-create-modal"]',
                            'div[aria-label*="Create issue"]',
                            'div[aria-label*="Создание"]',
                            'form[class*="create-issue"]'
                        ];

                        for (const selector of modalSelectors) {
                            const modal = document.querySelector(selector);
                            if (modal && modal.offsetParent !== null) {
                                console.log('[Jira] Modal found after', attempts, 'attempts');
                                clearInterval(checkModal);
                                resolve(true);
                                return;
                            }
                        }

                        if (attempts >= maxAttempts) {
                            clearInterval(checkModal);
                            console.log('[Jira] Modal not found');
                            resolve(false);
                        }
                    }, 300);
                });
            };

            const run = async () => {
                await new Promise(r => setTimeout(r, 1000));

                let clickAttempts = 0;
                const maxClickAttempts = 15;
                let clicked = false;

                while (clickAttempts < maxClickAttempts && !clicked) {
                    const createBtn = findCreateButton();
                    if (createBtn) {
                        console.log('[Jira] Clicking create button, attempt', clickAttempts + 1);
                        createBtn.click();
                        clicked = true;
                        break;
                    }
                    clickAttempts++;
                    await new Promise(r => setTimeout(r, 800));
                }

                if (!clicked) {
                    console.log('[Jira] Create button not found');
                    const fallbackData = `НАЗВАНИЕ:\n${summary}\n\nОПИСАНИЕ:\n${description}`;
                    navigator.clipboard.writeText(fallbackData);

                    const errorDiv = document.createElement('div');
                    errorDiv.style.cssText = `
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        background: #FF5630;
                        color: white;
                        padding: 12px 20px;
                        border-radius: 8px;
                        z-index: 99999;
                        font-family: monospace;
                        font-size: 14px;
                        animation: slideIn 0.3s ease;
                    `;
                    errorDiv.innerHTML = '⚠️ Кнопка "Создать" не найдена. Данные скопированы в буфер.';
                    document.body.appendChild(errorDiv);
                    setTimeout(() => errorDiv.remove(), 5000);
                    return;
                }

                const modalOpened = await waitForModal();
                if (!modalOpened) {
                    console.log('[Jira] Modal did not open');
                    return;
                }

                await new Promise(r => setTimeout(r, 1500));

                const filled = await fillFieldsWithRetry(25);

                if (!filled) {
                    console.log('[Jira] Could not fill fields, copying to clipboard');
                    const fallbackData = `НАЗВАНИЕ:\n${summary}\n\nОПИСАНИЕ:\n${description}`;
                    navigator.clipboard.writeText(fallbackData);

                    const warningDiv = document.createElement('div');
                    warningDiv.style.cssText = `
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        background: #FF8B00;
                        color: white;
                        padding: 12px 20px;
                        border-radius: 8px;
                        z-index: 99999;
                        font-family: monospace;
                        font-size: 14px;
                        animation: slideIn 0.3s ease;
                    `;
                    warningDiv.innerHTML = '⚠️ Поля не найдены. Данные скопированы в буфер обмена.';
                    document.body.appendChild(warningDiv);
                    setTimeout(() => warningDiv.remove(), 5000);
                }
            };

            if (!document.querySelector('#jira-styles')) {
                const style = document.createElement('style');
                style.id = 'jira-styles';
                style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }

            run();
        },
        args: [summary, description, issueType, projectKey, pendingScreenshotForJira]
    });
}

function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
        chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        });
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function openJiraNativeModal(settings, error, screenshotDataUrl) {
    const baseUrl = settings.jiraUrl.replace(/\/$/, '');
    const projectKey = settings.projectKey;
    const issueType = settings.issueType;

    let summary = '';
    if (error.type === 'NETWORK_ERROR') {
        const statusCode = error.details?.statusCode || '';
        const url = error.details?.url || '';
        let shortUrl = '';
        try {
            const urlObj = new URL(url);
            shortUrl = urlObj.pathname.substring(0, 50);
        } catch (e) {
            shortUrl = url.substring(0, 50);
        }
        summary = `[${statusCode}] Network error: ${shortUrl}`;
    } else {
        summary = `Console error: ${error.message.substring(0, 80)}`;
    }

    let description = `*🧨 Ошибка в приложении*\n\n`;
    description += `*Время:* ${new Date(error.timestamp).toLocaleString('ru-RU')}\n`;
    description += `*Тип:* ${error.type === 'CONSOLE_ERROR' ? 'Console Error' : 'Network Error'}\n`;
    description += `*URL страницы:* ${error.tabUrl || 'N/A'}\n\n`;
    description += `*Сообщение об ошибке:*\n{code}\n${error.message}\n{code}\n\n`;

    if (error.type === 'NETWORK_ERROR' && error.details) {
        description += `*Детали запроса:*\n`;
        description += `- URL: ${error.details.url || 'N/A'}\n`;
        description += `- Метод: ${error.details.method || 'GET'}\n`;
        description += `- Статус: ${error.details.statusCode || 'N/A'}\n\n`;
    }

    if (error.reproductionSteps && error.reproductionSteps !== 'Не удалось автоматически определить шаги воспроизведения.') {
        description += `*Шаги воспроизведения:*\n${error.reproductionSteps}\n\n`;
    }

    description += `*Окружение:*\n`;
    description += `- User Agent: ${navigator.userAgent}\n`;
    description += `- Расширение: Error Monitor\n`;

    const issueTypeMap = {
        'Баг': 1,
        'Bug': 1,
        'Улучшение': 2,
        'Improvement': 2,
        'Задача': 3,
        'Task': 3,
        'Story': 4
    };
    const issueTypeId = issueTypeMap[issueType] || 1;

    fetch(`${baseUrl}/rest/api/3/project/${projectKey}`, {
        method: 'GET',
        headers: {
            'Authorization': 'Basic ' + btoa(`${settings.email}:${settings.apiToken}`)
        }
    })
        .then(response => response.json())
        .then(project => {
            const projectId = project.id;

            const jiraUrl = `${baseUrl}/jira/core/projects/${projectKey}/issues/`;

            chrome.tabs.create({ url: jiraUrl, active: true }, (tab) => {
                setTimeout(() => {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: (projectId, issueTypeId, summary, description) => {
                            let attempts = 0;
                            const maxAttempts = 20;

                            const checkAP = setInterval(() => {
                                attempts++;

                                if (window.AP && typeof window.AP.jira === 'function') {
                                    clearInterval(checkAP);
                                    console.log('AP.jira found, opening dialog');

                                    window.AP.jira.openCreateIssueDialog(function(issues) {
                                        console.log('Dialog closed, created issues:', issues);
                                        if (issues && issues.length > 0) {
                                            const issueKey = issues[0].key;
                                            alert(`Задача ${issueKey} создана!`);
                                        }
                                    }, {
                                        pid: projectId,
                                        issueType: issueTypeId,
                                        fields: {
                                            summary: summary,
                                            description: description
                                        }
                                    });
                                } else if (attempts >= maxAttempts) {
                                    clearInterval(checkAP);
                                    console.log('AP.jira not available');
                                    alert('Не удалось загрузить API Jira. Пожалуйста, обновите страницу.');
                                }
                            }, 500);
                        },
                        args: [projectId, issueTypeId, summary, description]
                    }).catch(err => {
                        console.error('Script injection failed:', err);
                        fallbackToClipboard(summary, description, baseUrl, projectKey);
                    });
                }, 3000);
            });
        })
        .catch(error => {
            console.error('Failed to get project ID:', error);
            fallbackToClipboard(summary, description, baseUrl, projectKey);
        });
}

function fallbackToClipboard(summary, description, baseUrl, projectKey) {
    const fullData = `📌 НАЗВАНИЕ:\n${summary}\n\n📝 ОПИСАНИЕ:\n${description}`;
    navigator.clipboard.writeText(fullData);

    const projectUrl = `${baseUrl}/jira/core/projects/${projectKey}/issues/`;
    chrome.tabs.create({ url: projectUrl, active: true });
    showSuccessMessage('✅ Данные скопированы! В Jira нажмите "Создать" и вставьте текст (Ctrl+V)');
    closeJiraModal();
}

async function findOrCreateJiraTab(baseUrl) {
    const tabs = await chrome.tabs.query({ url: `${baseUrl}/*` });

    if (tabs.length > 0) {
        await chrome.tabs.update(tabs[0].id, { active: true });
        return tabs[0];
    }

    const projectUrl = `${baseUrl}/jira/software/c/projects/${settings.projectKey}/issues/`;
    const newTab = await chrome.tabs.create({ url: projectUrl, active: true });
    return newTab;
}

function showIssueTitleModal(error, method) {
    const modal = document.getElementById('issueTitleModal');
    const titleInput = document.getElementById('issueTitle');
    const titlePreview = document.getElementById('titlePreview');

    let suggestedTitle = '';
    if (error.type === 'NETWORK_ERROR') {
        const statusCode = error.details?.statusCode || '';
        const url = error.details?.url || '';
        let shortUrl = '';
        try {
            const urlObj = new URL(url);
            shortUrl = urlObj.pathname;
        } catch (e) {
            shortUrl = url.substring(0, 50);
        }
        suggestedTitle = `[${statusCode}] Network error: ${shortUrl}`;
    } else {
        const shortMessage = error.message.length > 80 ? error.message.substring(0, 77) + '...' : error.message;
        suggestedTitle = `Console error: ${shortMessage}`;
    }

    titleInput.value = suggestedTitle;
    titlePreview.textContent = suggestedTitle;
    titleInput.dataset.method = method;

    titleInput.oninput = () => {
        titlePreview.textContent = titleInput.value || '(название не указано)';
    };

    modal.classList.remove('hidden');
}

function closeTitleModal() {
    const modal = document.getElementById('issueTitleModal');
    modal.classList.add('hidden');
}

async function confirmSendToJira() {
    const title = document.getElementById('issueTitle').value.trim();
    if (!title) {
        showSuccessMessage('Пожалуйста, введите название задачи');
        return;
    }
    const method = document.getElementById('issueTitle').dataset.method;
    closeTitleModal();
    if (method === 'api') {
        await executeSendToJira(title);
    }
}

async function executeSendToJira(customTitle) {
    const error = pendingErrorForJira;
    const screenshot = pendingScreenshotForJira;
    const modal = document.getElementById('jiraModal');
    const loading = document.getElementById('jiraLoading');
    const resultDiv = document.getElementById('jiraResult');
    const settingsInfo = document.getElementById('jiraSettingsInfo');
    const sendButton = document.getElementById('sendToJira');

    modal.classList.remove('hidden');
    settingsInfo.classList.add('hidden');
    loading.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    if (sendButton) sendButton.disabled = true;

    try {
        const result = await createJiraIssueWithTitle(error, screenshot, customTitle);
        loading.classList.add('hidden');
        resultDiv.classList.remove('hidden');
        if (result.success) {
            resultDiv.innerHTML = `
                <div class="jira-success">
                    <span class="success-icon">✅</span>
                    <p>Задача успешно создана!</p>
                    <p><strong>Ключ:</strong> ${result.issueKey}</p>
                    <a href="${result.issueUrl}" target="_blank" class="jira-link">Открыть в Jira →</a>
                </div>
            `;
            showSuccessMessage(`Задача ${result.issueKey} создана в Jira!`);
        } else {
            resultDiv.innerHTML = `<div class="jira-error"><span class="error-icon">❌</span><p>Ошибка: ${result.message}</p></div>`;
        }
    } catch (err) {
        loading.classList.add('hidden');
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = `<div class="jira-error"><span class="error-icon">❌</span><p>Ошибка: ${err.message}</p></div>`;
    } finally {
        if (sendButton) sendButton.disabled = false;
        pendingErrorForJira = null;
        pendingScreenshotForJira = null;
    }
}

async function createJiraIssueWithTitle(error, screenshotDataUrl, customTitle) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: "CREATE_JIRA_ISSUE",
            error: error,
            screenshot: screenshotDataUrl,
            customTitle: customTitle
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.success) {
                resolve(response);
            } else {
                reject(new Error(response?.error || 'Failed to create Jira issue'));
            }
        });
    });
}

async function loadJiraSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['jiraSettings'], (result) => {
            resolve(result.jiraSettings || null);
        });
    });
}

async function captureScreenshotForJira() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "CAPTURE_SCREENSHOT" }, (response) => {
            resolve(response?.screenshot || null);
        });
    });
}

function openJiraSettings() {
    chrome.windows.create({
        url: chrome.runtime.getURL("jira-settings.html"),
        type: "popup",
        width: 550,
        height: 700
    });
}

function closeJiraModal() {
    const modal = document.getElementById('jiraModal');
    modal.classList.add('hidden');
}