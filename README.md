# ImgurUnblocker (PIA Proxy fork)

Routes imgur traffic through your own proxy, such as a [PIA](https://www.privateinternetaccess.com/) SOCKS5 proxy, so imgur works in the UK again. All other sites connect directly as normal.

Imgur shows "Content not viewable in your region" in the UK. The original extension got around this with DuckDuckGo's image proxy, which no longer works. This fork uses the browser's proxy API instead. Because the real imgur servers are loaded through the proxy, full imgur pages and albums work too, not just direct image links.

Forked from [HexedHero/ImgurUnblocker](https://github.com/HexedHero/ImgurUnblocker).

## How it works

```
Brave ──imgur.com / imgur.io──▶ 127.0.0.1:1080 (gost) ──SOCKS5 + login──▶ PIA (NL) ──▶ imgur
      └──everything else──────▶ direct
```

Brave and Chrome can't log in to SOCKS5 proxies, and PIA's SOCKS5 proxy needs a username and password. A small local relay ([gost](https://github.com/go-gost/gost)) fills that gap: the extension sends imgur traffic to the relay without a login, and the relay forwards it to PIA with your credentials.

If you have an HTTP/HTTPS proxy that uses a username and password, you can skip the relay and enter the proxy and login details in the extension's settings.

## Setup (Linux, Brave/Chrome)

1. **Get PIA SOCKS credentials.** In the PIA Client Control Panel, use "Generate SOCKS Password". This is not your normal PIA login. The username starts with `x`.

2. **Install gost.** On Arch or CachyOS:
   ```sh
   sudo pacman -S gost
   ```
   For other systems, see the [gost releases](https://github.com/go-gost/gost/releases).

3. **Configure the relay:**
   ```sh
   mkdir -p ~/.config/gost
   cp relay/pia.example.yaml ~/.config/gost/pia.yaml
   chmod 600 ~/.config/gost/pia.yaml
   # edit ~/.config/gost/pia.yaml and fill in your username and password
   ```

4. **Run the relay at login:**
   ```sh
   mkdir -p ~/.config/systemd/user
   cp relay/imgur-pia-relay.service ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now imgur-pia-relay
   ```

5. **Test the relay:**
   ```sh
   curl -sI --socks5-hostname 127.0.0.1:1080 https://i.imgur.com/removed.png | head -1
   ```
   You should see `HTTP/2 200`. Run `journalctl --user -u imgur-pia-relay` to see relay errors. For example, `auth failure` means the credentials are wrong.

6. **Load the extension:** open `brave://extensions`, turn on **Developer mode** (top right), click **Load unpacked**, and select this folder.

The defaults (SOCKS5, `127.0.0.1:1080`) match the relay, so no further setup is needed. To change the proxy, click the extension icon and choose **Proxy settings**.

## Notes

- Only one extension at a time can control the browser's proxy settings. If you also use the PIA browser extension (or another proxy extension), the popup will show "Another extension controls the proxy".
- The popup shows the current proxy status and any recent proxy error.
