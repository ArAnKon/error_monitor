let currentTabErrors = [];
let errorHistory = [];
let extensionEnabled = true;
let notificationStack = [];
let notificationPosition = "bottom-right";
let filterByStatusCode = false;
let selectedStatusCodes = [];
let darkThemeEnabled = false;
let notificationTimer = 10000;

// Загрузка настроек из хранилища
chrome.storage.local.get([
  "extensionEnabled",
  "errorHistory",
  "notificationPosition",
  "filterByStatusCode",
  "notificationTimer",
  "selectedStatusCodes",
  "darkThemeEnabled"
], (result) => {
  extensionEnabled = result.extensionEnabled !== false;
  if (result.errorHistory) {
    errorHistory = result.errorHistory;
  }
  if (result.notificationPosition) {
    notificationPosition = result.notificationPosition;
  }
  if (result.notificationTimer) {
    notificationTimer = parseInt(result.notificationTimer);
  }
  if (result.filterByStatusCode) {
    filterByStatusCode = result.filterByStatusCode;
  }
  if (result.selectedStatusCodes) {
    selectedStatusCodes = result.selectedStatusCodes;
  }
  if (result.darkThemeEnabled) {
    darkThemeEnabled = result.darkThemeEnabled;
    updateBodyTheme();
  }
});

// Функция для применения темы
function updateBodyTheme() {
  if (darkThemeEnabled) {
    document.body.classList.add("dark-theme");
  } else {
    document.body.classList.remove("dark-theme");
  }
}

