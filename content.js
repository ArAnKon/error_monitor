let currentTabErrors = [];
let errorHistory = [];
let extensionEnabled = true;
let notificationStack = [];
let notificationPosition = "bottom-right";
let filterByStatusCode = false;
let selectedStatusCodes = [];
let darkThemeEnabled = false;
let notificationTimer = 10000;

let userActions = [];
let lastActionTime = Date.now();
const ACTION_TIMEOUT = 5000; //5 секунд (тестово. Потом увеличу)

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

  // Blob с текстом cURL
  const blob = new Blob([curlCommand], { type: 'text/plain;charset=utf-8' });

  // URL для Blob
  const url = URL.createObjectURL(blob);

  // Временную ссылкав для скачивания
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

// Должна ли отображаться ошибка с учетом фильтров
function shouldShowError(errorData) {
  // Если фильтр по статус-кодам выключен - показываем все
  if (!filterByStatusCode) {
    return true;
  }

  // Console errors всегда показываем
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
// отображение шагов воспроизведения в деталях:
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

  // Иконка шагов воспроизведения если они есть
  const hasSteps = errorData.reproductionSteps &&
      errorData.reproductionSteps !== 'Не удалось автоматически определить шаги воспроизведения.';
  const stepsIcon = hasSteps ? ' 📋' : '';

  notification.innerHTML = `
        <h4>
            <span>${title}${statusIndicator}</span>
            <button class="close-btn" title="Закрыть">×</button>
        </h4>
        <p class="error-text" title="${errorData.message}">${displayMessage}</p>
        <div class="timestamp">
            <span>${new Date().toLocaleTimeString()} • ${window.location.hostname}${stepsIcon}</span>
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

  // индикатор таймера, если время не равно 0
  if (notificationTimer > 0) {
    const timerBar = document.createElement('div');
    timerBar.className = 'timer-bar';
    timerBar.style.transition = `width ${notificationTimer}ms linear`;

    notification.appendChild(timerBar);

    // анимаци таймера с небольшой задержкой
    setTimeout(() => {
      timerBar.style.width = '0%';
    }, 50);
  }

  // уведомление на страницу
  document.body.appendChild(notification);

  // стек уведомлений
  notificationStack.push(notification);

  // Обновляет позиции всех уведомлений
  updateNotificationPositions();

  // таймер скрытия, только если notificationTimer > 0
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
    // класс успеха ко всему уведомлению
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

      // Обновляю класс позиционирования
      notification.className = `error-notification ${notification.classList.contains('console-notification') ? 'console-notification' : 'network-notification'} top-right`;
      if (darkThemeEnabled) {
        notification.classList.add("dark-theme");
      }

      // Устанавливаю позицию
      notification.style.top = `${currentTop}px`;
      notification.style.right = '20px';
      notification.style.bottom = 'auto';
      notification.style.left = 'auto';

      // Добавляю обратно на страницу
      document.body.appendChild(notification);

      // Увеличиваю отступ для следующего уведомления
      currentTop += notification.offsetHeight + spacing;
    }
  } else {
    let currentBottom = 20;

    // Идеу с начала, чтобы новые уведомления были снизу
    for (let i = 0; i < notificationStack.length; i++) {
      const notification = notificationStack[i];

      // Обновляю класс позиционирования
      notification.className = `error-notification ${notification.classList.contains('console-notification') ? 'console-notification' : 'network-notification'} bottom-right`;
      if (darkThemeEnabled) {
        notification.classList.add("dark-theme");
      }

      // Устанавливаю позицию
      notification.style.bottom = `${currentBottom}px`;
      notification.style.right = '20px';
      notification.style.top = 'auto';
      notification.style.left = 'auto';

      // Добавляю обратно на страницу
      document.body.appendChild(notification);

      // Увеличиваю отступ для следующего уведомления
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
  // Генерируем шаги воспроизведения
  errorData.reproductionSteps = generateReproductionSteps(errorData);
  errorData.userActions = userActions.slice(-20); // Сохраняем последние 20 действий

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

    // Обновляю позиции существующих уведомлений
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

// Главная функция отслеживания пользовательских действий
function trackUserAction(action) {
  const now = Date.now();

  // Если прошло больше 5 секунд с последнего действия, очищаем историю
  if (now - lastActionTime > ACTION_TIMEOUT) {
    userActions = [];
  }

  userActions.push({
    type: action.type,
    details: action.details,
    timestamp: now,
    url: window.location.href,
    element: action.element || null,
    // Добавляем дополнительную информацию для идентификации
    pageTitle: document.title,
    windowSize: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  });

  // Ограничиваем историю последними 30 действиями (было 20)
  if (userActions.length > 30) {
    userActions = userActions.slice(-30);
  }

  lastActionTime = now;

  // Сохраняем в sessionStorage для доступа из других скриптов
  try {
    sessionStorage.setItem('errorMonitorUserActions', JSON.stringify(userActions.slice(-15)));
  } catch (e) {
    // Игнорируем ошибки sessionStorage
  }
}

// Вспомогательная функция для получения значения инпута
function getInputValue(element) {
  if (!element) return '';

  const tagName = element.tagName.toLowerCase();
  const type = element.type || 'text';

  switch (type) {
    case 'checkbox':
      return element.checked ? 'checked' : 'unchecked';

    case 'radio':
      return element.checked ? `selected: ${element.value || 'on'}` : 'unselected';

    case 'password':
      return element.value ? `***${element.value.length} chars***` : '';

    case 'select-one':
    case 'select-multiple':
      const selectedOptions = Array.from(element.selectedOptions || []);
      return selectedOptions.map(opt => opt.text).join(', ') || element.value;

    case 'file':
      const files = element.files;
      if (files && files.length > 0) {
        return `${files.length} file(s): ${Array.from(files).map(f => f.name).join(', ')}`;
      }
      return 'no file selected';

    case 'range':
      return element.value || '0';

    case 'number':
    case 'tel':
    case 'email':
    case 'url':
    case 'date':
    case 'time':
    case 'datetime-local':
    case 'month':
    case 'week':
      return element.value || '';

    default:
      // Для text, textarea, search и других текстовых полей
      return element.value || '';
  }
}

// Вспомогательная функция для проверки группировки ввода
function shouldGroupWithPreviousInput(element) {
  if (!element || userActions.length === 0) return false;

  const lastAction = userActions[userActions.length - 1];

  // Проверяем, было ли предыдущее действие INPUT на том же элементе
  if (lastAction.type === 'INPUT' || lastAction.type === 'FOCUS') {
    const lastElement = lastAction.element;
    const currentSelector = getEnhancedElementInfo(element).selector;
    const lastSelector = lastElement ? getEnhancedElementInfo(lastElement).selector : null;

    return currentSelector === lastSelector &&
        (Date.now() - lastAction.timestamp) < 1000;
  }

  return false;
}

// Улучшенная функция для получения информации об элементе
function getEnhancedElementInfo(element) {
  if (!element || !element.tagName) {
    return { tag: 'unknown', selector: '' };
  }

  const tag = element.tagName.toLowerCase();
  // Используем element.type для input элементов
  const type = element.type || (tag === 'input' ? 'text' : null);
  const id = element.id || null;
  const name = element.name || null;
  const className = element.className || null;
  const placeholder = element.placeholder || null;
  const value = element.value || element.textContent || null;

  // Получаем улучшенный селектор
  const selector = getEnhancedCssSelector(element);

  // Пытаемся получить текст элемента или его родителя
  let text = null;
  let label = null;

  // Пытаемся найти связанный label
  if (id) {
    const labelElement = document.querySelector(`label[for="${id}"]`);
    if (labelElement) {
      label = labelElement.textContent.trim();
    }
  }

  // Пытаемся найти текст внутри элемента или рядом
  if (element.textContent && element.textContent.trim()) {
    text = element.textContent.trim().substring(0, 100);
  } else {
    // Ищем текст в родительских элементах
    let parent = element.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      if (parent.textContent && parent.textContent.trim()) {
        const parentText = parent.textContent.trim();
        // Исключаем текст самого элемента
        const childText = element.textContent ? element.textContent.trim() : '';
        if (parentText !== childText) {
          text = parentText.substring(0, 100);
          break;
        }
      }
      parent = parent.parentElement;
    }
  }

  // Получаем дополнительные атрибуты
  const attributes = {};
  const attrNames = ['title', 'aria-label', 'data-testid', 'data-qa', 'data-cy', 'data-test', 'role'];

  attrNames.forEach(attr => {
    const attrValue = element.getAttribute(attr);
    if (attrValue) {
      attributes[attr] = attrValue;
    }
  });

  // Определяем видимость и позицию
  const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;

  // Для чекбоксов и радио добавляем специальную информацию
  const isCheckbox = type === 'checkbox';
  const isRadio = type === 'radio';

  if (isCheckbox || isRadio) {
    attributes.checked = element.checked;
    attributes.defaultChecked = element.defaultChecked;
  }

  return {
    tag,
    type,
    id,
    name,
    className,
    placeholder,
    value: value ? String(value).substring(0, 200) : null,
    text,
    label,
    selector,
    attributes,
    position: rect ? {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    } : null,
    isVisible: rect ?
        rect.width > 0 && rect.height > 0 &&
        rect.top >= 0 && rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth : null,
    // Дополнительные поля для чекбоксов/радио
    isCheckbox,
    isRadio,
    checked: isCheckbox || isRadio ? element.checked : null
  };
}
// Улучшенная функция для получения CSS селектора
function getEnhancedCssSelector(element) {
  if (!element || !element.tagName) return '';

  const parts = [];
  let currentElement = element;
  let maxDepth = 6;

  while (currentElement && currentElement !== document.body && maxDepth > 0) {
    let selector = currentElement.tagName.toLowerCase();

    // 1. ID
    if (currentElement.id && /^[a-zA-Z][a-zA-Z0-9_:.-]*$/.test(currentElement.id)) {
      selector += '#' + currentElement.id;
      parts.unshift(selector);
      break;
    }

    // 2. Name атрибут для форм
    const name = currentElement.getAttribute('name');
    if (name && name.trim()) {
      selector += `[name="${name.replace(/"/g, '\\"')}"]`;
      parts.unshift(selector);
      break;
    }

    // 3. Классы
    const classList = [];
    if (currentElement.className && typeof currentElement.className === 'string') {
      const classes = currentElement.className.split(/\s+/).filter(c =>
          c.length > 0 &&
          !c.includes(':') &&
          !/^\d/.test(c)
      );

      // Используем только значимые классы
      const meaningfulClasses = classes.filter(c =>
          c.length < 20 &&
          !c.startsWith('js-') &&
          !c.includes('--') &&
          !/\d{4,}/.test(c) // Исключаем классы с большими числами
      ).slice(0, 2);

      if (meaningfulClasses.length > 0) {
        selector += '.' + meaningfulClasses.join('.');
      }
    }

    // 4. Другие значимые атрибуты
    const attributes = ['placeholder', 'title', 'aria-label', 'data-testid', 'data-qa', 'type', 'role'];
    for (const attr of attributes) {
      const value = currentElement.getAttribute(attr);
      if (value && value.trim()) {
        selector += `[${attr}="${value.replace(/"/g, '\\"')}"]`;
        break;
      }
    }

    // 5. nth-child
    const parent = currentElement.parentNode;
    if (parent && parent.children && parent.children.length > 1) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(currentElement) + 1;

      // Используем nth-child только если нет других  идентификаторов
      if (index > 1 && selector === currentElement.tagName.toLowerCase()) {
        selector += `:nth-child(${index})`;
      }
    }

    // 6. Текст элемента
    if (currentElement.textContent && currentElement.textContent.trim() &&
        currentElement.textContent.trim().length < 50) {
      const text = currentElement.textContent.trim().replace(/\s+/g, ' ');
      selector += `:contains("${text.substring(0, 30)}")`;
    }

    parts.unshift(selector);
    currentElement = currentElement.parentNode;
    maxDepth--;
  }

  const result = parts.join(' > ');

  // Если селектор слишком длинный, упрощаем его
  if (result.length > 150) {
    // Оставляем только первые 3 уровня
    const simplified = parts.slice(-3).join(' > ');
    return simplified || result.substring(0, 150);
  }

  return result;
}

