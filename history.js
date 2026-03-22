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
    document.getElementById('copyCurl').addEventListener('click', copyCurl);
    document.getElementById('copyDetails').addEventListener('click', copyErrorDetails);
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


    const networkSection = document.getElementById('networkDetails');
    const curlButton = document.getElementById('copyCurl');
    const curlPreview = document.getElementById('curlPreview');

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


        document.getElementById('copyCurl').onclick = () => {

            navigator.clipboard.writeText(curlCommand).then(() => {
                showSuccessMessage('cURL скопирован в буфер обмена!');


                setTimeout(() => {
                    downloadCurl();
                }, 500);
            }).catch(err => {
                console.error('Failed to copy cURL:', err);
                showSuccessMessage('Ошибка копирования cURL');
            });
        };
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

    document.getElementById('copyDetails').addEventListener('click', copyErrorDetails);
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