let currentErrors = [];
let errorHistory = [];
let extensionEnabled = true;

document.addEventListener('DOMContentLoaded', () => {
  loadExtensionState();
  loadNotificationSettings();
  loadStatusCodeSettings();
  setupEventListeners();
  updateStats();
});

function setupEventListeners() {
  document.getElementById("toggleExtension").addEventListener("change", toggleExtension);
  document.getElementById("clearAll").addEventListener("click", clearCurrentErrors);
  document.getElementById("testError").addEventListener("click", testConsoleError);
  document.getElementById("testNetwork").addEventListener("click", testNetworkError);
  document.getElementById("captureScreenshot").addEventListener("click", captureScreenshot);
  document.getElementById("showHistory").addEventListener("click", showHistory);
  document.getElementById("exportHistory").addEventListener("click", exportHistory);
  document.getElementById("clearHistory").addEventListener("click", clearHistory);

  // Обработчики для новых настроек
  document.getElementById("notificationPosition").addEventListener("change", saveNotificationSettings);
  document.getElementById("filterByStatusCode").addEventListener("change", toggleStatusCodeFilter);

  // Обработчики для чекбоксов статус-кодов
  document.querySelectorAll('.status-code-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', saveStatusCodeSettings);
  });
}

function loadExtensionState() {
  chrome.storage.local.get(["extensionEnabled"], (result) => {
    extensionEnabled = result.extensionEnabled !== false;
    document.getElementById("toggleExtension").checked = extensionEnabled;
    updateUIState(extensionEnabled);
  });
}

// Загрузка настроек положения уведомлений
function loadNotificationSettings() {
  chrome.storage.local.get(["notificationPosition"], (result) => {
    const position = result.notificationPosition || "bottom-right";
    document.getElementById("notificationPosition").value = position;
  });
}

// Загрузка настроек фильтрации по статус-кодам
function loadStatusCodeSettings() {
  chrome.storage.local.get(["filterByStatusCode", "selectedStatusCodes"], (result) => {
    const filterEnabled = result.filterByStatusCode || false;
    const selectedCodes = result.selectedStatusCodes || ["400", "404", "500", "0"];

    document.getElementById("filterByStatusCode").checked = filterEnabled;

    // Показываем/скрываем секцию с выбором статус-кодов
    const statusCodesSection = document.getElementById("statusCodesSection");
    statusCodesSection.style.display = filterEnabled ? "block" : "none";

    // Устанавливаем выбранные статус-коды
    document.querySelectorAll('.status-code-checkbox').forEach(checkbox => {
      checkbox.checked = selectedCodes.includes(checkbox.value);
    });
  });
}

// Сохранение настроек положения уведомлений
function saveNotificationSettings() {
  const position = document.getElementById("notificationPosition").value;
  chrome.storage.local.set({ notificationPosition: position }, () => {
    // Обновляем положение уведомлений на всех вкладках
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "NOTIFICATION_POSITION_UPDATE",
            position: position
          }).catch(() => {});
        }
      });
    });
  });
}

// Включение/выключение фильтрации по статус-кодам
function toggleStatusCodeFilter() {
  const filterEnabled = document.getElementById("filterByStatusCode").checked;
  const statusCodesSection = document.getElementById("statusCodesSection");

  statusCodesSection.style.display = filterEnabled ? "block" : "none";

  chrome.storage.local.set({ filterByStatusCode: filterEnabled }, () => {
    // Обновляем фильтрацию на всех вкладках
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "STATUS_CODE_FILTER_UPDATE",
            filterEnabled: filterEnabled,
            selectedStatusCodes: getSelectedStatusCodes()
          }).catch(() => {});
        }
      });
    });
  });
}

// Сохранение выбранных статус-кодов
function saveStatusCodeSettings() {
  const selectedCodes = getSelectedStatusCodes();

  chrome.storage.local.set({ selectedStatusCodes: selectedCodes }, () => {
    // Обновляем фильтрацию на всех вкладках
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "STATUS_CODE_FILTER_UPDATE",
            filterEnabled: document.getElementById("filterByStatusCode").checked,
            selectedStatusCodes: selectedCodes
          }).catch(() => {});
        }
      });
    });
  });
}

// Получение выбранных статус-кодов
function getSelectedStatusCodes() {
  const selectedCodes = [];
  document.querySelectorAll('.status-code-checkbox:checked').forEach(checkbox => {
    selectedCodes.push(checkbox.value);
  });
  return selectedCodes;
}

function toggleExtension(e) {
  const isEnabled = e.target.checked;
  extensionEnabled = isEnabled;

  chrome.storage.local.set({ extensionEnabled: isEnabled }, () => {
    updateUIState(isEnabled);

    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "EXTENSION_TOGGLE",
            enabled: isEnabled
          }).catch(() => {});
        }
      });
    });

    if (isEnabled) {
      setTimeout(updateStats, 100);
    } else {
      resetStats();
    }
  });
}

