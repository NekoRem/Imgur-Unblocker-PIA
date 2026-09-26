document.addEventListener('DOMContentLoaded', () => {
    const sunIcon = `
        <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
    `;

    const moonIcon = `
        <svg viewBox="0 0 24 24">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
    `;

    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;

    function updateThemeUI(isLight) {
        if (isLight) {
            body.classList.add('light');
            themeToggle.innerHTML = moonIcon;
        } else {
            body.classList.remove('light');
            themeToggle.innerHTML = sunIcon;
        }
    }

    const savedTheme = localStorage.getItem('theme') || 'dark';
    updateThemeUI(savedTheme === 'light');

    themeToggle.addEventListener('click', () => {
        const isLight = body.classList.contains('light');
        if (isLight) {
            localStorage.setItem('theme', 'dark');
            updateThemeUI(false);
        } else {
            localStorage.setItem('theme', 'light');
            updateThemeUI(true);
        }
    });

    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const currentTab = tabs[0];
        if (currentTab) {
            chrome.action.getBadgeText({tabId: currentTab.id}, (text) => {
                document.getElementById('currentCount').textContent = text || '0';
            });
        }
    });

    function updateTotalCount() {
        chrome.storage.local.get(['totalProxied'], (result) => {
            const count = result.totalProxied || 0;
            document.getElementById('totalCount').textContent = count.toLocaleString();
        });
    }

    updateTotalCount();

    async function updateProxyStatus() {
        const el = document.getElementById('proxyStatus');
        const [{ settings, lastProxyError }, proxyConfig] = await Promise.all([
            chrome.storage.local.get(['settings', 'lastProxyError']),
            chrome.proxy.settings.get({})
        ]);

        if (settings && settings.enabled === false) {
            el.className = 'proxy-status';
            el.textContent = 'Proxy disabled';
        } else if (proxyConfig.levelOfControl !== 'controlled_by_this_extension') {
            el.className = 'proxy-status bad';
            el.textContent = 'Another extension controls the proxy';
        } else if (lastProxyError && Date.now() - lastProxyError.time < 5 * 60 * 1000) {
            el.className = 'proxy-status bad';
            el.textContent = `Proxy error: ${lastProxyError.error}`;
        } else {
            const host = settings?.host || '127.0.0.1';
            const port = settings?.port || 1080;
            el.className = 'proxy-status ok';
            el.textContent = `Proxying via ${host}:${port}`;
        }
    }

    updateProxyStatus();

    document.getElementById('openOptions').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'updateBadge') {
            document.getElementById('currentCount').textContent = message.count;
        } 
        else if (message.type === 'incrementTotal') {
            updateTotalCount();
        }
    });
});