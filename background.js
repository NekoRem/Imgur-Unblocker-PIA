const IMGUR_DOMAINS = ['imgur.com', 'imgur.io'];

const DEFAULT_SETTINGS = {
    enabled: true,
    scheme: 'socks5',
    host: '127.0.0.1',
    port: 1080,
    username: '',
    password: ''
};

const PAC_KEYWORDS = {
    socks5: 'SOCKS5',
    http: 'PROXY',
    https: 'HTTPS'
};

async function getSettings() {
    const result = await chrome.storage.local.get(['settings']);
    return { ...DEFAULT_SETTINGS, ...result.settings };
}

function buildPacScript(settings) {
    const target = `${PAC_KEYWORDS[settings.scheme]} ${settings.host}:${settings.port}`;
    return `
        var domains = ${JSON.stringify(IMGUR_DOMAINS)};
        function FindProxyForURL(url, host) {
            host = host.toLowerCase();
            for (var i = 0; i < domains.length; i++) {
                if (host === domains[i] || shExpMatch(host, '*.' + domains[i])) {
                    return ${JSON.stringify(target)};
                }
            }
            return 'DIRECT';
        }
    `;
}

async function applyProxy() {
    const settings = await getSettings();
    if (!settings.enabled || !settings.host || !settings.port) {
        await chrome.proxy.settings.clear({ scope: 'regular' });
        return;
    }
    await chrome.proxy.settings.set({
        scope: 'regular',
        value: {
            mode: 'pac_script',
            pacScript: { data: buildPacScript(settings) }
        }
    });
    await chrome.storage.local.remove('lastProxyError');
}

chrome.runtime.onInstalled.addListener(applyProxy);
chrome.runtime.onStartup.addListener(applyProxy);

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
        applyProxy();
    }
});

// Chromium can't authenticate to SOCKS5 proxies, but it does ask us for
// credentials when an HTTP/HTTPS proxy responds with 407.
chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
        if (!details.isProxy) {
            callback({});
            return;
        }
        getSettings().then((settings) => {
            if (settings.username && details.challenger?.host === settings.host) {
                callback({
                    authCredentials: {
                        username: settings.username,
                        password: settings.password
                    }
                });
            } else {
                callback({});
            }
        });
    },
    { urls: ['<all_urls>'] },
    ['asyncBlocking']
);

chrome.proxy.onProxyError.addListener((details) => {
    chrome.storage.local.set({
        lastProxyError: { error: details.error, time: Date.now() }
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'updateBadge') {
        if (sender.tab) {
            chrome.action.setBadgeText({
                text: message.count.toString(),
                tabId: sender.tab.id
            });
            chrome.action.setBadgeBackgroundColor({
                color: '#4CAF50',
                tabId: sender.tab.id
            });
        }
    }
    else if (message.type === 'incrementTotal') {
        chrome.storage.local.get(['totalProxied'], (result) => {
            const newTotal = (result.totalProxied || 0) + message.amount;
            chrome.storage.local.set({ totalProxied: newTotal });
        });
    }
});
