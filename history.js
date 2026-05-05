let allHistory = [];
let filteredHistory = [];
let darkThemeEnabled = false;


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

    if (isNaN(errorTime.getTime())) {
        return false;
    }

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
        default:
            return true;
    }
}


function applyFilters() {
    const typeFilter = document.getElementById('typeFilter').value;
    const timeFilter = document.getElementById('timeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const searchText = document.getElementById('searchInput').value.toLowerCase();

    filteredHistory = allHistory.filter(error => {

        if (typeFilter !== 'all' && error.type !== typeFilter) {
            return false;
        }


        if (!matchesTimeFilter(error, timeFilter)) {
            return false;
        }


        if (statusFilter !== 'all' && error.type === 'NETWORK_ERROR') {
            const statusCode = error.details?.statusCode;

            switch (statusFilter) {
                case '4xx':
                    if (!statusCode || statusCode < 400 || statusCode >= 500) return false;
                    break;
                case '5xx':
                    if (!statusCode || statusCode < 500) return false;
                    break;
                case 'network-error':

                    if (statusCode !== 0 && statusCode !== undefined) return false;
                    break;
                default:

                    if (statusFilter !== 'all' && statusCode !== parseInt(statusFilter)) {
                        return false;
                    }
            }
        }


        if (searchText && !error.message.toLowerCase().includes(searchText)) {
            return false;
        }

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

        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }

        groups[dateKey].push(error);
    });

    return groups;
}


