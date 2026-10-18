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
1. `RESOUND_BUILD=game npm run build` → `dist/` (the game alone — no editor
   in the build, so the game's chunks carry nothing only the editor uses — plus
   all puzzles).
2. `node deploy/build-poc.mjs` → `deploy/dist-poc/` — strips `editor.html` and
   its editor-only assets if a full build has them, prunes `puzzles/` to the
   `poc-*` files, and writes a manifest filtered to those entries (order
   preserved, so the game boots into `poc-threshold` and Esc's menu lists only
   the POC set). `index.html` gets `<link rel="preload" as="fetch">` for the
   JSON the boot fetches (manifest, first level, its linked neighbors: three
   serial round trips otherwise, after the scripts run). Every text file gets
   a level-9 `.gz` beside it (for nginx `gzip_static`), and `.deploy-assets`
   lists the hashed assets.
3. `deploy/upload.sh deploy/dist-poc chugo@hugopi:/var/www/resound.calebhugo.com/`
   — plain rsync passes, ordered so no page ever 404s a chunk: new hashed
   assets first, then the puzzles, then `index.html` (and only then are stale
   unhashed files deleted). The previous deploy's assets stay for pages loaded
   before this one; only older ones are pruned (the server's `.deploy-assets`,
   recorded each deploy, says which). Re-running is safe; the first deploy onto
   a root with no `.deploy-assets` prunes nothing.

`deploy/dist-poc/` is a build artifact (gitignored). `deploy/build.test.js`
and `deploy/upload.test.js` (in `npm test`) pin the chunking, staging and
upload order.

## Caching + compression (`deploy/nginx-resound.conf`)

- `/assets/*` (Vite's hashed names: three and each resound package have their
  own chunk, exporting by real names (`minifyInternalExports: false`), so a
  game edit renames only the game's, unless it starts or stops using one of
  a package's exports): `public, max-age=31536000, immutable` — never
  revalidated.
- Everything else (`index.html`, `puzzles/*.json`): `no-cache` + ETag — a 304
  on every load until a deploy changes the file.
- `gzip_static` serves the precompressed `.gz`; `gzip` (level 6) covers any
  file without one. `gzip_proxied any`: requests arrive through the tunnel.

## Updating the vhost (one-time, by hand)

The vhost is infrastructure: `deploy.sh` never touches it. After changing
`deploy/nginx-resound.conf`, install it (plain `ssh` commands, one per line).
Either order with a deploy is fine: without a `.gz` nginx gzips on the fly,
and the old vhost already denies dotfiles like `.deploy-assets`.

```bash
scp deploy/nginx-resound.conf chugo@hugopi:/tmp/resound.conf
ssh chugo@hugopi sudo cp /etc/nginx/sites-available/resound.calebhugo.com /tmp/resound.conf.bak
ssh chugo@hugopi sudo cp /tmp/resound.conf /etc/nginx/sites-available/resound.calebhugo.com
ssh chugo@hugopi sudo nginx -t
# Only if nginx -t passed:
ssh chugo@hugopi sudo systemctl reload nginx
# If it failed, put the old one back:
#   ssh chugo@hugopi sudo cp /tmp/resound.conf.bak /etc/nginx/sites-available/resound.calebhugo.com
```

Then check through Cloudflare (`?v=` skips the edge cache):

```bash
curl -sI "https://resound.calebhugo.com/?v=$(date +%s)" | grep -iE 'cache-control|etag'
# expect: cache-control: no-cache, and an etag
curl -sI -H 'Accept-Encoding: gzip' "https://resound.calebhugo.com/assets/<three-chunk>.js" \
  | grep -iE 'cache-control|content-encoding'
# expect: max-age=31536000, immutable; content-encoding: gzip (or br from the edge)
```

If `index.html` comes back `max-age=14400` instead of `no-cache`, the zone's
Cloudflare **Browser Cache TTL** (4 h by default) is overriding the origin: add
a Cache Rule for `resound.calebhugo.com` with *Browser TTL: respect origin*.
Otherwise browsers keep a stale `index.html` for up to 4 hours after a deploy.

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