async function updateStats() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    resetStats();
    return;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return {
          currentErrors: window.errorMonitor ? window.errorMonitor.getCurrentErrors() : [],
          errorHistory: window.errorMonitor ? window.errorMonitor.getErrorHistory() : []
        };
      }
    });

    if (results && results[0] && results[0].result) {
      const data = results[0].result;
      currentErrors = data.currentErrors || [];
      errorHistory = data.errorHistory || [];
      updateDisplay(currentErrors, errorHistory);
    } else {
      resetStats();
    }
  } catch (error) {
    resetStats();
  }
}

function updateDisplay(currentErrors, errorHistory) {
  const consoleErrors = currentErrors.filter(e => e.type === "CONSOLE_ERROR").length;
  const networkErrors = currentErrors.filter(e => e.type === "NETWORK_ERROR").length;

  document.getElementById("totalCount").textContent = currentErrors.length;
  document.getElementById("errorCount").textContent = consoleErrors;
  document.getElementById("networkCount").textContent = networkErrors;
  document.getElementById("historyCount").textContent = errorHistory.length;
}

function resetStats() {
  document.getElementById("totalCount").textContent = "0";
  document.getElementById("errorCount").textContent = "0";
  document.getElementById("networkCount").textContent = "0";
  document.getElementById("historyCount").textContent = "0";
}

function updateUIState(isEnabled) {
  if (isEnabled) {
    document.body.classList.remove("disabled");
  } else {
    document.body.classList.add("disabled");
  }
}

function clearCurrentErrors() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          if (window.errorMonitor) {
            window.errorMonitor.clearCurrentErrors();
          }
        }
      });
    }
  });
}

function testConsoleError() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          console.error("Test console error from Error Monitor extension");
        }
      });
    }
  });
}

function testNetworkError() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          fetch('https://httpbin.org/status/404').catch(() => {});
        }
      });
    }
  });
}

// СОЗДАНИЕ СКРИНШОТА
async function captureScreenshot() {
  try {
    const statusElement = document.getElementById('captureScreenshot');
    const originalText = statusElement.textContent;
    statusElement.textContent = 'Создание скриншота...';
    statusElement.disabled = true;
    statusElement.style.background = '#cccccc';

    // Получаем скриншот
    const screenshotDataUrl = await new Promise((resolve) => {
      chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 80 }, (dataUrl) => {
        resolve(dataUrl);
      });
    });

    if (!screenshotDataUrl) {
      throw new Error('Не удалось создать скриншот');
    }

    // Получаем текущие ошибки из активной вкладки
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return window.errorMonitor ? window.errorMonitor.getCurrentErrors() : [];
      }
    });

    const currentErrors = results && results[0] && results[0].result ? results[0].result : [];

    if (currentErrors.length > 0) {
      // Получаем всю историю из storage
      const storageHistory = await new Promise(resolve => {
        chrome.storage.local.get(['errorHistory'], (result) => {
          resolve(result.errorHistory || []);
        });
      });

      // Обновляем все текущие ошибки в истории, добавляя скриншот
      const errorIds = currentErrors.map(error => error.id);
      const updatedHistory = storageHistory.map(error => {
        if (errorIds.includes(error.id)) {
          return {
            ...error,
            screenshot: screenshotDataUrl,
            hasScreenshot: true,
            screenshotTimestamp: new Date().toISOString()
          };
        }
        return error;
      });

      // Сохраняем обновленную историю
      await new Promise(resolve => {
        chrome.storage.local.set({ errorHistory: updatedHistory }, resolve);
      });

      // Скачиваем скриншот
      await downloadScreenshot(screenshotDataUrl, `multiple-errors-${currentErrors.length}`);

      statusElement.textContent = `Скриншот добавлен к ${currentErrors.length} ошибкам!`;
    } else {
      // Если нет текущих ошибки, просто скачиваем скриншот
      await downloadScreenshot(screenshotDataUrl, 'manual');

      statusElement.textContent = 'Скриншот создан! (нет текущих ошибок)';
    }

    setTimeout(() => {
      statusElement.textContent = originalText;
      statusElement.disabled = false;
      statusElement.style.background = '';
    }, 2000);

  } catch (error) {
    const statusElement = document.getElementById('captureScreenshot');
    statusElement.textContent = 'Ошибка!';
    setTimeout(() => {
      statusElement.textContent = 'Сделать скриншот';
      statusElement.disabled = false;
      statusElement.style.background = '';
    }, 2000);

    alert('Ошибка при создании скриншота: ' + error.message);
  }
}

// Функция скачивания скриншота
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

function showHistory() {
  chrome.windows.create({
    url: chrome.runtime.getURL("history.html"),
    type: "popup",
    width: 900,
    height: 700
  });
}

function exportHistory() {
  chrome.storage.local.get(["errorHistory"], (result) => {
    const dataStr = JSON.stringify(result.errorHistory || [], null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `error-history-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

function clearHistory() {
  if (confirm("Вы уверены, что хотите очистить всю историю ошибок?")) {
    chrome.storage.local.remove('errorHistory', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              if (window.errorMonitor) {
                window.errorMonitor.clearHistory();
              }
            }
          });
        }
      });
      setTimeout(updateStats, 100);
    });
  }
}