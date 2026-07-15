# SOFIDR

SOFIDR (Strategic Optimization Framework for Iterative Data Regeneration) compares leak-resistant preprocessing formations and selects a strategy using the Strategic Efficiency Index.

## Phase 1 scope

Included:

- Archetype selection
- CSV classification analysis through `POST /api/optimize`
- Model-ready CSV enhancement through the deterministic best-by-SEI formation
- Automatic cleaning-only fallback for malformed mixed business CSVs without a target
- Formation and terrain reporting
- Static demos at `/demo.html` and `/client-demo.html`
- Live upload demo at `/dynamic-demo.html`
- Data-quality (`dq`) library with tests

Not included:

- Manual data-cleaning and profiling UI
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
- `POST /api/clean`
- `POST /api/enhance`
- `POST /api/report?format=json|html|pdf|xlsx`

`/api/optimize` accepts either an `archetype` query parameter or a multipart CSV field named `file`. For CSV uploads, the final column is used as the target unless `target_column` is supplied.

`/api/clean` repairs conservative structural and semantic quality issues without requiring a target: malformed split date fields, trailing empty columns, whitespace, missing sentinels, exact duplicates, common currency values, dates, names, emails, categories, country aliases, and implausible ages. It returns a human-readable cleaned CSV and quality metadata headers.

`/api/enhance` accepts the original multipart CSV plus the deterministic `best_by_sei` formation returned by `/api/optimize`. It applies that formation to the full numeric feature matrix and returns a downloadable model-ready CSV with the target and row-origin metadata.

`/api/report` accepts a successful optimization response and renders the analysis as JSON, standalone HTML, PDF, or Excel. The web results view exposes each format as a direct download.

## Deployment constraints

The target is Vercel Hobby at `sofidr.jayasaagarc.com`.

- Uploads are limited to 4 MB because Vercel caps function request and response bodies at approximately 4.5 MB.
- Enhanced CSV responses are checked against the same serverless response limit.
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
