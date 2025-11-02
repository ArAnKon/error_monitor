let currentTabErrors = [];
let errorHistory = [];
let extensionEnabled = true;
let notificationStack = []; // Массив для отслеживания уведомлений
let notificationPosition = "bottom-right"; // Положение уведомлений по умолчанию

// Загрузка настроек при инициализации
chrome.storage.local.get(["extensionEnabled", "errorHistory", "notificationPosition"], (result) => {
  extensionEnabled = result.extensionEnabled !== false;
  if (result.errorHistory) {
    errorHistory = result.errorHistory;
  }
  if (result.notificationPosition) {
    notificationPosition = result.notificationPosition;
  }
});

function showNotification(errorData) {
  if (!extensionEnabled) return;

  const notification = document.createElement("div");
  notification.className = `error-notification ${errorData.type.toLowerCase()}-notification`;

  // Устанавливаем позицию уведомления
  if (notificationPosition === "top-right") {
    notification.style.top = '20px';
    notification.style.bottom = 'auto';
  } else {
    notification.style.bottom = '20px';
    notification.style.top = 'auto';
  }

  let title = errorData.type === "CONSOLE_ERROR" ? "Console Error" : "Network Error";
  if (errorData.details?.statusCode > 0) {
    title += ` (${errorData.details.statusCode})`;
  }

  const isNetworkError = errorData.type === "NETWORK_ERROR";

  // Обрезаем длинное сообщение для уведомления
  const maxMessageLength = 150;
  let displayMessage = errorData.message;
  if (displayMessage.length > maxMessageLength) {
    displayMessage = displayMessage.substring(0, maxMessageLength) + '...';
  }

  notification.innerHTML = `
        <h4>
            ${title}
            <button class="close-btn">×</button>
        </h4>
        <p class="error-text" title="${errorData.message}">${displayMessage}</p>
        <div class="timestamp">
            <span>${new Date().toLocaleTimeString()} • ${window.location.hostname}</span>
            ${isNetworkError ? '<span class="copy-hint">Click to copy curl (bash)</span>' : ""}
        </div>
    `;

  const closeBtn = notification.querySelector('.close-btn');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeNotification(notification);
  });

  if (isNetworkError) {
    notification.addEventListener("click", (e) => {
      if (!e.target.classList.contains("close-btn")) {
        copyCurl(errorData);
        notification.classList.add("copy-success");
        setTimeout(() => notification.classList.remove("copy-success"), 2000);
      }
    });
  }

  document.body.appendChild(notification);
  notificationStack.push(notification);
  updateNotificationPositions();

  // Автоматическое удаление через 10 секунд
  setTimeout(() => {
    removeNotification(notification);
  }, 10000);
}

// Функция для обновления позиций всех уведомлений
function updateNotificationPositions() {
  const spacing = 10;

  if (notificationPosition === "top-right") {
    // Позиционирование сверху справа
    let currentTop = 20;

    notificationStack.forEach((notification) => {
      notification.style.top = `${currentTop}px`;
      notification.style.bottom = 'auto';
      currentTop += notification.offsetHeight + spacing;
    });
  } else {
    // Позиционирование снизу справа (по умолчанию)
    let currentBottom = 20;

    notificationStack.forEach((notification) => {
      notification.style.bottom = `${currentBottom}px`;
      notification.style.top = 'auto';
      currentBottom += notification.offsetHeight + spacing;
    });
  }
}

