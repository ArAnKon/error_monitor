let currentTabErrors = [];
let errorHistory = JSON.parse(localStorage.getItem('errorHistory') || '[]');
const MAX_HISTORY_SIZE = 1000;

// Сохранение истории в localStorage
function saveHistory() {
  const historyToSave = errorHistory.slice(-MAX_HISTORY_SIZE);
  localStorage.setItem('errorHistory', JSON.stringify(historyToSave));
}

// Загрузка историю при старте
function loadHistory() {
  try {
    const saved = localStorage.getItem('errorHistory');
    if (saved) {
      errorHistory = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error loading history:', e);
    errorHistory = [];
  }
}

// Инициализация историю
loadHistory();

// Слушаем сообщения от background script
chrome.runtime.onMessage.addListener((request) => {
  const networkErrorData = {
    type: `${request.type}`,
    message: `Ошибка ${request.type}: ${request.error.error} - ${request.error.url}`,
    timestamp: new Date(request.error.timestamp || Date.now()),
    details: request.error,
    id: generateId()
  };

  currentTabErrors.push(networkErrorData);
  errorHistory.push({
    ...networkErrorData,
    tabUrl: window.location.href,
    domain: window.location.hostname
  });
  saveHistory();
  showErrorPopup(networkErrorData);
});

// Уникальный ID для ошибки
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Функция показа попапа ошибки
function showErrorPopup(errorData) {
  const notification = document.createElement("div");
  notification.className = `error-notification ${errorData.type.toLowerCase()}-notification`;

  const typeNames = {
    CONSOLE_ERROR: "Console Error",
    NETWORK_ERROR: "Network Error",
    SERVER_ERROR: "Network Error",
  };

  const isRequestError =
      errorData.type === "NETWORK_ERROR" || errorData.type === "SERVER_ERROR";

  notification.innerHTML = `
    <h4>
      ${typeNames[errorData.type] || errorData.type}
      <button class="close-btn" onclick="event.stopPropagation(); this.parentElement.parentElement.remove(); updateNotificationsPosition();">×</button>
    </h4>
    <p class="error-text">${escapeHtml(errorData.message)}</p>
    <div class="timestamp">
      <span>${new Date().toLocaleTimeString()} • ${window.location.hostname}</span>
      ${isRequestError ? '<span class="copy-hint">Click to copy curl</span>' : ""}
    </div>
  `;

  // Обработчик клика для копирования cURL
  if (isRequestError) {
    notification.addEventListener("click", (e) => {
      if (!e.target.classList.contains("close-btn")) {
        copyCurlCommand(errorData);

        notification.classList.add("copy-success");

        // Показываем тултип
        const tooltip = document.createElement("div");
        tooltip.className = "copy-tooltip";
        tooltip.textContent = "cURL скопирован в буфер обмена!";
        notification.appendChild(tooltip);

        setTimeout(() => {
          notification.classList.remove("copy-success");
          if (tooltip.parentElement) {
            tooltip.remove();
          }
        }, 2000);
      }
    });
  }

  document.body.appendChild(notification);

  // Обновляем позиции всех уведомлений
  updateNotificationsPosition();

  // Авто-скрытие
  setTimeout(() => {
    if (notification.parentElement) {
      notification.classList.add("fade-out");
      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
          updateNotificationsPosition();
        }
      }, 300);
    }
  }, 8000);
}

// Функция для обновления позиций всех уведомлений
function updateNotificationsPosition() {
  const notifications = document.querySelectorAll('.error-notification');
  const bottomMargin = 20; // Отступ от нижнего края
  const notificationHeight = 120; // Примерная высота одного уведомления
  const gap = 10; // Расстояние между уведомлениями

  notifications.forEach((notification, index) => {
    const bottomPosition = bottomMargin + (notificationHeight + gap) * index;
    notification.style.bottom = `${bottomPosition}px`;
    notification.style.right = '20px';
  });
}

