const customFields = ['scheme', 'host', 'port', 'username', 'password'];

const $ = (id) => document.getElementById(id);

function showStatus(id, text, ok) {
    const el = $(id);
    el.className = `status ${ok ? 'ok' : 'bad'}`;
    el.textContent = text;
}

function updateVisibility() {
    const isPia = $('mode').value === 'pia';
    $('piaSection').classList.toggle('hidden', !isPia);
    $('customSection').classList.toggle('hidden', isPia);
    $('authFields').classList.toggle('hidden', $('scheme').value === 'socks5');
}

async function renderPiaSession() {
    const { pia } = await chrome.storage.local.get(['pia']);
    const signedIn = !!pia?.token;
    $('piaSignedOut').classList.toggle('hidden', signedIn);
    $('piaSignedIn').classList.toggle('hidden', !signedIn);
    if (signedIn) {
        const expires = pia.expiresAt ? new Date(pia.expiresAt).toLocaleString() : 'unknown';
        $('piaSessionInfo').textContent = `Signed in to PIA. Token renews automatically (current one expires ${expires}).`;
    }
}

async function loadServers(selected) {
    const select = $('piaServer');
    const addOption = (server) => {
        const option = document.createElement('option');
        option.value = server.dns;
        option.textContent = server.name;
        option.dataset.server = JSON.stringify(server);
        select.appendChild(option);
    };

    const response = await chrome.runtime.sendMessage({ type: 'piaServers' });
    select.replaceChildren();
    if (!response?.ok) {
        addOption(selected);
        return;
    }
    response.servers.forEach(addOption);
    if (!response.servers.some((server) => server.dns === selected.dns)) {
        addOption(selected);
    }
    select.value = selected.dns;
}

document.addEventListener('DOMContentLoaded', async () => {
    const result = await chrome.storage.local.get(['settings']);
    const settings = { ...DEFAULT_SETTINGS, ...result.settings };

    $('enabled').checked = settings.enabled;
    $('mode').value = settings.mode;
    customFields.forEach((field) => { $(field).value = settings[field]; });
    updateVisibility();
    renderPiaSession();
    loadServers(settings.piaServer);

    $('mode').addEventListener('change', updateVisibility);
    $('scheme').addEventListener('change', updateVisibility);

    $('piaSignIn').addEventListener('click', async () => {
        const username = $('piaUsername').value.trim();
        const password = $('piaPassword').value;
        if (!username || !password) {
            showStatus('piaStatus', 'Enter your username and password', false);
            return;
        }
        $('piaSignIn').disabled = true;
        showStatus('piaStatus', 'Signing in...', true);
        const response = await chrome.runtime.sendMessage({ type: 'piaSignIn', username, password });
        $('piaSignIn').disabled = false;
        $('piaPassword').value = '';
        if (response?.ok) {
            $('piaStatus').textContent = '';
            renderPiaSession();
        } else {
            showStatus('piaStatus', response?.error || 'Sign-in failed', false);
        }
    });

    $('piaSignOut').addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ type: 'piaSignOut' });
        renderPiaSession();
    });

    $('save').addEventListener('click', async () => {
        const mode = $('mode').value;
        const scheme = $('scheme').value;
        const port = parseInt($('port').value, 10);
        if (mode === 'custom' && !(port >= 1 && port <= 65535)) {
            showStatus('saveStatus', 'Invalid port', false);
            return;
        }

        const selectedOption = $('piaServer').selectedOptions[0];
        await chrome.storage.local.set({
            settings: {
                enabled: $('enabled').checked,
                mode,
                piaServer: selectedOption ? JSON.parse(selectedOption.dataset.server) : settings.piaServer,
                scheme,
                host: $('host').value.trim(),
                port: port || settings.port,
                username: scheme === 'socks5' ? '' : $('username').value,
                password: scheme === 'socks5' ? '' : $('password').value
            }
        });

        showStatus('saveStatus', 'Saved', true);
        setTimeout(() => { $('saveStatus').textContent = ''; }, 2000);
    });
});