// Инициализация отслеживания событий с улучшенной обработкой
function initUserActionTracking() {
  // Клики - с улучшенным определением элементов
  document.addEventListener('click', (event) => {
    const element = event.target;
    const details = getEnhancedElementInfo(element);

    trackUserAction({
      type: 'CLICK',
      details: {
        x: event.clientX,
        y: event.clientY,
        element: details,
        // Информация о событии
        button: event.button,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey
      },
      element: element
    });
  }, true);

  // Ввод с клавиатуры (формы) - с улучшенной обработкой типов
  document.addEventListener('input', (event) => {
    const element = event.target;

    // Отслеживаем только элементы форм
    if (element.tagName === 'INPUT' ||
        element.tagName === 'TEXTAREA' ||
        element.tagName === 'SELECT') {

      // Получаем значение в зависимости от типа элемента
      const value = getInputValue(element);
      const details = getEnhancedElementInfo(element);

      // Обновляем значение в details
      details.value = value;

      trackUserAction({
        type: 'INPUT',
        details: {
          element: details,
          // Флаг для группировки
          isContinuation: shouldGroupWithPreviousInput(element)
        },
        element: element
      });
    }
  }, true);

  // Изменение состояния для чекбоксов и радио-кнопок
  document.addEventListener('change', (event) => {
    const element = event.target;

    if (element.tagName === 'INPUT') {
      const type = element.type;

      if (type === 'checkbox' || type === 'radio') {
        const details = getEnhancedElementInfo(element);

        // Убедимся, что тип правильно установлен
        details.type = type;
        details.value = element.checked ? 'checked' : 'unchecked';
        details.actualValue = element.value || element.checked.toString();

        trackUserAction({
          type: type === 'checkbox' ? 'CHECKBOX_TOGGLE' : 'RADIO_SELECT',
          details: {
            element: details,
            checked: element.checked,
            value: element.value,
            originalType: type
          },
          element: element
        });
      }
    }

    if (element.tagName === 'SELECT') {
      const details = getEnhancedElementInfo(element);
      const selectedOption = element.options[element.selectedIndex];

      details.value = selectedOption ? selectedOption.text : element.value;
      details.selectedIndex = element.selectedIndex;

      trackUserAction({
        type: 'SELECT_CHANGE',
        details: {
          element: details,
          selectedText: selectedOption ? selectedOption.text : null,
          selectedValue: element.value,
          selectedIndex: element.selectedIndex
        },
        element: element
      });
    }
  }, true);

  // Также обрабатываем клики по чекбоксам и радио
  document.addEventListener('click', (event) => {
    const element = event.target;

    if (element.tagName === 'INPUT') {
      const type = element.type;

      if (type === 'checkbox' || type === 'radio') {
        // Небольшая задержка, чтобы состояние успело обновиться
        setTimeout(() => {
          const details = getEnhancedElementInfo(element);
          details.type = type;
          details.value = element.checked ? 'checked' : 'unchecked';

          trackUserAction({
            type: type === 'checkbox' ? 'CHECKBOX_CLICK' : 'RADIO_CLICK',
            details: {
              element: details,
              checked: element.checked,
              value: element.value,
              x: event.clientX,
              y: event.clientY
            },
            element: element
          });
        }, 10);
      }
    }
  }, true);

  // Отправка форм
  document.addEventListener('submit', (event) => {
    const form = event.target;
    const details = getEnhancedElementInfo(form);

    // Собираем информацию о полях формы
    const formData = {};
    try {
      const elements = form.elements;
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (el.name) {
          const elDetails = getEnhancedElementInfo(el);
          formData[el.name] = {
            type: el.type || el.tagName.toLowerCase(),
            value: getInputValue(el),
            details: elDetails
          };
        }
      }
    } catch (e) {
      // Игнорируем ошибки при сборе данных формы
    }

    trackUserAction({
      type: 'FORM_SUBMIT',
      details: {
        form: details,
        formData: formData,
        method: form.method || 'GET',
        action: form.action || null
      },
      element: form
    });
  }, true);

  // Фокус на элементах
  document.addEventListener('focusin', (event) => {
    const element = event.target;

    if (element.tagName === 'INPUT' ||
        element.tagName === 'TEXTAREA' ||
        element.tagName === 'SELECT') {

      const details = getEnhancedElementInfo(element);

      trackUserAction({
        type: 'FOCUS',
        details: {
          element: details,
          value: getInputValue(element)
        },
        element: element
      });
    }
  }, true);

  // Навигация (изменение hash, pushState)
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    trackUserAction({
      type: 'NAVIGATION',
      details: {
        type: 'pushState',
        url: args[2] || window.location.href,
        state: args[0],
        title: args[1]
      }
    });
    return originalPushState.apply(this, args);
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    trackUserAction({
      type: 'NAVIGATION',
      details: {
        type: 'replaceState',
        url: window.location.href,
        state: args[0],
        title: args[1]
      }
    });
    return originalReplaceState.apply(this, args);
  };

  window.addEventListener('hashchange', () => {
    trackUserAction({
      type: 'NAVIGATION',
      details: {
        type: 'hashchange',
        url: window.location.href,
        hash: window.location.hash
      }
    });
  });

  // AJAX запросы
  if (window.XMLHttpRequest) {
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._errorMonitorRequestInfo = {
        method,
        url,
        async: args.length > 0 ? args[0] : true,
        timestamp: Date.now()
      };
      return originalXHROpen.apply(this, [method, url, ...args]);
    };

    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(...args) {
      if (this._errorMonitorRequestInfo) {
        trackUserAction({
          type: 'XHR_REQUEST',
          details: {
            ...this._errorMonitorRequestInfo,
            body: args[0] || null
          }
        });
      }

      // Отслеживаем завершение запроса
      this.addEventListener('load', function() {
        if (this._errorMonitorRequestInfo) {
          trackUserAction({
            type: 'XHR_RESPONSE',
            details: {
              ...this._errorMonitorRequestInfo,
              status: this.status,
              statusText: this.statusText,
              responseType: this.responseType
            }
          });
        }
      });

      return originalXHRSend.apply(this, args);
    };
  }

  // Fetch запросы
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    let url = args[0];
    let method = 'GET';
    let body = null;

    if (typeof url === 'string') {
      url = url;
    } else if (url && url.url) {
      url = url.url;
      method = url.method || 'GET';
      body = url.body || null;
    }

    if (args[1] && args[1].method) {
      method = args[1].method;
      body = args[1].body || null;
    }

    const requestInfo = {
      method,
      url,
      body: body ? (typeof body === 'string' ? body.substring(0, 500) : '[Binary/FormData]') : null,
      timestamp: Date.now()
    };

    trackUserAction({
      type: 'FETCH_REQUEST',
      details: requestInfo
    });

    // Вызываем оригинальный fetch
    const fetchPromise = originalFetch.apply(this, args);

    // Отслеживаем ответ
    fetchPromise.then(response => {
      trackUserAction({
        type: 'FETCH_RESPONSE',
        details: {
          ...requestInfo,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          redirected: response.redirected
        }
      });
      return response;
    }).catch(error => {
      trackUserAction({
        type: 'FETCH_ERROR',
        details: {
          ...requestInfo,
          error: error.message
        }
      });
      throw error;
    });

    return fetchPromise;
  };

  // Ошибки JavaScript
  window.addEventListener('error', (event) => {
    // Основной обработчик уже есть, но здесь можно добавить дополнительные данные
    trackUserAction({
      type: 'WINDOW_ERROR',
      details: {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error ? event.error.toString() : null
      }
    });
  }, true);

  // Перехватчик для console.error
  const originalConsoleError = console.error;
  console.error = function(...args) {
    trackUserAction({
      type: 'CONSOLE_ERROR_LOG',
      details: {
        arguments: args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg).substring(0, 200) : String(arg)
        )
      }
    });
    return originalConsoleError.apply(console, args);
  };
}