// Генерация cURL команды
function generateCurlCommand(errorData) {
  let url = "";
  let method = "GET";

  if (errorData.details) {
    url = errorData.details.url;
    method = errorData.details.method || "GET";
  } else {
    const urlMatch = errorData.message.match(/(https?:\/\/[^\s]+)/);
    if (!urlMatch) return null;
    url = urlMatch[1];
  }

  return `curl -X ${method} '${url}' \\
  -H 'Accept: */*' \\
  -H 'Accept-Language: en-US,en;q=0.9' \\
  -H 'Connection: keep-alive' \\
  -H 'Origin: ${window.location.origin}' \\
  -H 'Referer: ${window.location.href}' \\
  -H 'Sec-Fetch-Dest: empty' \\
  -H 'Sec-Fetch-Mode: cors' \\
  -H 'Sec-Fetch-Site: same-origin' \\
  -H 'User-Agent: ${navigator.userAgent}' \\
  --compressed \\
  --insecure \\
  --verbose`;
}

// Копирование в буфер обмена
function copyCurlCommand(errorData) {
  const curlCommand = generateCurlCommand(errorData);
  if (!curlCommand) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(curlCommand)
        .then(() => {
          console.log("cURL скопирован в буфер обмена!");
        })
        .catch((err) => {
          // Если современный API не работает, используем fallback
          console.warn("Modern clipboard API failed, using fallback:", err);
          fallbackCopyToClipboard(curlCommand);
        });
  } else {
    // fallback если API недоступен
    fallbackCopyToClipboard(curlCommand);
  }
}

// Fallback метод копирования
function fallbackCopyToClipboard(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-999999px";
  textArea.style.top = "-999999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    if (successful) {
      console.log("cURL скопирован в буфер обмена (fallback method)!");
    } else {
      console.error("Fallback copy failed");
      showCopyError(text);
    }
  } catch (err) {
    console.error("Fallback copy error:", err);
    showCopyError(text);
  }

  document.body.removeChild(textArea);
}

// Показываем ошибку копирования
function showCopyError(text) {
  const errorMsg = document.createElement("div");
  errorMsg.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #ff4444;
    color: white;
    padding: 10px;
    border-radius: 5px;
    z-index: 100000;
  `;
  errorMsg.textContent = "Не удалось скопировать. Текст показан в консоли.";
  document.body.appendChild(errorMsg);

  console.log("cURL command for manual copy:", text);

  setTimeout(() => {
    if (errorMsg.parentElement) {
      errorMsg.remove();
    }
  }, 3000);
}

// Экранирование HTML
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Перехватчик ошибок консоли
const originalConsoleError = console.error;
console.error = function (...args) {
  originalConsoleError.apply(console, args);
  const errorData = {
    type: "CONSOLE_ERROR",
    message: args
        .map((arg) =>
            typeof arg === "object" ? JSON.stringify(arg) : String(arg),
        )
        .join(" "),
    timestamp: new Date(),
    id: generateId()
  };
  currentTabErrors.push(errorData);
  errorHistory.push({
    ...errorData,
    tabUrl: window.location.href,
    domain: window.location.hostname
  });
  saveHistory();
  showErrorPopup(errorData);
};

// Перехватчик JavaScript ошибок
window.addEventListener("error", (event) => {
  const errorData = {
    type: "CONSOLE_ERROR",
    message: `${event.message} (${event.filename}:${event.lineno}:${event.colno})`,
    timestamp: new Date(),
    id: generateId()
  };
  currentTabErrors.push(errorData);
  errorHistory.push({
    ...errorData,
    tabUrl: window.location.href,
    domain: window.location.hostname
  });
  saveHistory();
  showErrorPopup(errorData);
  return false;
});

// Очистка уведомлений
window.addEventListener("beforeunload", () => {
  document.querySelectorAll(".error-notification").forEach((el) => el.remove());
});

// Экспорт функций  для popup
window.errorMonitor = {
  getCurrentErrors: () => currentTabErrors,
  getErrorHistory: () => errorHistory,
  clearCurrentErrors: () => {
    currentTabErrors = [];
    document.querySelectorAll(".error-notification").forEach((el) => el.remove());
  },
  clearHistory: () => {
    errorHistory = [];
    localStorage.removeItem('errorHistory');
  }
};