function formatDateDisplay(dateString) {
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return 'Неизвестная дата';
        }

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Сегодня';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Вчера';
        } else {
            return date.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        }
    } catch (error) {
        console.error('Error formatting date:', error, dateString);
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

    Object.keys(groupedErrors)
        .sort((a, b) => new Date(b) - new Date(a))
        .forEach(dateKey => {
            const dayErrors = groupedErrors[dateKey];

            html += `
                <div class="day-section">
                    <div class="day-header">
                        <div class="day-title">${formatDateDisplay(dateKey)}</div>
                        <div class="day-count">${dayErrors.length}</div>
                    </div>
                    <div class="errors-list">
            `;

            dayErrors.forEach((error, index) => {
                const statusCode = error.details?.statusCode;
                const statusIndicator = getStatusIndicator(statusCode, error.type);
                const hasScreenshotClass = error.hasScreenshot ? 'has-screenshot' : '';

                html += `
                    <div class="error-item ${hasScreenshotClass}" data-date="${dateKey}" data-index="${index}">
                        <div class="error-header">
                            <span class="error-type-badge ${error.type === 'CONSOLE_ERROR' ? 'console' : 'network'}">
                                ${error.type === 'CONSOLE_ERROR' ? 'Console Error' : 'Network Error'}
                                ${statusIndicator}
                            </span>
                            <span class="error-time">${formatTime(error.timestamp)}</span>
                        </div>
                        <div class="error-message">${truncateText(error.message, 120)}</div>
                        <div class="error-url">${error.domain || truncateText(error.tabUrl, 60)}</div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
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

    if (statusCode >= 400 && statusCode < 500) {
        statusClass = 'status-4xx';
    } else if (statusCode >= 500) {
        statusClass = 'status-5xx';
    } else if (statusCode === 0) {
        statusClass = 'status-error';
        statusText = 'ERR';
    }

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
    if (existingStepsSection) {
        existingStepsSection.remove();
    }


    if (error.reproductionSteps &&
        error.reproductionSteps !== 'Не удалось автоматически определить шаги воспроизведения.') {

        const stepsSection = document.createElement('div');
        stepsSection.id = 'reproductionStepsSection';
        stepsSection.className = 'detail-section';

        stepsSection.innerHTML = `
            <label>Шаги воспроизведения</label>
            <div class="reproduction-steps">
                <pre class="steps-content">${error.reproductionSteps}</pre>
            </div>
            <button id="copySteps" class="action-button copy-steps-button" 
                    title="Скопировать шаги воспроизведения">
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

    let details = `
Тип: ${error.type === 'CONSOLE_ERROR' ? 'Console Error' : 'Network Error'}
Время: ${formatDetailedTime(error.timestamp)}
URL страницы: ${error.tabUrl || 'N/A'}
Сообщение: ${error.message}
${error.details ? `
Детали запроса:
- URL: ${error.details.url || 'N/A'}
- Метод: ${error.details.method || 'N/A'}
- Статус: ${error.details.statusCode || 'N/A'}
- Тип: ${error.details.type || 'N/A'}
` : ''}
${error.hasScreenshot ? 'Есть скриншот: Да' : 'Есть скриншот: Нет'}
    `.trim();


    if (error.reproductionSteps &&
        error.reproductionSteps !== 'Не удалось автоматически определить шаги воспроизведения.') {
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
        console.error('[AI] No error data');
        showSuccessMessage('Нет данных об ошибке');
        return;
    }

    const playbackButton = document.getElementById('generatePlayback');
    const playbackSection = document.getElementById('playbackSection');
    const playbackLoading = document.getElementById('playbackLoading');
    const playbackSteps = document.getElementById('playbackSteps');

    // Показываем секцию
    playbackSection.classList.remove('hidden');
    playbackLoading.classList.remove('hidden');
    playbackSteps.innerHTML = '';

    // Блокируем кнопку
    playbackButton.disabled = true;
    const originalButtonText = playbackButton.textContent;
    playbackButton.textContent = '🎬 Генерация...';

    try {
        // Проверяем, доступен ли AI
        if (!window.errorMonitorAI) {
            console.warn('[AI] errorMonitorAI not available');
            showFallbackSteps(error);
            showSuccessMessage('AI недоступен, показаны стандартные шаги');
            return;
        }

        // Генерируем шаги через AI
        const result = await window.errorMonitorAI.generatePlaybackSteps(error);

        if (result.success && result.playbackSteps && result.playbackSteps.length > 0) {
            // Отображаем шаги от AI
            displayPlaybackSteps(result.playbackSteps);
            showSuccessMessage(`Сгенерировано ${result.playbackSteps.length} шагов воспроизведения!`);
        } else {
            // Fallback на стандартные шаги
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
        if (description.length > 100) {
            description = description.substring(0, 97) + '...';
        }

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

    // Пытаемся извлечь шаги из reproductionSteps
    let stepsText = error.reproductionSteps;

    if (stepsText && stepsText !== 'Не удалось автоматически определить шаги воспроизведения.') {
        // Парсим шаги из текста
        const lines = stepsText.split('\n');
        let html = '<ol class="steps-list">';
        let stepNumber = 1;
        const seen = new Set();

        for (const line of lines) {
            let cleanLine = line.replace(/^\d+\.\s*/, '').trim();

            if (!cleanLine || cleanLine.startsWith('Ошибка:')) continue;

            // Очищаем от мусора
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

        // Добавляем шаг с ошибкой
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

    // Если нет шагов, генерируем базовые
    playbackSteps.innerHTML = generateBasicSteps(error);
}

function cleanStepDescription(description) {
    if (!description) return '';

    let cleaned = String(description);

    // Удаляем странные конкатенации
    cleaned = cleaned.replace(/([а-яА-Яa-zA-Z])([А-ЯA-Z])/g, '$1. $2');
    cleaned = cleaned.replace(/[Вв]аш город[^.]*\./, '');
    cleaned = cleaned.replace(/Отложенные[^.]*/, '');

    // Удаляем технические термины
    cleaned = cleaned.replace(/click\s+/gi, '');
    cleaned = cleaned.replace(/input\s+/gi, '');
    cleaned = cleaned.replace(/navigate\s+/gi, '');

    // Обрезаем слишком длинные
    if (cleaned.length > 100) {
        const lastDot = cleaned.lastIndexOf('.', 100);
        const lastComma = cleaned.lastIndexOf(',', 100);
        const cutPos = Math.max(lastDot, lastComma);

        if (cutPos > 50) {
            cleaned = cleaned.substring(0, cutPos + 1);
        } else {
            cleaned = cleaned.substring(0, 97) + '...';
        }
    }

    // Очищаем пробелы
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Первая буква заглавная
    if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

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
        const statusCode = error.details.statusCode || '';
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

        if (statusCode) {
            html += `<li class="step-item">
                <span class="step-number">${stepNumber}</span>
                <div class="step-content">
                    <div class="step-description">Получен ответ с кодом ${escapeHtml(String(statusCode))}</div>
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

// Также добавьте функцию analyzeErrorWithAI, если её нет
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
        if (!window.errorMonitorAI) {
            throw new Error('AI сервис недоступен');
        }

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
    document.getElementById('historyList').innerHTML = `
    <div class="empty-state">
      <p>История ошибок пуста</p>
    </div>
  `;
}


function showSuccessMessage(message) {
    const existingMessage = document.querySelector('.success-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    const successMsg = document.createElement('div');
    successMsg.className = 'success-message';
    successMsg.textContent = message;
    document.body.appendChild(successMsg);

    setTimeout(() => {
        successMsg.remove();
    }, 2000);
}


function formatTime(timestamp) {
    try {

        if (timestamp instanceof Date) {
            return timestamp.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }


        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
            return date.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        return '--:--';
    } catch (error) {
        return '--:--';
    }
}

function formatDetailedTime(timestamp) {
    try {

        if (timestamp instanceof Date) {
            return timestamp.toLocaleString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }


        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
            return date.toLocaleString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        return 'Неизвестно';
    } catch (error) {
        return 'Неизвестно';
    }
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
    if (isDark) {
        document.body.classList.add("dark-theme");
    } else {
        document.body.classList.remove("dark-theme");
    }
}