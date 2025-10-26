class ScreenshotStorage {
    constructor() {
        this.dbName = 'ErrorScreenshots';
        this.dbVersion = 1;
    }

    async init() {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            request.onerror = () => resolve();
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('screenshots')) {
                    db.createObjectStore('screenshots', { keyPath: 'errorId' });
                }
            };
        });
    }

    async saveScreenshot(errorId, dataUrl) {
        if (!this.db) await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['screenshots'], 'readwrite');
            const store = transaction.objectStore('screenshots');
            store.put({ errorId, dataUrl, timestamp: Date.now() });
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => resolve();
        });
    }

    async getScreenshot(errorId) {
        if (!this.db) await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['screenshots'], 'readonly');
            const store = transaction.objectStore('screenshots');
            const request = store.get(errorId);
            request.onsuccess = () => resolve(request.result?.dataUrl);
            request.onerror = () => resolve(null);
        });
    }
}

class ScreenshotManager {
    constructor() {
        this.screenshotsEnabled = true;
        this.storage = new ScreenshotStorage();
        this.loadSettings();
    }

    loadSettings() {
        chrome.storage.local.get(['screenshotsEnabled'], (result) => {
            this.screenshotsEnabled = result.screenshotsEnabled !== false;
        });
    }

    async captureTabScreenshot() {
        if (!this.screenshotsEnabled) return null;

        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { type: "CAPTURE_SCREENSHOT" },
                (response) => {
                    resolve(response?.screenshot || null);
                }
            );
        });
    }

    async saveScreenshotToHistory(errorId, screenshotDataUrl) {
        if (!screenshotDataUrl) return false;
        try {
            await this.storage.saveScreenshot(errorId, screenshotDataUrl);
            await this.updateErrorFlag(errorId, true);
            return true;
        } catch (error) {
            return false;
        }
    }

    updateErrorFlag(errorId, hasScreenshot) {
        return new Promise((resolve) => {
            chrome.storage.local.get(['errorHistory'], (result) => {
                const history = result.errorHistory || [];
                const error = history.find(e => e.id === errorId);
                if (error) {
                    error.hasScreenshot = hasScreenshot;
                    chrome.storage.local.set({ errorHistory: history }, () => {
                        resolve(true);
                    });
                } else {
                    resolve(false);
                }
            });
        });
    }

    async getScreenshot(errorId) {
        try {
            return await this.storage.getScreenshot(errorId);
        } catch (error) {
            return null;
        }
    }
}

// Сохранение в chrome.storage
const manager = new ScreenshotManager();
chrome.storage.local.set({ screenshotManager: true });