// Функция для скачивания cURL команды как файла
function downloadCurlCommand(errorData) {
  if (!errorData.details || !errorData.details.url) return;

  const curlCommand = generateCurlCommand(errorData);

  // Создаем Blob с текстом cURL
  const blob = new Blob([curlCommand], { type: 'text/plain;charset=utf-8' });

  // Создаем URL для Blob
  const url = URL.createObjectURL(blob);

  // Создаем временную ссылку для скачивания
  const link = document.createElement('a');
  link.href = url;

  // Генерируем имя файла
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const domain = errorData.domain || 'unknown';
  link.download = `curl-${domain}-${timestamp}.txt`;

  // Добавляем на страницу и кликаем
  document.body.appendChild(link);
  link.click();

  // Убираем ссылку
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Функция проверки должна ли отображаться ошибка с учетом фильтров
function shouldShowError(errorData) {
  // Если фильтр по статус-кодам выключен - показываем все
  if (!filterByStatusCode) {
    return true;
  }

  // Console errors всегда показываем (если не добавим фильтрацию для них позже)
  if (errorData.type === "CONSOLE_ERROR") {
    return true;
  }

  // Для Network errors проверяем статус-код
  if (errorData.type === "NETWORK_ERROR") {
    const statusCode = errorData.details?.statusCode;
    const statusCodeStr = statusCode?.toString() || "0";

    // Проверяем, включен ли статус-код в выбранные фильтры
    const isSelected = selectedStatusCodes.includes(statusCodeStr);

    // Дополнительная проверка: если статус-код undefined или 0,
    // но в фильтрах есть "0" (Network Errors без статус-кода), то показываем
    if ((statusCode === undefined || statusCode === 0) && selectedStatusCodes.includes("0")) {
      return true;
    }

    // Возвращаем true только если статус-код выбран в фильтрах
    return isSelected;
  }

  return true;
}

// Функция для отображения уведомления
function showNotification(errorData) {
  if (!extensionEnabled) return;

  // Проверка фильтрации по статус-кодам
  if (!shouldShowError(errorData)) {
    return;
  }

  const notification = document.createElement("div");
  notification.className = `error-notification ${errorData.type.toLowerCase()}-notification`;

  // Добавляем класс для позиционирования
  notification.classList.add(notificationPosition === "top-right" ? "top-right" : "bottom-right");

  // Применить тему к уведомлениям
  if (darkThemeEnabled) {
    notification.classList.add("dark-theme");
  }

  let title = errorData.type === "CONSOLE_ERROR" ? "Console Error" : "Network Error";

  // Индикатор статуса для сетевых ошибок
  let statusIndicator = '';
  if (errorData.type === "NETWORK_ERROR" && errorData.details?.statusCode !== undefined) {
    const statusCode = errorData.details.statusCode;
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

    if (statusClass) {
      statusIndicator = `<span class="status-indicator ${statusClass}">${statusText}</span>`;
    }
  }

  const isNetworkError = errorData.type === "NETWORK_ERROR";

  const maxMessageLength = 150;
  let displayMessage = errorData.message;
  if (displayMessage.length > maxMessageLength) {
    displayMessage = displayMessage.substring(0, maxMessageLength) + '...';
  }

  notification.innerHTML = `
        <h4>
            <span>${title}${statusIndicator}</span>
            <button class="close-btn" title="Закрыть">×</button>
        </h4>
        <p class="error-text" title="${errorData.message}">${displayMessage}</p>
        <div class="timestamp">
            <span>${new Date().toLocaleTimeString()} • ${window.location.hostname}</span>
            <div class="notification-actions">
                ${isNetworkError ? '<button class="copy-curl-btn" title="Скопировать cURL">📋 cURL</button>' : ''}
                <button class="screenshot-btn" title="Сделать скриншот">📸 Скриншот</button>
                <button class="details-btn" title="Показать детали">🔍 Детали</button>
            </div>
        </div>
    `;

  const closeBtn = notification.querySelector('.close-btn');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeNotification(notification);
  });

  // Обработчик для кнопки деталей
  const detailsBtn = notification.querySelector('.details-btn');
  detailsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openErrorDetails(errorData);
    removeNotification(notification);
  });

  // Обработчик для кнопки cURL (только для сетевых ошибок)
  if (isNetworkError) {
    const copyCurlBtn = notification.querySelector('.copy-curl-btn');
    copyCurlBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      // Сначала копируем в буфер обмена
      await copyCurl(errorData);

      // Добавляем класс успеха ко всему уведомлению
      notification.classList.add("copy-success");

      // Затем скачиваем как файл
      setTimeout(() => {
        downloadCurlCommand(errorData);
      }, 500);

      // Убираем класс через 2 секунды
      setTimeout(() => {
        notification.classList.remove("copy-success");
      }, 2000);
    });
  }

  // Обработчик для кнопки скриншота
  const screenshotBtn = notification.querySelector('.screenshot-btn');
  screenshotBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    captureScreenshotForError(errorData, notification);
  });

  // Добавляем индикатор таймера, если время не равно 0
  if (notificationTimer > 0) {
    const timerBar = document.createElement('div');
    timerBar.className = 'timer-bar';
    timerBar.style.transition = `width ${notificationTimer}ms linear`;

    notification.appendChild(timerBar);

    // Запускаем анимацию таймера с небольшой задержкой
    setTimeout(() => {
      timerBar.style.width = '0%';
    }, 50);
  }

  // Добавляем уведомление на страницу
  document.body.appendChild(notification);

  // Добавляем в стек уведомлений
  notificationStack.push(notification);

  // Обновляем позиции всех уведомлений
  updateNotificationPositions();

  // Устанавливаем таймер скрытия, только если notificationTimer > 0
  if (notificationTimer > 0) {
    setTimeout(() => {
      removeNotification(notification);
    }, notificationTimer);
  }
}

