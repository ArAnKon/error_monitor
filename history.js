let allHistory = [];
let filteredHistory = [];

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    setupEventListeners();
});

// Загрузка истории из chrome.storage
function loadHistory() {
    chrome.storage.local.get(["errorHistory"], (result) => {
        if (result.errorHistory) {
            allHistory = result.errorHistory;
            filteredHistory = [...allHistory];
            renderHistory();
            updateStats();
        } else {
            showEmptyState();
        }
    });
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Кнопка назад
    document.getElementById('backButton').addEventListener('click', () => {
        window.close();
    });

    // Фильтры
    document.getElementById('typeFilter').addEventListener('change', applyFilters);
    document.getElementById('timeFilter').addEventListener('change', applyFilters);
    document.getElementById('searchInput').addEventListener('input', applyFilters);

    // Очистка истории
    document.getElementById('clearHistory').addEventListener('click', clearHistory);

    // Детали ошибки
    document.getElementById('backToList').addEventListener('click', showList);
    document.getElementById('copyCurl').addEventListener('click', copyCurl);
    document.getElementById('copyDetails').addEventListener('click', copyErrorDetails);
}

// Применение фильтров
function applyFilters() {
    const typeFilter = document.getElementById('typeFilter').value;
    const timeFilter = document.getElementById('timeFilter').value;
    const searchText = document.getElementById('searchInput').value.toLowerCase();

    filteredHistory = allHistory.filter(error => {
        // Фильтр по типу
        if (typeFilter !== 'all' && error.type !== typeFilter) {
            return false;
        }

        // Фильтр по времени
        if (timeFilter !== 'all') {
            const errorTime = new Date(error.timestamp);
            const now = new Date();

            const errorDate = new Date(errorTime.getFullYear(), errorTime.getMonth(), errorTime.getDate());
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);

            switch (timeFilter) {
                case 'today':
                    if (errorDate.getTime() !== today.getTime()) return false;
                    break;
                case 'week':
                    if (errorDate < weekAgo) return false;
                    break;
                case 'month':
                    if (errorDate < monthAgo) return false;
                    break;
            }
        }

        // Поиск по сообщению
        if (searchText && !error.message.toLowerCase().includes(searchText)) {
            return false;
        }

        return true;
    });

    renderHistory();
    updateStats();
}

// Группировка ошибок по дням
function groupErrorsByDay(errors) {
    const groups = {};

    errors.forEach(error => {
        const date = new Date(error.timestamp);
        const dateKey = date.toDateString();

        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }

        groups[dateKey].push(error);
    });

    return groups;
}

// Форматирование даты для отображения
function formatDateDisplay(dateString) {
    const date = new Date(dateString);
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
}

// Рендер списка истории с группировкой по дням
function renderHistory() {
    const listElement = document.getElementById('historyList');

    if (filteredHistory.length === 0) {
        showEmptyState();
        return;
    }

    // Сортировка по времени (новые сверху)
    const sortedHistory = [...filteredHistory].sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
    );

    // Группировка по дням
    const groupedErrors = groupErrorsByDay(sortedHistory);

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

                html += `
                    <div class="error-item" data-date="${dateKey}" data-index="${index}">
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

    // Обработчики клика
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

    listElement.innerHTML = html;


// Получение индикатора статуса для сетевых ошибок
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

// Показать детали ошибки
function showErrorDetail(error) {
    document.getElementById('historyList').classList.add('hidden');
    document.getElementById('errorDetail').classList.remove('hidden');

    // Заполняем детали
    document.getElementById('detailType').textContent = error.type === 'CONSOLE_ERROR' ? 'Console Error' : 'Network Error';
    document.getElementById('detailType').className = `error-type ${error.type === 'CONSOLE_ERROR' ? 'console' : 'network'}`;
    document.getElementById('detailType').style.background = error.type === 'CONSOLE_ERROR' ?
        'linear-gradient(135deg, #d32f2f, #f44336)' :
        'linear-gradient(135deg, #1976d2, #2196f3)';

    document.getElementById('detailTime').textContent = formatDetailedTime(error.timestamp);
    document.getElementById('detailUrl').textContent = error.tabUrl || 'N/A';
    document.getElementById('detailMessage').textContent = error.message;

    // Детали для сетевых ошибок
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

        // Генерация cURL
        const curlCommand = generateCurlCommand(error);
        document.getElementById('curlCommand').textContent = curlCommand;
        document.getElementById('copyCurl').dataset.curl = curlCommand;
    } else {
        networkSection.classList.add('hidden');
        curlButton.classList.add('hidden');
        curlPreview.classList.add('hidden');
    }
}

// Показать список
function showList() {
    document.getElementById('errorDetail').classList.add('hidden');
    document.getElementById('historyList').classList.remove('hidden');
}

// Генерация cURL команды
function generateCurlCommand(error) {
    if (!error.details || !error.details.url) return 'cURL не доступен для этой ошибки';

    const url = error.details.url;
    const method = error.details.method || 'GET';
    const origin = error.tabUrl ? new URL(error.tabUrl).origin : window.location.origin;

    return `curl -X ${method} '${url}' \\
  -H 'Accept: */*' \\
  -H 'Accept-Language: en-US,en;q=0.9' \\
  -H 'Connection: keep-alive' \\
  -H 'Origin: ${origin}' \\
  -H 'Referer: ${error.tabUrl || window.location.href}' \\
  -H 'User-Agent: ${navigator.userAgent}' \\
  --compressed \\
  --insecure \\
  --verbose`;
}

// Копирование cURL
function copyCurl() {
    const curlCommand = document.getElementById('copyCurl').dataset.curl;

    navigator.clipboard.writeText(curlCommand).then(() => {
        showSuccessMessage('cURL скопирован в буфер обмена!');
    }).catch(err => {
        console.error('Failed to copy cURL:', err);
        showSuccessMessage('Ошибка копирования cURL');
    });
}

// Копирование деталей ошибки
function copyErrorDetails() {
    const error = getCurrentErrorDetail();
    const details = `
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
  `.trim();

    navigator.clipboard.writeText(details).then(() => {
        showSuccessMessage('Детали ошибки скопированы!');
    }).catch(err => {
        console.error('Failed to copy details:', err);
        showSuccessMessage('Ошибка копирования деталей');
    });
}

// Получить текущую ошибку из деталей
function getCurrentErrorDetail() {
    const message = document.getElementById('detailMessage').textContent;
    return filteredHistory.find(error => error.message === message);
}

// Обновление статистики
function updateStats() {
    const total = filteredHistory.length;
    const consoleCount = filteredHistory.filter(e => e.type === 'CONSOLE_ERROR').length;
    const networkCount = filteredHistory.filter(e => e.type === 'NETWORK_ERROR').length;

    document.getElementById('totalCount').textContent = total;
    document.getElementById('consoleCount').textContent = consoleCount;
    document.getElementById('networkCount').textContent = networkCount;
}

// Очистка истории
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

// Показать пустое состояние
function showEmptyState() {
    document.getElementById('historyList').innerHTML = `
    <div class="empty-state">
      <p>История ошибок пуста</p>
    </div>
  `;
}

// Показать сообщение об успехе
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

// Вспомогательные функции
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDetailedTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}