# Hanzo CDN Infrastructure Spec

Last verified: 2026-04-17 from source code and K8s manifests.

## 1. Architecture

Two deployment modes coexist. Production uses the Cloudflare Workers path.

### Production (Cloudflare Workers + R2)

```
Client
  |
  v
Cloudflare DNS (proxied)
  |
  v
cdn-worker (Cloudflare Worker)
  |
  v
R2 bucket: "pub"
  key layout: <org>/<path>
```

Domain-to-prefix mapping is statically defined in `cdn-worker/src/worker.js`:

| Domain | R2 prefix |
|--------|-----------|
| cdn.hanzo.ai | hanzo/ |
| cdn.lux.network | lux/ |
| cdn.zoo.ngo | zoo/ |
| cdn.pars.network | pars/ |

### K8s fallback (Traefik + static + S3)

```
Client
  |
  v
Cloudflare DNS
  |
  v
Traefik Ingress (hanzo-k8s, ingressClassName: ingress)
  |
  v
cdn Service (port 80 -> 3000)
  |
  v
hanzoai/static container
  |
  v
MinIO S3 (s3.hanzo.svc.cluster.local:9000, bucket: cdn)
```

This path exists in `universe/infra/k8s/cdn/` and runs 2 replicas on hanzo-k8s.

## 2. Components

### cdn-worker (Cloudflare Worker)

| Property | Value |
|----------|-------|
| Repo | github.com/hanzoai/cdn-worker |
| Runtime | Cloudflare Workers |
| Source | `src/worker.js` (133 lines) |
| R2 binding | `CDN_BUCKET` -> bucket `pub` |
| Dependencies | `wrangler ^4.0.0` (devDependency only) |
| Tags | none (deployed via `wrangler deploy`) |
| Upload tool | `upload.sh` (wrangler r2 object put) |

### hanzoai/static

| Property | Value |
|----------|-------|
| Repo | github.com/hanzoai/static |
| Language | Go 1.26.1 |
| Module | `github.com/hanzoai/static` |
| Binary | `/static` (single binary, scratch image) |
| Image | `ghcr.io/hanzoai/static:v0.2.0` |
| Image size | 16.4 MB (amd64) |
| Base image | scratch |
| Architectures | amd64, arm64 |
| Tags | v0.1.0, v0.1.1, v0.1.2, v0.2.0 |
| Default port | 3000 |
| Default root | /public |

CLI flags:
- `-port` (default 3000)
- `-root` (default /public)
- `-spa` (default false)
- `-s3-endpoint` / `S3_ENDPOINT`
- `-s3-bucket` / `S3_BUCKET`
- `-s3-region` / `S3_REGION` (default us-east-1)
- `-s3-prefix` / `S3_PREFIX`
- `AWS_ACCESS_KEY_ID` (env only)
- `AWS_SECRET_ACCESS_KEY` (env only)

Dual backend: serves from local filesystem by default; switches to S3 when `S3_BUCKET` is set.

Also functions as a Traefik v3 middleware plugin (Hanzo Ingress) with full `Config` struct support including SPA mode, directory listing, custom 404 pages, and per-extension cache control.

### hanzoai/spa

| Property | Value |
|----------|-------|
| Repo | github.com/hanzoai/spa |
| Language | Go 1.26.1 (stdlib only, zero dependencies) |
| Module | `github.com/hanzoai/spa` |
| Binary | `/spa` (single binary, scratch image) |
| Image | `ghcr.io/hanzoai/spa:1.0.0` (also `latest`) |
| Image size | 8.35 MB (amd64) |
| Base image | scratch |
| Architectures | amd64, arm64 |
| Tags | v1.0.0 |
| Default port | 3000 |
| Default root | /public |

Env vars:
- `PORT` (default 3000)
- `ROOT` (default /public)
- `MULTI_APP` (true/false, enables hostname-prefix routing)
- `DEFAULT_APP` (default superadmin)
- `ALLOW_FRAMING` (true/false, controls X-Frame-Options)

Multi-app mode routes by hostname prefix: `ats.example.com` -> `/public/ats/`, `bd.example.com` -> `/public/bd/`.

### hanzoai/cdn

| Property | Value |
|----------|-------|
| Repo | github.com/hanzoai/cdn |
| Purpose | Asset source files (committed to git, uploaded to R2) |
| Tags | v1.0.0 |

## 3. Asset Inventory

Total: **526 files**, **6.1 MB**