// Функция для создания скриншота для ошибки
async function captureScreenshotForError(errorData, notification) {
  try {
    const screenshotBtn = notification.querySelector('.screenshot-btn');
    const originalText = screenshotBtn.textContent;
    screenshotBtn.textContent = '📸 Создание...';
    screenshotBtn.disabled = true;

    // Запрашиваем скриншот через background script
    const screenshotDataUrl = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
          { type: "CAPTURE_SCREENSHOT" },
          (response) => {
            resolve(response?.screenshot || null);
          }
      );
    });

    if (!screenshotDataUrl) {
      throw new Error('Не удалось создать скриншот');
    }

    const storageHistory = await new Promise(resolve => {
      chrome.storage.local.get(['errorHistory'], (result) => {
        resolve(result.errorHistory || []);
      });
    });

    const updatedHistory = storageHistory.map(error => {
      if (error.id === errorData.id) {
        return {
          ...error,
          screenshot: screenshotDataUrl,
          hasScreenshot: true,
          screenshotTimestamp: new Date().toISOString()
        };
      }
      return error;
    });

    await new Promise(resolve => {
      chrome.storage.local.set({ errorHistory: updatedHistory }, resolve);
    });

    const errorIndex = currentTabErrors.findIndex(error => error.id === errorData.id);
    if (errorIndex > -1) {
      currentTabErrors[errorIndex] = {
        ...currentTabErrors[errorIndex],
        screenshot: screenshotDataUrl,
        hasScreenshot: true,
        screenshotTimestamp: new Date().toISOString()
      };
    }

    screenshotBtn.textContent = '📸 Успешно!';
    // Добавляем класс успеха ко всему уведомлению
    notification.classList.add("copy-success");

    // Автоматическое скачивание скриншота
    await downloadScreenshot(screenshotDataUrl, `error-${errorData.id}`);

    setTimeout(() => {
      screenshotBtn.textContent = originalText;
      screenshotBtn.disabled = false;
      notification.classList.remove("copy-success");
    }, 2000);

  } catch (error) {
    const screenshotBtn = notification.querySelector('.screenshot-btn');
    screenshotBtn.textContent = '📸 Ошибка!';
    setTimeout(() => {
      screenshotBtn.textContent = '📸 Скриншот';
      screenshotBtn.disabled = false;
    }, 2000);
  }
}