// Функция для получения текста из родительских элементов
function getElementContext(element) {
  if (!element || !element.selector) return null;

  // Пытаемся найти ближайший элемент с текстом
  const selectorParts = element.selector.split(' > ');

  // Ищем родительские элементы с текстом
  for (let i = 0; i < Math.min(selectorParts.length, 3); i++) {
    const part = selectorParts[i];

    // Если это контейнер с классом, пытаемся найти текст
    if (part.includes('.')) {
      try {
        const selector = selectorParts.slice(0, i + 1).join(' > ');
        const parentElement = document.querySelector(selector);
        if (parentElement) {
          // Ищем текстовые узлы внутри родителя
          const textNodes = [];
          const walker = document.createTreeWalker(
              parentElement,
              NodeFilter.SHOW_TEXT,
              null,
              false
          );

          let node;
          while (node = walker.nextNode()) {
            if (node.textContent.trim()) {
              textNodes.push(node.textContent.trim());
            }
          }

          if (textNodes.length > 0) {
            // Берем первый значимый текст
            const text = textNodes[0].substring(0, 50);
            return `"${text}${textNodes[0].length > 50 ? '...' : ''}"`;
          }
        }
      } catch (e) {
        // Игнорируем ошибки
      }
    }
  }

  return null;
}

// Функция для группировки последовательных INPUT событий
function groupInputActions(actions) {
  const grouped = [];
  let currentInputGroup = null;
  let currentCheckboxGroup = null;

  for (const action of actions) {
    // Группируем INPUT события для одного и того же поля
    if (action.type === 'INPUT') {
      const selector = action.details.element?.selector || '';

      if (currentInputGroup &&
          currentInputGroup.selector === selector &&
          action.timestamp - currentInputGroup.lastTimestamp < 1000) {

        // Добавляем в текущую группу
        currentInputGroup.actions.push(action);
        currentInputGroup.lastTimestamp = action.timestamp;
        currentInputGroup.lastValue = action.details.element?.value;

      } else {
        // Сохраняем предыдущую группу
        if (currentInputGroup) {
          grouped.push({
            type: 'INPUT_GROUP',
            timestamp: currentInputGroup.startTimestamp,
            details: currentInputGroup,
            originalActions: currentInputGroup.actions
          });
        }

        // Начинаем новую группу
        currentInputGroup = {
          selector: selector,
          element: action.details.element,
          actions: [action],
          startTimestamp: action.timestamp,
          lastTimestamp: action.timestamp,
          lastValue: action.details.element?.value,
          fieldName: action.details.element?.name ||
              action.details.element?.placeholder ||
              action.details.element?.label ||
              'поле'
        };
      }
      continue;
    }

    // Группируем связанные действия с чекбоксами
    if (action.type === 'CLICK' ||
        action.type === 'CHECKBOX_CLICK' ||
        action.type === 'CHECKBOX_TOGGLE' ||
        action.type === 'FOCUS') {

      const selector = action.details.element?.selector || '';
      const isCheckboxAction = action.type === 'CHECKBOX_CLICK' ||
          action.type === 'CHECKBOX_TOGGLE' ||
          (action.details.element &&
              action.details.element.type === 'checkbox');

      // Если это действие с чекбоксом
      if (isCheckboxAction) {
        // Сохраняем предыдущую INPUT группу если есть
        if (currentInputGroup) {
          grouped.push({
            type: 'INPUT_GROUP',
            timestamp: currentInputGroup.startTimestamp,
            details: currentInputGroup,
            originalActions: currentInputGroup.actions
          });
          currentInputGroup = null;
        }

        // Игнорируем FOCUS и промежуточные события для чекбоксов
        if (action.type === 'FOCUS' ||
            (action.type === 'CLICK' && action.details.element?.type === 'checkbox')) {
          // Пропускаем эти события, они будут обработаны в CHECKBOX_TOGGLE
          continue;
        }
      }
    }

    // Сохраняем предыдущую INPUT группу если есть
    if (currentInputGroup) {
      grouped.push({
        type: 'INPUT_GROUP',
        timestamp: currentInputGroup.startTimestamp,
        details: currentInputGroup,
        originalActions: currentInputGroup.actions
      });
      currentInputGroup = null;
    }

    // Фильтруем ненужные события
    if (action.type === 'FOCUS' ||
        action.type === 'CHECKBOX_CLICK' ||
        action.type === 'RADIO_CLICK' ||
        action.type === 'INPUT' ||
        action.type === 'CONSOLE_ERROR_LOG' ||
        action.type === 'WINDOW_ERROR' ||
        action.type === 'FETCH_RESPONSE' ||
        action.type === 'XHR_RESPONSE' ||
        action.type === 'FETCH_ERROR') {
      // Пропускаем эти события
      continue;
    }

    // Обрабатываем остальные события
    grouped.push(action);
  }

  // Добавляем последнюю группу если есть
  if (currentInputGroup) {
    grouped.push({
      type: 'INPUT_GROUP',
      timestamp: currentInputGroup.startTimestamp,
      details: currentInputGroup,
      originalActions: currentInputGroup.actions
    });
  }

  return grouped;
}

