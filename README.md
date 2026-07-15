[README.md](https://github.com/user-attachments/files/30045508/README.md)
# sofidr
A unique strategy based data output technique# SOFIDR

SOFIDR (Strategic Optimization Framework for Iterative Data Regeneration) compares leak-resistant preprocessing formations and selects a strategy using the Strategic Efficiency Index.

## Phase 1 scope

Included:

- Archetype selection
- CSV classification analysis through `POST /api/optimize`
- Formation and terrain reporting
- Static demos at `/demo.html` and `/client-demo.html`
- Live upload demo at `/dynamic-demo.html`
- Data-quality (`dq`) library with tests

Not included:

- Data-cleaning UI
- `/api/profile`
- `/api/clean`
- `/api/download`
- Persistent run storage

The `dq` package is library-only and has no HTTP endpoints.

## Local development

Requires Python 3.12 and Node.js.

```bash
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
pytest tests/ -q
uvicorn server.main:app --reload --port 8000
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

The Vite development server proxies `/api` to `localhost:8000`. Production requests use same-origin relative `/api` URLs.

## API

- `GET /api/health`
- `GET /api/archetypes`
- `GET /api/formations`
- `POST /api/optimize`

`/api/optimize` accepts either an `archetype` query parameter or a multipart CSV field named `file`. For CSV uploads, the final column is used as the target unless `target_column` is supplied.

## Deployment constraints

The target is Vercel Hobby at `sofidr.jayasaagarc.com`.

- Uploads are limited to 4 MB because Vercel caps function request and response bodies at approximately 4.5 MB.
- The frontend rejects oversized files before upload.
- Optimization uses at most 300 stratified rows, 20 random-forest estimators, three-fold validation, and no refinement iteration by default to stay within the Hobby timeout.
- Scientific Python dependencies make cold starts slower than warm requests.
- Knowledge written to `/tmp` is ephemeral and instance-local.

Deployment must not proceed unless local endpoint checks, the frontend build, all tests, and `/api/optimize` timing pass.

## DNS

The application is a separate Vercel project and must not alter the apex `jayasaagarc.com` records.

After the Vercel deployment works:

1. Add `sofidr.jayasaagarc.com` to the Vercel project.
2. Read the exact project-specific CNAME target from `vercel domains inspect`.
3. In Cloudflare, create only the `sofidr` CNAME using that exact target.
4. Set Proxy status to **DNS only** and TTL to Auto.

Do not use a generic or guessed Vercel CNAME.

