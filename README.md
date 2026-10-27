# Imgur-Unblocker-PIA

Routes **only** imgur traffic through [PIA](https://www.privateinternetaccess.com/)'s proxy servers so imgur works in the UK again. Every other site connects directly as normal.

Imgur shows "Content not viewable in your region" in the UK. The original extension got around this with DuckDuckGo's image proxy, which no longer works. This fork loads the real imgur servers through a PIA proxy instead, so full imgur pages and albums work too, not just direct image links.

Based on the original [ImgurUnblocker](https://github.com/HexedHero/ImgurUnblocker) by HexedHero and on the authentication scheme used by PIA's own browser extension. See [Credits](#credits).

## How it works

```
Brave ──imgur.com / imgur.io──▶ PIA HTTPS proxy (e.g. NL Amsterdam) ──▶ imgur
      └──everything else──────▶ direct
```

The extension signs in to PIA the same way PIA's own browser extension does:

1. You enter your PIA username (`p1234567`) and password in the extension's settings. They are sent to PIA's API (`/v5/api_token`) in exchange for a login token. Your password is not stored.
2. The token is kept in the extension's local storage. The extension renews it automatically before it expires (`/v5/refresh`).
3. A routing script (PAC) sends only `imgur.com`/`imgur.io` requests to the chosen PIA proxy, `<location>.http-proxy.privateinternetbrowsing.com:443`.
4. When the proxy asks for a login, the extension answers with the token, split in half into a username and a password (the same scheme PIA's extension uses).

The location list comes from `serverlist.piaservers.net/proxy`. UK locations are hidden because imgur blocks the UK.

This relies on PIA's undocumented extension API, so it could stop working if PIA changes it.

## Install (Brave/Chrome)

1. Download this repo (or `git clone` it).
2. Open `brave://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the repo folder.
4. **Disable PIA's own browser extension** if you have it. Only one extension can control the browser's proxy settings at a time.
5. Click the Imgur Unblocker icon, then **Proxy settings**. Sign in with your PIA username and password, pick a location, and click **Save**.

The popup should now say "Proxying via PIA NL Amsterdam" (or the location you picked).

## Custom proxy

If you'd rather use a different proxy, set **Proxy** to **Custom proxy** in the settings. HTTP and HTTPS proxies with a username and password work. SOCKS5 only works without a login, because Brave and Chrome can't log in to SOCKS5 proxies.

## Troubleshooting

The popup shows the current status:

- **Not signed in to PIA**: sign in from the proxy settings.
- **Another extension controls the proxy**: disable the other proxy/VPN extension (usually PIA's own).
- **PIA rejected the login** or **PIA session expired**: sign out and sign in again.

## Credits

- **[ImgurUnblocker](https://github.com/HexedHero/ImgurUnblocker)** by HexedHero: the original extension this project is based on (MIT licensed, see `LICENSE.md`).
- **PIA authentication**: the sign-in, token renewal and proxy login flow is based on how [Private Internet Access](https://www.privateinternetaccess.com/)'s official browser extension authenticates. This project is not affiliated with or endorsed by PIA.
