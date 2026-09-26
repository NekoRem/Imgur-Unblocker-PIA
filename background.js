importScripts('defaults.js');

const IMGUR_DOMAINS = ['imgur.com', 'imgur.io'];

// Endpoints and auth scheme used by PIA's own browser extension.
const PIA_API = 'https://apiv5.privateinternetaccess.com/api/client';
const PIA_SERVER_LIST = 'https://serverlist.piaservers.net/proxy';
const PIA_PROXY_HOST = /^[a-zA-Z0-9-]+\.http-proxy\.privateinternetbrowsing\.com$/;
const PIA_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

const PAC_KEYWORDS = {
    socks5: 'SOCKS5',
    http: 'PROXY',
    https: 'HTTPS'
};

async function getSettings() {
    const result = await chrome.storage.local.get(['settings']);
    return { ...DEFAULT_SETTINGS, ...result.settings };
}

async function getPiaSession() {
    const result = await chrome.storage.local.get(['pia']);
    return result.pia || null;
}

function setError(error) {
    return chrome.storage.local.set({
        lastProxyError: { error, time: Date.now() }
    });
}

async function getProxyTarget(settings) {
    if (settings.mode === 'pia') {
        const session = await getPiaSession();
        if (!session?.token) {
            return null;
        }
        return `HTTPS ${settings.piaServer.dns}:${settings.piaServer.port}`;
    }
    if (!settings.host || !settings.port) {
        return null;
    }
    return `${PAC_KEYWORDS[settings.scheme]} ${settings.host}:${settings.port}`;
}

function buildPacScript(target) {
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
    const target = settings.enabled ? await getProxyTarget(settings) : null;
    if (!target) {
        await chrome.proxy.settings.clear({ scope: 'regular' });
        return;
    }
    await chrome.proxy.settings.set({
        scope: 'regular',
        value: {
            mode: 'pac_script',
            pacScript: { data: buildPacScript(target) }
        }
    });
    await chrome.storage.local.remove('lastProxyError');
}

async function piaSignIn(username, password) {
    const response = await fetch(`${PIA_API}/v5/api_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (!response.ok) {
        throw new Error(response.status === 401
            ? 'Wrong PIA username or password'
            : `PIA sign-in failed (HTTP ${response.status})`);
    }
    const data = await response.json();
    await chrome.storage.local.set({
        pia: { token: data.api_token, expiresAt: data.expires_at }
    });
}

async function refreshPiaTokenIfNeeded() {
    const session = await getPiaSession();
    if (!session?.token || !session.expiresAt) {
        return;
    }
    if (Date.now() < new Date(session.expiresAt).getTime() - PIA_REFRESH_WINDOW_MS) {
        return;
    }

    let response;
    try {
        response = await fetch(`${PIA_API}/v5/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Token ${session.token}`
            }
        });
    } catch (e) {
        return; // Offline; try again on the next alarm.
    }

    if (response.ok) {
        const data = await response.json();
        await chrome.storage.local.set({
            pia: { token: data.api_token, expiresAt: data.expires_at }
        });
    } else if (response.status === 401 || response.status === 403) {
        await chrome.storage.local.remove('pia');
        await setError('PIA session expired, sign in again');
    }
}

async function fetchPiaServers() {
    const response = await fetch(PIA_SERVER_LIST);
    if (!response.ok) {
        throw new Error(`Couldn't load PIA server list (HTTP ${response.status})`);
    }
    const servers = await response.json();
    // Imgur blocks the UK, so a UK exit is pointless.
    return servers
        .filter((server) => server.dns && server.port && server.iso !== 'GB')
        .map(({ name, iso, dns, port }) => ({ name, iso, dns, port }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

async function startup() {
    await refreshPiaTokenIfNeeded();
    await applyProxy();
}

chrome.runtime.onInstalled.addListener(startup);
chrome.runtime.onStartup.addListener(startup);

chrome.alarms.create('piaTokenRefresh', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'piaTokenRefresh') {
        refreshPiaTokenIfNeeded();
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.settings || changes.pia)) {
        applyProxy();
    }
});

// Requests we've already sent credentials for. A second challenge for the
// same request means the credentials were rejected, so give up instead of
// looping.
const answeredRequests = new Set();
let loginRejectedAt = 0;

function getProxyCredentials(details, settings, session) {
    const host = details.challenger?.host;
    if (settings.mode === 'pia') {
        if (!session?.token || !PIA_PROXY_HOST.test(host)) {
            return null;
        }
        // PIA's proxy login is the API token split in half.
        const half = session.token.length / 2;
        return {
            username: session.token.substring(0, half),
            password: session.token.substring(half)
        };
    }
    if (settings.username && host === settings.host) {
        return { username: settings.username, password: settings.password };
    }
    return null;
}

// Chromium can't authenticate to SOCKS5 proxies, but it does ask us for
// credentials when an HTTP/HTTPS proxy responds with 407.
chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
        if (!details.isProxy) {
            callback({});
            return;
        }
        Promise.all([getSettings(), getPiaSession()]).then(([settings, session]) => {
            const credentials = getProxyCredentials(details, settings, session);
            if (!credentials) {
                callback({});
                return;
            }
            if (answeredRequests.has(details.requestId)) {
                answeredRequests.delete(details.requestId);
                loginRejectedAt = Date.now();
                setError(settings.mode === 'pia'
                    ? 'PIA rejected the login, try signing in again'
                    : 'Proxy rejected the username/password');
                callback({ cancel: true });
                return;
            }
            answeredRequests.add(details.requestId);
            callback({ authCredentials: credentials });
        });
    },
    { urls: ['<all_urls>'] },
    ['asyncBlocking']
);

chrome.webRequest.onCompleted.addListener(
    (details) => answeredRequests.delete(details.requestId),
    { urls: ['<all_urls>'] }
);
chrome.webRequest.onErrorOccurred.addListener(
    (details) => answeredRequests.delete(details.requestId),
    { urls: ['<all_urls>'] }
);

chrome.proxy.onProxyError.addListener((details) => {
    // Cancelling a rejected login surfaces as a generic tunnel error; keep
    // the more useful login message instead.
    if (Date.now() - loginRejectedAt < 5000) {
        return;
    }
    setError(details.error);
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
    else if (message.type === 'piaSignIn') {
        piaSignIn(message.username, message.password)
            .then(() => sendResponse({ ok: true }))
            .catch((e) => sendResponse({ ok: false, error: e.message }));
        return true;
    }
    else if (message.type === 'piaSignOut') {
        chrome.storage.local.remove('pia').then(() => sendResponse({ ok: true }));
        return true;
    }
    else if (message.type === 'piaServers') {
        fetchPiaServers()
            .then((servers) => sendResponse({ ok: true, servers }))
            .catch((e) => sendResponse({ ok: false, error: e.message }));
        return true;
    }
});
