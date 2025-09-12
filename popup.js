//Update statistic popUp
function updateStats() {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            function: () => {
                return {
                    total: currentTabErrors.length,
                    errors: currentTabErrors.filter(e => e.type === 'CONSOLE').length,
                    network: currentTabErrors.filter(e => e.type === 'NETWORK').length
                };
            }
        }, (results) => {
            if (results && results[0]) {
                const stats = results[0].result;
                document.getElementById('totalCount').textContent = stats.total;
                document.getElementById('errorCount').textContent = stats.errors;
                document.getElementById('networkCount').textContent = stats.network;
            }
        });
    });
}

//Clear erroros
document.getElementById('clearAll').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            function: () => {
                currentTabErrors = [];
                document.querySelectorAll('.error-notification').forEach(el => el.remove());
            }
        });
    });
    updateStats();
});

//TestError
document.getElementById('testError').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            function: () => {
                console.error('Test error from Error Monitor extension');
            }
        });
    });
});

//Test Network Error
document.getElementById('testNetwork').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            function: () => {
                fetch('https://httpbin.org/status/404')
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Network test error');
                        }
                        return response.json();
                    })
                    .catch(error => console.error('Test network error:', error));
            }
        });
    });
});

updateStats();