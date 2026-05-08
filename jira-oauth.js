class JiraOAuth {
    constructor() {
        this.CLIENT_ID = 'YOUR_CLIENT_ID'; // Нужно зарегистрировать приложение в Atlassian
        this.REDIRECT_URI = chrome.identity.getRedirectURL();
        this.SCOPES = ['read:jira-work', 'write:jira-work', 'offline_access'];
    }

    async authorize() {
        const authUrl = new URL('https://auth.atlassian.com/authorize');
        authUrl.searchParams.append('audience', 'api.atlassian.com');
        authUrl.searchParams.append('client_id', this.CLIENT_ID);
        authUrl.searchParams.append('scope', this.SCOPES.join(' '));
        authUrl.searchParams.append('redirect_uri', this.REDIRECT_URI);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('prompt', 'consent');

        try {
            const redirectUrl = await chrome.identity.launchWebAuthFlow({
                url: authUrl.toString(),
                interactive: true
            });
            const urlParams = new URLSearchParams(new URL(redirectUrl).search);
            const code = urlParams.get('code');

            if (!code) {
                throw new Error('No authorization code received');
            }
            const tokens = await this.exchangeCodeForTokens(code);
            await this.saveTokens(tokens);

            return tokens;
        } catch (error) {
            console.error('OAuth authorization failed:', error);
            throw error;
        }
    }

    async exchangeCodeForTokens(code) {
        const response = await fetch('https://auth.atlassian.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: this.CLIENT_ID,
                code: code,
                redirect_uri: this.REDIRECT_URI
            })
        });

        if (!response.ok) {
            throw new Error('Token exchange failed');
        }

        return await response.json();
    }

    async getValidAccessToken() {
        const tokens = await this.getStoredTokens();

        if (!tokens) {
            return null;
        }
        if (tokens.expires_at && tokens.expires_at < Date.now()) {
            return await this.refreshAccessToken(tokens.refresh_token);
        }

        return tokens.access_token;
    }

    async refreshAccessToken(refreshToken) {
        const response = await fetch('https://auth.atlassian.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                grant_type: 'refresh_token',
                client_id: this.CLIENT_ID,
                refresh_token: refreshToken
            })
        });

        if (!response.ok) {
            throw new Error('Token refresh failed');
        }

        const tokens = await response.json();
        tokens.expires_at = Date.now() + (tokens.expires_in * 1000);
        await this.saveTokens(tokens);
        return tokens.access_token;
    }

    async saveTokens(tokens) {
        tokens.expires_at = Date.now() + (tokens.expires_in * 1000);
        await chrome.storage.local.set({ jiraOAuthTokens: tokens });
    }

    async getStoredTokens() {
        const result = await chrome.storage.local.get(['jiraOAuthTokens']);
        return result.jiraOAuthTokens;
    }

    async getJiraSites() {
        const accessToken = await this.getValidAccessToken();
        if (!accessToken) return [];

        const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) return [];
        return await response.json();
    }

    async createIssue(siteUrl, projectKey, issueType, summary, description, screenshotDataUrl = null) {
        const accessToken = await this.getValidAccessToken();
        if (!accessToken) {
            throw new Error('Not authenticated with Jira');
        }
        const sites = await this.getJiraSites();
        const site = sites.find(s => s.url === siteUrl);
        if (!site) {
            throw new Error('Jira site not found');
        }

        const cloudId = site.id;
        const issueResponse = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: {
                    project: { key: projectKey },
                    summary: summary,
                    description: {
                        type: 'doc',
                        version: 1,
                        content: [
                            {
                                type: 'paragraph',
                                content: [
                                    {
                                        type: 'text',
                                        text: description
                                    }
                                ]
                            }
                        ]
                    },
                    issuetype: { name: issueType }
                }
            })
        });

        if (!issueResponse.ok) {
            const error = await issueResponse.text();
            throw new Error(`Failed to create issue: ${error}`);
        }

        const issue = await issueResponse.json();

        if (screenshotDataUrl) {
            await this.attachScreenshot(cloudId, accessToken, issue.key, screenshotDataUrl);
        }

        return {
            success: true,
            issueKey: issue.key,
            issueUrl: `${siteUrl}/browse/${issue.key}`
        };
    }

    async attachScreenshot(cloudId, accessToken, issueKey, screenshotDataUrl) {
        const blob = await this.dataURLtoBlob(screenshotDataUrl);
        const formData = new FormData();
        formData.append('file', blob, `screenshot-${issueKey}.png`);

        const response = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/attachments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Atlassian-Token': 'no-check'
            },
            body: formData
        });

        if (!response.ok) {
            console.error('Failed to attach screenshot');
        }
    }

    dataURLtoBlob(dataURL) {
        const arr = dataURL.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    }

    async isAuthenticated() {
        const tokens = await this.getStoredTokens();
        return tokens && tokens.access_token && tokens.expires_at > Date.now();
    }

    async logout() {
        await chrome.storage.local.remove(['jiraOAuthTokens']);
    }
}
window.jiraOAuth = new JiraOAuth();