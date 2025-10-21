// Обновление статистики popup
function updateStats() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting
        .executeScript({
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
        });
  });
}

// Очистка ошибок
document.getElementById("clearAll").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: () => {
        if (window.errorMonitor) {
          window.errorMonitor.clearCurrentErrors();
        }
      },
    });
  });
  updateStats();
});

// Тест ошибки
document.getElementById("testError").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: () => {
        console.error("Test error from Error Monitor extension");
      },
    });
  });
});

// Тест сетевой ошибки
document.getElementById("testNetwork").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: () => {
        fetch("https://httpstat.us/404")
            .then((response) => {
              if (!response.ok) {
                throw new Error("Network test error");
              }
              return response.json();
            })
            .catch((error) => console.error("Test network error:", error));
      },
    });
  });
});

// Показать историю ошибок
document.getElementById("showHistory").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: () => {
        const history = window.errorMonitor ? window.errorMonitor.getErrorHistory() : [];
        console.log('Error History:', history);
        alert(`Всего ошибок в истории: ${history.length}\n\nПосмотрите консоль для деталей.`);
      },
    });
  });
});

// Очистить историю
document.getElementById("clearHistory").addEventListener("click", () => {
  if (confirm("Вы уверены, что хотите очистить всю историю ошибок?")) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: () => {
          if (window.errorMonitor) {
            window.errorMonitor.clearHistory();
          }
        },
      });
    });
    updateStats();
  }
});

// Экспорт истории
document.getElementById("exportHistory").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: () => {
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
  });
});

updateStats();о