| Directory | Files | Size | Contents |
|-----------|-------|------|----------|
| brand/ | 48 | 288K | Hanzo logo variants (SVG, PNG, favicon, apple-touch, dock icons) |
| buttons/ | 24 | 116K | OAuth provider login button SVGs |
| flag-icons/ | 271 | 2.7M | ISO 3166-1 country flag SVGs |
| fonts/ | 5 | 232K | Inter + Roboto Mono web fonts (woff2) |
| iam/models/ | 0 | 0B | Face recognition models (placeholder, empty) |
| img/ | 97 | 1.4M | Social provider, payment, captcha, app logos |
| partners/ | 19 | 96K | Partner/ecosystem logos (AWS, NVIDIA, Techstars, etc.) |
| press/ | 17 | 84K | Press kit assets |
| providers/ | 45 | 1.2M | AI model provider icons (OpenAI, Anthropic, Mistral, etc.) |

File types by count: 382 SVG, 130 PNG, 5 woff2, 4 JPG, 3 MD, 1 ZIP, 1 ICO.

## 4. S3 Configuration (K8s path)

| Property | Value |
|----------|-------|
| Endpoint | `s3.hanzo.svc.cluster.local:9000` |
| Bucket | `cdn` |
| Region | `us-east-1` |
| SSL | false (in-cluster, no TLS) |
| Access pattern | `S3FS.Open(path)` -> `client.GetObject(bucket, key)` |
| Timeout | 10 seconds per object fetch |
| Credentials | K8s secret `s3-credentials` (keys: `access-key`, `secret-key`) |

The S3 client is `github.com/hanzos3/go-sdk v1.0.1` (Hanzo fork of MinIO Go SDK). Object data is read fully into memory (`io.ReadAll`) and wrapped in a `bytes.Reader` for `http.ServeContent`.

## 5. R2 Configuration (Production path)

| Property | Value |
|----------|-------|
| Bucket | `pub` |
| Binding | `CDN_BUCKET` (wrangler R2 binding) |
| Key layout | `<org>/<relative-path>` |
| Upload method | `wrangler r2 object put` per file |

## 6. Network

### DNS

All domains are Cloudflare-proxied. The Worker routes are defined in `wrangler.toml`:

| Domain | Zone |
|--------|------|
| cdn.hanzo.ai | hanzo.ai |
| cdn.lux.network | lux.network |
| cdn.zoo.ngo | zoo.ngo |
| cdn.pars.network | pars.network |

### K8s path DNS

| Record | Target |
|--------|--------|
| cdn.hanzo.ai | hanzo-k8s LB (24.199.76.156) |

### TLS

- **Production**: Cloudflare edge TLS (automatic, proxied mode)
- **K8s path**: cert-manager with `letsencrypt-prod` cluster issuer, secret `cdn-hanzo-ai-tls`

### Ports

| Component | Port | Protocol |
|-----------|------|----------|
| static container | 3000 | HTTP |
| cdn K8s Service | 80 -> 3000 | HTTP |
| Ingress | 443 (TLS termination) | HTTPS |

## 7. Cache Strategy

### cdn-worker (production)

Determined in `worker.js` lines 104-107:

| Condition | Cache-Control |
|-----------|--------------|
| Non-HTML, non-JSON files with extension | `public, max-age=31536000, immutable` (1 year) |
| HTML and JSON files | `public, max-age=3600, s-maxage=86400` (1h client, 24h edge) |
| 404 responses | `public, max-age=60` |

ETag-based conditional requests supported (If-None-Match -> 304).

### hanzoai/spa

| Condition | Cache-Control |
|-----------|--------------|
| index.html / SPA fallback | `no-cache, no-store, must-revalidate` |
| Hashed assets (filename contains 6+ char hash before extension) | `public, max-age=31536000, immutable` |
| Everything else | `public, max-age=86400` |

Pre-compressed Brotli (.br) and Gzip (.gz) files served automatically via Accept-Encoding negotiation.

### hanzoai/static

Per-extension cache control configured via `Config.CacheControl` map. Default fallback: `max-age=86400` (24 hours). `Last-Modified` header always set from file modtime.

## 8. Security

### cdn-worker

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
- `X-Content-Type-Options: nosniff`
- Only GET, HEAD, OPTIONS allowed (405 for anything else)
- CORS preflight handled with 204 + 86400 max-age

### hanzoai/static (standalone server)

Headers set in `securityHeaders()` middleware:

| Header | Value |
|--------|-------|
| Strict-Transport-Security | max-age=31536000; includeSubDomains |
| X-Content-Type-Options | nosniff |
| X-Frame-Options | DENY |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=() |
| Content-Security-Policy | default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' |
| Access-Control-Allow-Origin | * |
| Access-Control-Allow-Methods | GET, HEAD, OPTIONS |

### hanzoai/spa

Same header set as static, minus CSP default-src rule. Adds `Content-Security-Policy: frame-ancestors 'none'` when `ALLOW_FRAMING` is not true.

### Container Security

- Base image: `scratch` (no shell, no OS packages, no attack surface)
- File mode on S3 objects: 0444 (read-only)
- K8s resource limits: 128Mi memory limit, 50m CPU request, 32Mi memory request
- No capabilities, no privilege escalation (scratch default)

## 9. Dependencies

### hanzoai/static (go.mod)

| Module | Version | Notes |
|--------|---------|-------|
| github.com/hanzos3/go-sdk | v1.0.1 | Hanzo S3 SDK (MinIO fork) |
| github.com/klauspost/compress | v1.18.2 | indirect |
| github.com/klauspost/cpuid/v2 | v2.2.11 | indirect |
| github.com/klauspost/crc32 | v1.3.0 | indirect |
| github.com/hanzos3/crc64nvme | v1.1.1 | replaces minio/crc64nvme |
| github.com/hanzos3/md5-simd | v1.1.2 | replaces minio/md5-simd |
| github.com/google/uuid | v1.6.0 | indirect |
| github.com/rs/xid | v1.6.0 | indirect |
| golang.org/x/crypto | v0.46.0 | indirect |
| golang.org/x/net | v0.48.0 | indirect |

Module replacements (go.mod `replace` directives):
- `github.com/minio/crc64nvme` -> `github.com/hanzos3/crc64nvme v1.1.1`
- `github.com/minio/md5-simd` -> `github.com/hanzos3/md5-simd v1.1.2`

### hanzoai/spa (go.mod)

Zero external dependencies. Standard library only.

### cdn-worker (package.json)

| Package | Version |
|---------|---------|
| wrangler | ^4.0.0 |

## 10. Health / Probes

### hanzoai/static (K8s deployment)

| Probe | Type | Path | Port | Initial delay | Period |
|-------|------|------|------|---------------|--------|
| Readiness | httpGet | /flag-icons/US.svg | 3000 | 3s | 10s |
| Liveness | httpGet | /flag-icons/US.svg | 3000 | 10s | 30s |

No dedicated /health endpoint. Probes hit an actual asset to verify S3 connectivity end-to-end.

### hanzoai/spa

Dedicated health endpoint: `GET /health` -> `{"status":"ok"}` (200).

## 11. Repos and Tags

| Repo | URL | Current tag | Image |
|------|-----|-------------|-------|
| static | github.com/hanzoai/static | v0.2.0 | ghcr.io/hanzoai/static:v0.2.0 |
| spa | github.com/hanzoai/spa | v1.0.0 | ghcr.io/hanzoai/spa:1.0.0 |
| cdn | github.com/hanzoai/cdn | v1.0.0 | (asset repo, no image) |
| cdn-worker | github.com/hanzoai/cdn-worker | (untagged) | (Cloudflare Worker, no image) |

## 12. Measurements

| Metric | Value |
|--------|-------|
| Total CDN asset size | 6.1 MB |
| Total CDN file count | 526 |
| static image size (amd64) | 16.4 MB |
| spa image size (amd64) | 8.35 MB |
| static binary | ~16 MB (scratch image = binary only) |
| spa binary | ~8 MB (scratch image = binary only) |
| K8s replicas (cdn) | 2 |
| K8s memory limit | 128Mi |
| K8s CPU request | 50m |
| K8s memory request | 32Mi |

## 13. Deployment

### Production upload

```bash
cd ~/work/hanzo/cdn-worker
./upload.sh ~/work/hanzo/cdn/hanzo hanzo
```

This iterates every file, sets correct Content-Type, and calls `wrangler r2 object put pub/<prefix>/<path>`.

### Worker deploy

```bash
cd ~/work/hanzo/cdn-worker
npx wrangler deploy
```

### K8s deploy

Manifests are in `~/work/hanzo/universe/infra/k8s/cdn/`:
- `deployment.yaml` -- Deployment (2 replicas) + Service
- `ingress.yaml` -- Ingress for cdn.hanzo.ai with TLS
