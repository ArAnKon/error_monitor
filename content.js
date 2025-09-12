let currentTabErrors = [];

//listen background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case 'NETWORK_ERROR':
            const networkErrorData = {
                type: 'NETWORK',
                message: `Ошибка Network: ${request.error.error} - ${request.error.url}`,
                timestamp: new Date(request.error.timestamp),
                details: request.error
            };
            currentTabErrors.push(networkErrorData);
            showErrorPopup(networkErrorData);
            break;
    }
});

//Popup Function
function showErrorPopup(errorData) {
    const notification = document.createElement('div');
    notification.className = `error-notification ${errorData.type.toLowerCase()}-notification`;

    const typeNames = {
        'CONSOLE': 'Console Error',
        'NETWORK': 'Network Error'
    };

    notification.innerHTML = `
    <h4>
      ${typeNames[errorData.type] || errorData.type}
      <button class="close-btn" onclick="event.stopPropagation(); this.parentElement.parentElement.remove()">×</button>
    </h4>
    <p>${escapeHtml(errorData.message)}</p>
    <div class="timestamp">
      <span>${new Date().toLocaleTimeString()} • ${window.location.hostname}</span>
      ${errorData.type === 'NETWORK' ? '<span class="copy-hint">Click to copy curl</span>' : ''}
    </div>
  `;

    // Click copy cURL
    if (errorData.type === 'NETWORK') {
        notification.addEventListener('click', (e) => {
            if (!e.target.classList.contains('close-btn')) {
                copyCurlCommand(errorData);

                notification.classList.add('copy-success');

                // See tooltip
                const tooltip = document.createElement('div');
                tooltip.className = 'copy-tooltip';
                tooltip.textContent = 'cURL скопирован в буфер обмена!';
                notification.appendChild(tooltip);

                setTimeout(() => {
                    notification.classList.remove('copy-success');
                    if (tooltip.parentElement) {
                        tooltip.remove();
                    }
                }, 2000);
            }
        });
    }

    document.body.appendChild(notification);

    //Auto-hide
    setTimeout(() => {
        if (notification.parentElement) {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }
    }, 8000);
}

//Generate cURL
function generateCurlCommand(errorData) {
    let url = '';
    let method = 'GET';

    if (errorData.details) {
        url = errorData.details.url;
        method = errorData.details.method || 'GET';
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

//Copy cURL in clipboard
function copyCurlCommand(errorData) {
    const curlCommand = generateCurlCommand(errorData);
    if (!curlCommand) return;

    navigator.clipboard.writeText(curlCommand).then(() => {
        console.log('cURL скопирован в буфер обмена!');
    }).catch(err => {
        console.error('Ошибка копирования cURL:', err);
    });
}

//shielding HTML (для отображения, как текст)
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

//Interceptor errors
const originalConsoleError = console.error;
console.error = function(...args) {
    originalConsoleError.apply(console, args);
    const errorData = {
        type: 'CONSOLE',
        message: args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' '),
        timestamp: new Date()
    };
    currentTabErrors.push(errorData);
    showErrorPopup(errorData);
};

//Interceptor JavaScript error
window.addEventListener('error', (event) => {
    const errorData = {
        type: 'CONSOLE',
        message: `${event.message} (${event.filename}:${event.lineno}:${event.colno})`,
        timestamp: new Date()
    };
    currentTabErrors.push(errorData);
    showErrorPopup(errorData);
    return false;
});

//Clear notification
window.addEventListener('beforeunload', () => {
    document.querySelectorAll('.error-notification').forEach(el => el.remove());
});