// Функция для скачивания скриншота
function downloadScreenshot(dataUrl, prefix) {
  return new Promise((resolve) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `screenshot-${prefix}-${timestamp}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    resolve();
  });
}

// Функция для открытия деталей ошибки в истории
function openErrorDetails(errorData) {
  chrome.storage.local.set({
    errorToShowInHistory: errorData.id,
    openHistoryOnLoad: true
  }, () => {
    chrome.runtime.sendMessage({
      type: "OPEN_HISTORY_WITH_ERROR",
      errorId: errorData.id
    });
  });
}

// Обновление позиций всех уведомлений
function updateNotificationPositions() {
  const spacing = 10;

  // Сначала удаляем все уведомления со страницы
  notificationStack.forEach(notification => {
    if (notification.parentElement) {
      notification.remove();
    }
  });

  // Затем добавляем их обратно в правильном порядке
  if (notificationPosition === "top-right") {
    let currentTop = 20;

    // Идем с конца, чтобы новые уведомления были сверху
    for (let i = notificationStack.length - 1; i >= 0; i--) {
      const notification = notificationStack[i];

      // Обновляем класс позиционирования
      notification.className = `error-notification ${notification.classList.contains('console-notification') ? 'console-notification' : 'network-notification'} top-right`;
      if (darkThemeEnabled) {
        notification.classList.add("dark-theme");
      }

      // Устанавливаем позицию
      notification.style.top = `${currentTop}px`;
      notification.style.right = '20px';
      notification.style.bottom = 'auto';
      notification.style.left = 'auto';

      // Добавляем обратно на страницу
      document.body.appendChild(notification);

      // Увеличиваем отступ для следующего уведомления
      currentTop += notification.offsetHeight + spacing;
    }
  } else {
    let currentBottom = 20;

    // Идем с начала, чтобы новые уведомления были снизу
    for (let i = 0; i < notificationStack.length; i++) {
      const notification = notificationStack[i];

      // Обновляем класс позиционирования
      notification.className = `error-notification ${notification.classList.contains('console-notification') ? 'console-notification' : 'network-notification'} bottom-right`;
      if (darkThemeEnabled) {
        notification.classList.add("dark-theme");
      }

      // Устанавливаем позицию
      notification.style.bottom = `${currentBottom}px`;
      notification.style.right = '20px';
      notification.style.top = 'auto';
      notification.style.left = 'auto';

      // Добавляем обратно на страницу
      document.body.appendChild(notification);

      // Увеличиваем отступ для следующего уведомления
      currentBottom += notification.offsetHeight + spacing;
    }
  }
}

// Удаление уведомления
function removeNotification(notification) {
  const index = notificationStack.indexOf(notification);
  if (index > -1) {
    // Добавляем класс для анимации скрытия
    notification.classList.add('fade-out');

    // Удаляем из стека
    notificationStack.splice(index, 1);

    // Ждем завершения анимации и удаляем элемент
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
      // Обновляем позиции оставшихся уведомлений
      updateNotificationPositions();
    }, 300);
  }
}

// Генерация ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Копирование cURL в буфер обмена
function copyCurl(errorData) {
  if (!errorData.details || !errorData.details.url) return;
  const curlCommand = generateCurlCommand(errorData);
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(curlCommand).then(() => {
      console.log('cURL команда скопирована в буфер обмена');
    }).catch(err => {
      console.error('Ошибка копирования cURL:', err);
    });
  } else {
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
    return Promise.resolve();
  }
}

// Генерация cURL команды
function generateCurlCommand(error) {
  if (!error.details || !error.details.url) return '# cURL не доступен для этой ошибки';
  const url = error.details.url;
  const method = error.details.method || 'GET';
  const origin = error.tabUrl ? new URL(error.tabUrl).origin : window.location.origin;
  return `curl -X ${method} "${url}" \\\n  -H "Accept: */*" \\\n  -H "Origin: ${origin}" \\\n  -H "Referer: ${error.tabUrl || window.location.href}" \\\n  --compressed \\\n  --insecure`;
}

// Обработка ошибки
function handleError(errorData) {
  currentTabErrors.push(errorData);
  errorHistory.push(errorData);
  const toSave = errorHistory.slice(-1000).map(error => ({
    ...error,
    timestamp: error.timestamp instanceof Date ? error.timestamp.toISOString() : error.timestamp
  }));
  chrome.storage.local.set({ errorHistory: toSave });

  // Показываем уведомление только если оно проходит фильтрацию
  if (shouldShowError(errorData)) {
    showNotification(errorData);
  }
}

// Обработчик сообщений от расширения
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXTENSION_TOGGLE") {
    extensionEnabled = request.enabled;
    if (!extensionEnabled) {
      notificationStack.forEach(notification => {
        if (notification.parentElement) {
          notification.remove();
        }
      });
      notificationStack = [];
    }
    return;
  }

  if (request.type === "NOTIFICATION_SETTINGS_UPDATE") {
    notificationPosition = request.position;
    if (request.timer !== undefined) {
      notificationTimer = parseInt(request.timer);
    }

    // Обновляем позиции существующих уведомлений
    updateNotificationPositions();
    return;
  }

  if (request.type === "STATUS_CODE_FILTER_UPDATE") {
    filterByStatusCode = request.filterEnabled;
    selectedStatusCodes = request.selectedStatusCodes || [];

    // Полностью очищаем текущие уведомления
    notificationStack.forEach(notification => {
      if (notification.parentElement) {
        notification.remove();
      }
    });
    notificationStack = [];

    // Пересоздаем только те уведомления, которые соответствуют новым фильтрам
    currentTabErrors.forEach(error => {
      if (shouldShowError(error)) {
        showNotification(error);
      }
    });
    return;
  }

  if (request.type === "THEME_UPDATE") {
    darkThemeEnabled = request.darkThemeEnabled;
    updateBodyTheme();

    // Обновляем тему у существующих уведомлений
    notificationStack.forEach(notification => {
      if (darkThemeEnabled) {
        notification.classList.add("dark-theme");
      } else {
        notification.classList.remove("dark-theme");
      }
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

// Перехват ошибок window
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

// Перехват необработанных промисов
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