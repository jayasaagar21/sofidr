# SOFIDR

SOFIDR (Strategic Optimization Framework for Iterative Data Regeneration) compares leak-resistant preprocessing formations and selects a strategy using the Strategic Efficiency Index.

## Phase 1 scope

Included:

- Archetype selection
- Universal dataset cleaning through `POST /api/clean` for CSV, TSV, Excel, and JSON
- Enhanced dataset downloads in CSV, Excel, and JSON
- Classification analysis through `POST /api/optimize`
- Model-ready formation enhancement through `POST /api/enhance`
- Portable analysis reports through `POST /api/report` (JSON, HTML, PDF, Excel)
- Formation and terrain reporting
- Data-quality (`dq`) library with tests

Not included:

- Persistent run storage
- Files larger than the Vercel Hobby body limit (~4 MB)
- Binary/non-tabular formats outside CSV, TSV, Excel, and JSON

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

Uploads always run through cleaning first in the web app. `/api/clean` accepts CSV, TSV, Excel (`.xlsx`), or JSON and returns an enhanced dataset as `?format=csv|xlsx|json`.

`/api/optimize` accepts either an `archetype` query parameter or a multipart tabular file. For classification uploads, the final column is used as the target unless `target_column` is supplied.

`/api/enhance` accepts a classification dataset plus the deterministic `best_by_sei` formation and returns a model-ready export as CSV, Excel, or JSON.

`/api/report` accepts a successful optimization response and renders the analysis as JSON, standalone HTML, PDF, or Excel.

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
