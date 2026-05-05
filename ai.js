/**
 * AI Integration - Pollinations.ai
 * Все API вызовы идут через background script
 */
class ErrorMonitorAI {
    constructor() {
        this.apiBase = 'https://text.pollinations.ai';
        this.maxRetries = 2;
        this.isExtension = (typeof chrome !== 'undefined') && chrome.runtime && chrome.runtime.id;
        console.log('[AI] Initialized, extension mode:', this.isExtension);
    }

    async analyzeError(error) {
        if (!error) {
            return { success: false, message: 'No error data provided' };
        }

        try {
            const prompt = this.buildAnalysisPrompt(error);
            const text = await this.callAPI(prompt);
            return { success: true, analysis: text };
        } catch (err) {
            console.error('[AI] Error analyzing:', err);
            return { success: false, message: err.message };
        }
    }

    buildAnalysisPrompt(error) {
        let prompt = 'Analyze this error and provide a brief analysis (3-4 sentences in Russian):\n\n';
        prompt += 'Error Type: ' + (error.type || 'Unknown') + '\n';
        prompt += 'Message: ' + (error.message || 'N/A') + '\n';
        prompt += 'URL: ' + (error.tabUrl || 'N/A') + '\n\n';

        if (error.details && error.details.responseBody) {
            prompt += 'Response body (first 500 chars):\n' + error.details.responseBody.substring(0, 500) + '\n\n';
        }

        if (error.reproductionSteps && error.reproductionSteps !== 'Не удалось автоматически определить шаги воспроизведения.') {
            prompt += 'User actions:\n' + error.reproductionSteps.substring(0, 300) + '\n\n';
        }

        prompt += 'Please provide a short analysis in Russian: what might be causing this error and how to fix it.';
        return prompt;
    }

    async generatePlaybackSteps(error) {
        if (!error) {
            return { success: false, message: 'No error data provided', playbackSteps: [] };
        }

        try {
            const prompt = this.buildPlaybackPrompt(error);
            const text = await this.callAPI(prompt);

            // Пытаемся извлечь JSON из ответа
            const steps = this.extractStepsFromResponse(text);

            if (steps && steps.length > 0) {
                const cleanedSteps = this.cleanAndDeduplicateSteps(steps);
                return { success: true, playbackSteps: cleanedSteps };
            }

            // Если не удалось извлечь шаги, возвращаем пустой массив
            return { success: false, message: 'No valid steps extracted', playbackSteps: [] };

        } catch (err) {
            console.error('[AI] Error generating steps:', err);
            return { success: false, message: err.message, playbackSteps: [] };
        }
    }

    buildPlaybackPrompt(error) {
        let prompt = 'Generate a JSON array of steps to reproduce this error.\n\n';
        prompt += 'Error message: ' + (error.message || 'N/A') + '\n';
        prompt += 'Page URL: ' + (error.tabUrl || 'N/A') + '\n\n';

        if (error.reproductionSteps && error.reproductionSteps !== 'Не удалось автоматически определить шаги воспроизведения.') {
            prompt += 'Recorded user actions:\n' + error.reproductionSteps + '\n\n';
        }

        if (error.userActions && error.userActions.length > 0) {
            prompt += 'Additional context: ' + JSON.stringify(error.userActions.slice(-5)) + '\n\n';
        }

        prompt += 'INSTRUCTIONS:\n';
        prompt += '1. Generate 3-8 clear steps in Russian language ONLY\n';
        prompt += '2. Each step must have: action, description, selector (if available), value (if needed)\n';
        prompt += '3. Action types: "navigate", "click", "input", "select", "checkbox"\n';
        prompt += '4. DO NOT use "Toggle" - use "Check checkbox" instead\n';
        prompt += '5. Remove duplicate or similar steps\n';
        prompt += '6. Keep descriptions concise (max 60 characters)\n';
        prompt += '7. Focus on actions that lead to the error\n\n';
        prompt += 'Example format:\n';
        prompt += '[\n';
        prompt += '  {"step":1,"action":"navigate","description":"Открыть страницу","selector":"","value":""},\n';
        prompt += '  {"step":2,"action":"click","description":"Нажать кнопку Войти","selector":"button.login","value":""},\n';
        prompt += '  {"step":3,"action":"input","description":"Ввести email","selector":"input[name=email]","value":"test@example.com"}\n';
        prompt += ']\n\n';
        prompt += 'Return ONLY valid JSON array, no other text:';

        return prompt;
    }

