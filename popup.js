// Обновление статистики popup
function updateStats() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          return {
            total: window.errorMonitor ? window.errorMonitor.getCurrentErrors().length : 0,
            errors: window.errorMonitor ? window.errorMonitor.getCurrentErrors().filter((e) => e.type === "CONSOLE_ERROR").length : 0,
            network: window.errorMonitor ? window.errorMonitor.getCurrentErrors().filter((e) => e.type === "NETWORK_ERROR" || e.type === "SERVER_ERROR").length : 0,
            historyTotal: window.errorMonitor ? window.errorMonitor.getErrorHistory().length : 0
          };
        },
      })
          .then((results) => {
            if (results && results[0]) {
              const stats = results[0].result;
              document.getElementById("totalCount").textContent = stats.total;
              document.getElementById("errorCount").textContent = stats.errors;
              document.getElementById("networkCount").textContent = stats.network;
              document.getElementById("historyCount").textContent = stats.historyTotal;
            }
          })
          .catch((error) => {
            console.error('Error getting stats:', error);
            document.getElementById("totalCount").textContent = "0";
            document.getElementById("errorCount").textContent = "0";
            document.getElementById("networkCount").textContent = "0";
            document.getElementById("historyCount").textContent = "0";
          });
    }
  });
}

// Управление состоянием расширения
document.getElementById("toggleExtension").addEventListener("change", (e) => {
  const isEnabled = e.target.checked;
  chrome.storage.local.set({ extensionEnabled: isEnabled }, () => {
    updateUIState(isEnabled);

    // Обновляем состояние на всех вкладках
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "EXTENSION_TOGGLE",
            enabled: isEnabled
          }).catch(() => {}); // Игнорируем ошибки для вкладок без content script
        }
      });
    });

    if (isEnabled) {
      setTimeout(updateStats, 100);
    } else {
      // Очищаем статистику при выключении
      document.getElementById("totalCount").textContent = "0";
      document.getElementById("errorCount").textContent = "0";
      document.getElementById("networkCount").textContent = "0";
      document.getElementById("historyCount").textContent = "0";
    }
  });
});

// Обновление UI в зависимости от состояния
function updateUIState(isEnabled) {
  if (isEnabled) {
    document.body.classList.remove("disabled");
  } else {
    document.body.classList.add("disabled");
  }
}

// Загрузка состояния при открытии popup
function loadExtensionState() {
  chrome.storage.local.get(["extensionEnabled"], (result) => {
    const isEnabled = result.extensionEnabled !== false; // По умолчанию включено
    document.getElementById("toggleExtension").checked = isEnabled;
    updateUIState(isEnabled);

    if (isEnabled) {
      updateStats();
    }
  });
}

// Очистка ошибок
document.getElementById("clearAll").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          if (window.errorMonitor) {
            window.errorMonitor.clearCurrentErrors();
          }
        },
      })
          .then(() => {
            setTimeout(updateStats, 100);
          });
    }
  });
});

// Тест ошибки консоли
document.getElementById("testError").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      // Просто вставляем код для выполнения на странице
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          console.error("Test console error from Error Monitor extension - " + new Date().toLocaleTimeString());
        },
      })
          .then(() => {
            console.log("Test error executed");
            setTimeout(updateStats, 500);
          })
          .catch((error) => {
            console.error("Error executing test error:", error);
          });
    }
  });
});

// Тест сетевой ошибки - убедимся что используем правильные URL
document.getElementById("testNetwork").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          // Тестовые URL которые гарантированно вернут статус-коды
          const testUrls = [
            'https://httpbin.org/status/404',
            'https://httpbin.org/status/500',
            'https://httpbin.org/status/403',
            'https://httpbin.org/status/400'
          ];

          testUrls.forEach(url => {
            fetch(url)
                .then((response) => {
                  console.log('Test fetch response status:', response.status);
                  if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                  }
                  return response.text();
                })
                .catch((error) => {
                  console.log(`Test network error: ${error.message}`);
                });
          });
        },
      });
    }
  });
});

// Показать историю ошибок
document.getElementById("showHistory").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          const history = window.errorMonitor ? window.errorMonitor.getErrorHistory() : [];
          console.log('Error History:', history);

          history.forEach((error, index) => {
            let statusInfo = '';
            if ((error.type === 'SERVER_ERROR' || error.type === 'NETWORK_ERROR') && error.details) {
              if (error.details.statusCode) {
                statusInfo = `Status: ${error.details.statusCode}`;
              } else if (error.details.error) {
                statusInfo = `Error: ${error.details.error}`;
              }
            }
            console.group(`Error ${index + 1}: ${error.type} ${statusInfo}`);
            console.log('Message:', error.message);
            console.log('Time:', error.timestamp);
            console.log('URL:', error.tabUrl);
            if (error.details) {
              console.log('Details:', error.details);
            }
            console.groupEnd();
          });

          alert(`Всего ошибок в истории: ${history.length}\n\nПосмотрите консоль для деталей.`);
        },
      });
    }
  });
});

// Очистить историю
document.getElementById("clearHistory").addEventListener("click", () => {
  if (confirm("Вы уверены, что хотите очистить всю историю ошибок?")) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            if (window.errorMonitor) {
              window.errorMonitor.clearHistory();
            }
          },
        })
            .then(() => {
              setTimeout(updateStats, 100);
            });
      }
    });
  }
});

// Экспорт истории
document.getElementById("exportHistory").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          if (window.errorMonitor) {
            const history = window.errorMonitor.getErrorHistory();
            const dataStr = JSON.stringify(history, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});

            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `error-history-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        },
      });
    }
  });
});

// Инициализация при загрузке popup
document.addEventListener('DOMContentLoaded', () => {
  loadExtensionState();
});