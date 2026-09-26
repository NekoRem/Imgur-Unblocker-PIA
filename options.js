const DEFAULT_SETTINGS = {
    enabled: true,
    scheme: 'socks5',
    host: '127.0.0.1',
    port: 1080,
    username: '',
    password: ''
};

const fields = ['enabled', 'scheme', 'host', 'port', 'username', 'password'];

function updateAuthVisibility() {
    const isSocks = document.getElementById('scheme').value === 'socks5';
    document.getElementById('authFields').classList.toggle('hidden', isSocks);
}

document.addEventListener('DOMContentLoaded', async () => {
    const result = await chrome.storage.local.get(['settings']);
    const settings = { ...DEFAULT_SETTINGS, ...result.settings };

    fields.forEach((field) => {
        const el = document.getElementById(field);
        if (el.type === 'checkbox') {
            el.checked = settings[field];
        } else {
            el.value = settings[field];
        }
    });
    updateAuthVisibility();

    document.getElementById('scheme').addEventListener('change', updateAuthVisibility);

    document.getElementById('save').addEventListener('click', async () => {
        const port = parseInt(document.getElementById('port').value, 10);
        const status = document.getElementById('status');
        if (!(port >= 1 && port <= 65535)) {
            status.style.color = '#d33';
            status.textContent = 'Invalid port';
            return;
        }

        const scheme = document.getElementById('scheme').value;
        await chrome.storage.local.set({
            settings: {
                enabled: document.getElementById('enabled').checked,
                scheme,
                host: document.getElementById('host').value.trim(),
                port,
                username: scheme === 'socks5' ? '' : document.getElementById('username').value,
                password: scheme === 'socks5' ? '' : document.getElementById('password').value
            }
        });

        status.style.color = '#4CAF50';
        status.textContent = 'Saved';
        setTimeout(() => { status.textContent = ''; }, 2000);
    });
});