// Функция для удаления уведомления
function removeNotification(notification) {
  const index = notificationStack.indexOf(notification);
  if (index > -1) {
    notificationStack.splice(index, 1);

    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';

    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
      updateNotificationPositions();
    }, 300);
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Функция copyCurl - копирует CURL команду для bash
function copyCurl(errorData) {
  if (!errorData.details || !errorData.details.url) return;

  const curlCommand = generateCurlCommand(errorData);

  if (navigator.clipboard) {
    navigator.clipboard.writeText(curlCommand).then(() => {
      console.log('cURL команда скопирована в буфер обмена');
    }).catch(err => {
      console.error('Ошибка копирования cURL:', err);
    });
  } else {
    // Fallback для старых браузеров
    const textArea = document.createElement("textarea");
    textArea.value = curlCommand;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
      console.log('cURL команда скопирована в буфер обмена (fallback)');
    } catch (err) {
      console.error('Ошибка копирования cURL (fallback):', err);
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

// Функция генерации CURL команды для bash
function generateCurlCommand(error) {
  if (!error.details || !error.details.url) return '# cURL не доступен для этой ошибки';

  const url = error.details.url;
  const method = error.details.method || 'GET';
  const origin = error.tabUrl ? new URL(error.tabUrl).origin : window.location.origin;

  // Генерация полной cURL команды как в истории
  return `curl -X ${method} "${url}" \\\n  -H "Accept: */*" \\\n  -H "Origin: ${origin}" \\\n  -H "Referer: ${error.tabUrl || window.location.href}" \\\n  --compressed \\\n  --insecure`;
}

function handleError(errorData) {
  currentTabErrors.push(errorData);
  errorHistory.push(errorData);

  const toSave = errorHistory.slice(-1000).map(error => ({
    ...error,
    timestamp: error.timestamp instanceof Date ? error.timestamp.toISOString() : error.timestamp
  }));

  chrome.storage.local.set({ errorHistory: toSave });
  showNotification(errorData);
}

// Обработчик сообщений от расширения
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === "EXTENSION_TOGGLE") {
    extensionEnabled = request.enabled;
    if (!extensionEnabled) {
      // Удаляем все уведомления при отключении расширения
      notificationStack.forEach(notification => {
        if (notification.parentElement) {
          notification.remove();
        }
      });
      notificationStack = [];
    }
    return;
  }

  if (request.type === "NOTIFICATION_POSITION_UPDATE") {
    notificationPosition = request.position;
    // Пересоздаем все уведомления с новой позицией
    notificationStack.forEach(notification => {
      if (notification.parentElement) {
        notification.remove();
      }
    });
    notificationStack = [];
    // Показываем текущие ошибки с новой позицией
    currentTabErrors.forEach(error => {
      showNotification(error);
    });
    return;
  }

  if (!extensionEnabled) return;

  if (request.type === "NETWORK_ERROR") {
    const errorObj = {
      type: "NETWORK_ERROR",
      message: request.error.statusCode >= 400
          ? `HTTP ${request.error.statusCode}: ${request.error.url}`
          : `Network Error: ${request.error.url}`,
      timestamp: new Date(),
      details: request.error,
      id: generateId(),
      tabUrl: window.location.href,
      domain: window.location.hostname
    };

    handleError(errorObj);
  }
});

// Перехват console.error
const originalError = console.error;
console.error = function (...args) {
  originalError.apply(console, args);

  if (!extensionEnabled) return;

  const errorData = {
    type: "CONSOLE_ERROR",
    message: args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : String(arg)).join(" "),
    timestamp: new Date(),
    id: generateId(),
    tabUrl: window.location.href,
    domain: window.location.hostname
  };

  handleError(errorData);
};

// Перехват глобальных ошибок
window.addEventListener("error", (event) => {
  if (!extensionEnabled) return;

  const errorData = {
    type: "CONSOLE_ERROR",
    message: event.message,
    timestamp: new Date(),
    id: generateId(),
    tabUrl: window.location.href,
    domain: window.location.hostname
  };

  handleError(errorData);
});

// Перехват необработанных Promise rejection
window.addEventListener("unhandledrejection", (event) => {
  if (!extensionEnabled) return;

  const errorData = {
    type: "CONSOLE_ERROR",
    message: `Promise Rejection: ${event.reason}`,
    timestamp: new Date(),
    id: generateId(),
    tabUrl: window.location.href,
    domain: window.location.hostname
  };

  handleError(errorData);
});

// Глобальный объект для доступа из popup
window.errorMonitor = {
  getCurrentErrors: () => currentTabErrors,
  getErrorHistory: () => errorHistory,
  clearCurrentErrors: () => {
    currentTabErrors = [];
    // Удаляем все уведомления при очистке
    notificationStack.forEach(notification => {
      if (notification.parentElement) {
        notification.remove();
      }
    });
    notificationStack = [];
  },
  clearHistory: () => {
    errorHistory = [];
    chrome.storage.local.remove('errorHistory');
  },
  getExtensionState: () => extensionEnabled
};