    extractStepsFromResponse(text) {
        if (!text) return null;

        // Пытаемся найти JSON в ответе
        let jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            // Пробуем другой паттерн
            jsonMatch = text.match(/\{[\s\S]*\}/);
        }

        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (Array.isArray(parsed)) {
                    return parsed;
                } else if (parsed.steps && Array.isArray(parsed.steps)) {
                    return parsed.steps;
                }
            } catch (e) {
                console.error('[AI] Failed to parse JSON:', e);
            }
        }

        return null;
    }

    cleanAndDeduplicateSteps(steps) {
        if (!Array.isArray(steps)) return [];

        const seen = new Set();
        const unique = [];

        for (let i = 0; i < steps.length && i < 10; i++) {
            const step = steps[i];
            if (!step || !step.description) continue;

            // Нормализуем описание для дедупликации
            const description = this.cleanDescription(step.description);
            if (!description || description.length < 3) continue;

            const normalizedKey = description.toLowerCase().replace(/[^а-яёa-z0-9]/g, '');
            if (seen.has(normalizedKey)) continue;

            seen.add(normalizedKey);
            unique.push({
                step: unique.length + 1,
                action: this.normalizeAction(step.action),
                description: description,
                selector: step.selector || '',
                value: step.value || ''
            });
        }

        return unique;
    }

    normalizeAction(action) {
        if (!action) return 'click';
        const actionLower = String(action).toLowerCase();

        if (actionLower.indexOf('navigate') !== -1 || actionLower.indexOf('goto') !== -1) return 'navigate';
        if (actionLower.indexOf('input') !== -1 || actionLower.indexOf('type') !== -1) return 'input';
        if (actionLower.indexOf('checkbox') !== -1 || actionLower.indexOf('toggle') !== -1 || actionLower.indexOf('check') !== -1) return 'checkbox';
        if (actionLower.indexOf('select') !== -1) return 'select';

        return 'click';
    }

    cleanDescription(description) {
        if (!description) return '';

        let cleaned = String(description);

        // Удаляем префиксы действий
        cleaned = cleaned.replace(/^(click|input|navigate|toggle|check|select|нажать|ввести|открыть|выбрать)\s+/i, '');
        cleaned = cleaned.replace(/^click\s+/i, '');
        cleaned = cleaned.replace(/^input\s+/i, '');

        // Заменяем Toggle на Check
        cleaned = cleaned.replace(/Toggle\s+/i, 'Check ');

        // Обрезаем длинные описания
        if (cleaned.length > 80) {
            cleaned = cleaned.substring(0, 77) + '...';
        }

        // Очищаем пробелы
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        // Делаем первую букву заглавной
        if (cleaned.length > 0) {
            cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        }

        return cleaned;
    }

    async callAPI(prompt) {
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                let text;

                if (this.isExtension) {
                    console.log('[AI] Calling via background, attempt', attempt + 1);
                    text = await this.callViaBackground(prompt);
                } else {
                    console.log('[AI] Calling directly, attempt', attempt + 1);
                    text = await this.callDirect(prompt);
                }

                if (!text || text.trim().length === 0) {
                    throw new Error('Empty response from API');
                }

                return text.trim();

            } catch (err) {
                console.error(`[AI] API call attempt ${attempt + 1} failed:`, err.message);
                if (attempt < this.maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                } else {
                    throw err;
                }
            }
        }
        throw new Error('All API attempts failed');
    }

    async callDirect(prompt) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetch(this.apiBase, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: prompt }],
                    model: 'openai',
                    seed: Date.now()
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            return await response.text();

        } finally {
            clearTimeout(timeoutId);
        }
    }

    async callViaBackground(prompt) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'POLLINATIONS_API_CALL',
                prompt: prompt
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.success) {
                    resolve(response.text);
                } else {
                    reject(new Error(response?.error || 'Background API call failed'));
                }
            });
        });
    }
}

// Создаем глобальный экземпляр
window.errorMonitorAI = new ErrorMonitorAI();
console.log('[AI] ErrorMonitorAI initialized successfully');