# Deploy — resound.calebhugo.com (POC)

Public POC build of Resound, hosted on the Pi (nginx + the existing `calebhugo`
Cloudflare Tunnel), same house pattern as the other `*.calebhugo.com` static
apps. Ships **only the nine POC levels** and the game — no editor, no dev/test
puzzles.

- **Live:** https://resound.calebhugo.com
- **Pi web root:** `/var/www/resound.calebhugo.com/`
- **Local nginx port:** `127.0.0.1:8100` (tunnel proxies the hostname to it)
- **Tunnel:** `calebhugo` (`cloudflared-calebhugo.service`), ingress in
  `~/.cloudflared/calebhugo-tunnel.yml`

## Deploy (repeatable)

```bash
./deploy/deploy.sh
```

Which does:
1. `npm run build` → `dist/` (full build, includes the editor + all puzzles).
2. `node deploy/build-poc.mjs` → `deploy/dist-poc/` — strips `editor.html` and
   its editor-only assets, prunes `puzzles/` to the `poc-*` files, and writes a
   manifest filtered to those entries (order preserved, so the game boots into
   `poc-threshold` and Esc's menu lists only the POC set).
3. `rsync --delete deploy/dist-poc/ chugo@hugopi:/var/www/resound.calebhugo.com/`.

`deploy/dist-poc/` is a build artifact (gitignored).

## One-time infrastructure (already done — reference only)

```bash
# 1. Web root
ssh chugo@hugopi 'sudo mkdir -p /var/www/resound.calebhugo.com && \
  sudo chown chugo:chugo /var/www/resound.calebhugo.com'

# 2. nginx vhost (see deploy/nginx-resound.conf)
scp deploy/nginx-resound.conf chugo@hugopi:/tmp/resound.conf
ssh chugo@hugopi 'sudo mv /tmp/resound.conf /etc/nginx/sites-available/resound.calebhugo.com && \
  sudo ln -sf /etc/nginx/sites-available/resound.calebhugo.com /etc/nginx/sites-enabled/ && \
  sudo nginx -t && sudo systemctl reload nginx'

# 3. Tunnel ingress: add before the http_status:404 catch-all in
#    ~/.cloudflared/calebhugo-tunnel.yml:
#      - hostname: resound.calebhugo.com
#        service: http://127.0.0.1:8100

# 4. DNS + restart tunnel
ssh chugo@hugopi 'cloudflared tunnel route dns calebhugo resound.calebhugo.com && \
  sudo systemctl restart cloudflared-calebhugo.service'
```

## Notes

- The editor's write/git endpoints are Vite dev-server middleware — they don't
  exist in a static production build, so dropping `editor.html` loses nothing.
- `window.__resoundDebug` is `import.meta.env.DEV`-only and is absent in the
  production bundle by design.
- CSP is game-friendly but tight (`deploy/nginx-resound.conf`): same-origin
  everything, `'wasm-unsafe-eval'` + `worker-src` for a possible AudioWorklet,
  `'unsafe-inline'` styles only. No external hosts, no script `'unsafe-eval'`.