// Функция для генерации шагов воспроизведения
function generateReproductionSteps(errorData) {
  // Берем последние 5-20 действий перед ошибкой
  const relevantActions = userActions.filter(action =>
      errorData.timestamp - action.timestamp <= ACTION_TIMEOUT
  ).slice(-20);

  if (relevantActions.length === 0) {
    return 'Не удалось автоматически определить шаги воспроизведения.';
  }

  // Группируем события
  const groupedActions = groupInputActions(relevantActions);

  const steps = [];
  let stepNumber = 1;

  // Генерируем шаги
  groupedActions.forEach((action, index) => {
    let step = `${stepNumber}. `;

    switch (action.type) {
      case 'INPUT_GROUP':
        const inputGroup = action.details;
        const input = inputGroup.element;

        if (!input) {
          step += 'Ввести текст';
          break;
        }

        let inputDescription = 'Ввести текст';

        // Добавляем идентификатор элемента
        if (input.name && input.name !== '') {
          inputDescription += ` в поле "${input.name}"`;
        } else if (input.placeholder && input.placeholder !== '') {
          inputDescription += ` в поле "${input.placeholder}"`;
        } else if (input.label && input.label !== '') {
          inputDescription += ` в поле "${input.label}"`;
        } else if (input.fieldName && input.fieldName !== '') {
          inputDescription += ` в ${input.fieldName}`;
        }

        // Добавляем финальное значение если есть
        if (input.lastValue && input.lastValue.trim() !== '' &&
            !input.lastValue.includes('***')) {
          const value = input.lastValue.replace(/\s+/g, ' ');
          inputDescription += `: "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`;
        }

        step += inputDescription;
        break;

      case 'CHECKBOX_TOGGLE':
      case 'RADIO_SELECT':
        const toggleEl = action.details.element;
        let toggleDescription = '';

        if (action.type === 'CHECKBOX_TOGGLE') {
          const state = action.details.checked ? 'включить' : 'выключить';
          if (toggleEl && toggleEl.label && toggleEl.label.trim()) {
            toggleDescription = `${state} чекбокс "${toggleEl.label.trim()}"`;
          } else if (toggleEl && toggleEl.name && toggleEl.name.trim()) {
            toggleDescription = `${state} чекбокс "${toggleEl.name.trim()}"`;
          } else {
            toggleDescription = `${state} чекбокс`;
          }
        } else if (action.type === 'RADIO_SELECT') {
          if (toggleEl && toggleEl.label && toggleEl.label.trim()) {
            toggleDescription = `Выбрать радио-кнопку "${toggleEl.label.trim()}"`;
          } else if (toggleEl && toggleEl.name && toggleEl.name.trim()) {
            toggleDescription = `Выбрать радио-кнопку "${toggleEl.name.trim()}"`;
          } else if (toggleEl && toggleEl.value && toggleEl.value.trim()) {
            toggleDescription = `Выбрать опцию "${toggleEl.value.trim()}"`;
          } else {
            toggleDescription = `Выбрать радио-кнопку`;
          }
        }
        step += toggleDescription;
        break;

      case 'SELECT_CHANGE':
        const selectEl = action.details.element;
        let selectDescription = 'Выбрать из списка';

        if (selectEl && selectEl.label && selectEl.label.trim()) {
          selectDescription += ` "${selectEl.label.trim()}"`;
        } else if (selectEl && selectEl.name && selectEl.name.trim()) {
          selectDescription += ` "${selectEl.name.trim()}"`;
        }

        if (action.details.selectedText && action.details.selectedText.trim()) {
          selectDescription += ` значение "${action.details.selectedText.trim()}"`;
        }
        step += selectDescription;
        break;

      case 'CLICK':
        const clickEl = action.details.element;
        let clickDescription = '';

        // Для обычного клика
        if (clickEl && clickEl.text && clickEl.text.trim() !== '') {
          const cleanText = clickEl.text.trim().replace(/\s+/g, ' ');
          clickDescription = `Кликнуть на "${cleanText.substring(0, 60)}${cleanText.length > 60 ? '...' : ''}"`;
        } else if (clickEl && clickEl.label && clickEl.label.trim()) {
          clickDescription = `Кликнуть на "${clickEl.label.trim()}"`;
        } else {
          const context = getElementContext(clickEl);
          if (context) {
            clickDescription = `Кликнуть на ${context}`;
          } else if (clickEl && clickEl.selector) {
            const lastPart = clickEl.selector.split(' > ').pop();
            clickDescription = `Кликнуть на элемент ${lastPart}`;
          } else {
            clickDescription = `Кликнуть в координаты (${action.details.x}, ${action.details.y})`;
          }
        }
        step += clickDescription;
        break;

      case 'FORM_SUBMIT':
        const form = action.details.form;
        step += `Отправить форму`;
        if (form.id) {
          step += ` #${form.id}`;
        } else if (form.action) {
          try {
            const actionUrl = new URL(form.action, window.location.origin);
            step += ` на ${actionUrl.pathname}`;
          } catch (e) {
            step += ` (${form.action})`;
          }
        }
        break;

      case 'NAVIGATION':
        const url = action.details.url;
        try {
          const urlObj = new URL(url, window.location.origin);
          step += `Перейти на ${urlObj.pathname || urlObj.href}`;
        } catch (e) {
          step += `Перейти на ${url}`;
        }
        break;

      case 'XHR_REQUEST':
      case 'FETCH_REQUEST':
        const reqUrl = action.details.url;
        try {
          const urlObj = new URL(reqUrl, window.location.origin);
          step += `Выполнить ${action.details.method} запрос на ${urlObj.pathname}`;
        } catch (e) {
          step += `Выполнить ${action.details.method} запрос на ${reqUrl}`;
        }
        break;

      default:
        // Пропускаем ненужные типы действий
        return; // Не добавляем шаг
    }

    // Не добавляем временную метку
    steps.push(step);
    stepNumber++;
  });

  // Добавляем финальный шаг - саму ошибку
  const errorMessage = errorData.message.length > 80
      ? errorData.message.substring(0, 80) + '...'
      : errorData.message;
  steps.push(`${stepNumber}. Ошибка: ${errorMessage}`);

  return steps.join('\n');
}

initUserActionTracking();