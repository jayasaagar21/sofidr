"""
SOFIDR API backend (FastAPI).

This runs as a Vercel Function (via /api/index.py) but is structured
to move to a standalone server (Railway, Render, Fly) later. No production
dependencies on Vercel beyond the handler.

Environment variables (set in Vercel config, or a .env for local dev):
  SOFIDR_ENV: development | production
  MAX_FILE_SIZE_MB: 4 (default)
  MAX_OPTIMIZATION_ROWS: 300 (default)
"""

from __future__ import annotations

import io
import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedShuffleSplit
from sklearn.preprocessing import LabelEncoder

# Import SOFIDR from the local package
try:
    from sofidr import SOFIDRFramework, KnowledgeBase
    from sofidr.datasets import ARCHETYPES
    from sofidr.formations import FORMATIONS, enhance_dataset
    from sofidr.report import render
except ImportError:
    print("Warning: SOFIDR package not found. Install with: pip install -r requirements.txt")
    raise
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)
APP_VERSION = "1.0.0"
app = FastAPI(
    title="SOFIDR API",
    description="Leak-resistant classification preprocessing strategy analysis.",
    version=APP_VERSION,
)

# Production is same-origin. CORS is only needed by local Vite development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Disposition",
        "X-SOFIDR-Input-Rows",
        "X-SOFIDR-Input-Columns",
        "X-SOFIDR-Output-Rows",
        "X-SOFIDR-Output-Columns",
        "X-SOFIDR-Synthetic-Rows",
        "X-SOFIDR-Removed-Rows",
        "X-SOFIDR-Steps",
    ],
)

MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE_MB", 4)) * 1024 * 1024
MAX_ENHANCE_OUTPUT_SIZE = int(os.getenv("MAX_ENHANCE_OUTPUT_MB", 4)) * 1024 * 1024
MAX_OPTIMIZATION_ROWS = int(os.getenv("MAX_OPTIMIZATION_ROWS", 300))
KB_PATH = "/tmp/sofidr_kb.json"  # in-memory across Vercel invocations within a session


# --------------------------------------------------------------------------- #
# Request safety and observability
# --------------------------------------------------------------------------- #
@app.middleware("http")
async def request_context(request: Request, call_next):
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("Unhandled request failure", extra={"path": request.url.path})
        return JSONResponse(
            status_code=500,
            content={"detail": "SOFIDR could not complete this request. Please try again."},
        )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-Response-Time-Ms"] = f"{(time.perf_counter() - started) * 1000:.1f}"
    return response


@dataclass
class UploadedDataset:
    X: np.ndarray
    y: np.ndarray
    feature_names: list[str]
    target_name: str
    filename: str


async def _load_csv_upload(
    file: UploadFile,
    target_column: Optional[str],
    min_class_rows: int,
) -> UploadedDataset:
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large (max {MAX_FILE_SIZE / 1024 / 1024:.0f}MB)")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large (max {MAX_FILE_SIZE / 1024 / 1024:.0f}MB)")
    try:
        df = pd.read_csv(io.BytesIO(content))
    except (pd.errors.EmptyDataError, pd.errors.ParserError, UnicodeDecodeError) as exc:
        raise HTTPException(400, f"Invalid CSV: {exc}") from exc
    if df.empty or len(df.columns) < 2:
        raise HTTPException(400, "CSV must contain data, at least one feature, and a target column")

    target_name = target_column or str(df.columns[-1])
    if target_name not in df.columns:
        raise HTTPException(400, f"Target column not found: {target_name}")
    if df[target_name].isna().any():
        raise HTTPException(400, "Target column cannot contain missing values")

    y = df[target_name].to_numpy()
    if not (
        pd.api.types.is_object_dtype(y)
        or str(y.dtype).startswith("category")
        or pd.api.types.is_integer_dtype(y)
        or pd.api.types.is_bool_dtype(y)
    ):
        values = pd.Series(y).dropna().unique()
        if not all(float(value).is_integer() for value in values):
            raise HTTPException(400, "Target must contain discrete classes, not continuous values")

    numeric = df.drop(columns=[target_name]).select_dtypes(include="number")
    if numeric.shape[1] < 1:
        raise HTTPException(400, "CSV must contain at least one numeric feature column")
    X = numeric.to_numpy(dtype=float)
    if np.isinf(X).any():
        raise HTTPException(400, "Feature columns cannot contain infinite values")
    if len(X) < 10:
        raise HTTPException(400, "Dataset too small or invalid")

    class_counts = pd.Series(y).value_counts()
    if len(class_counts) < 2:
        raise HTTPException(400, "Target must contain at least two classes")
    if class_counts.min() < min_class_rows:
        raise HTTPException(
            400, f"Each target class must contain at least {min_class_rows} rows"
        )

    return UploadedDataset(
        X=X,
        y=y,
        feature_names=[str(name) for name in numeric.columns],
        target_name=target_name,
        filename=file.filename or "upload.csv",
    )


# --------------------------------------------------------------------------- #
# Response schemas
# --------------------------------------------------------------------------- #
class FormationResult(BaseModel):
    name: str
    sei: float
    accuracy: float
    stability: float
    retention: float
    simplicity: float
    error: str = ""


class OptimizeResponse(BaseModel):
    success: bool
    dataset_name: str
    terrain_tags: list[str]
    cold_start_default: str
    best_by_sei: str
    selected: str
    selection_reason: str
    scoreboard: list[FormationResult]
    report: str
    error: str = ""


# --------------------------------------------------------------------------- #
# API endpoints
# --------------------------------------------------------------------------- #
@app.get("/api/health")
async def health():
    return {"status": "ok", "version": APP_VERSION}


@app.get("/api/archetypes")
async def list_archetypes():
    return {
        "archetypes": list(ARCHETYPES.keys()),
        "descriptions": {
            "breast_cancer": "Real-world medical diagnosis (569 samples, balanced)",
            "high_dimensional": "Synthetic, d/n > 0.1 (300 samples, high-dim)",
            "imbalanced": "Synthetic, 85:15 class imbalance (500 samples)",
            "noisy_missing": "Synthetic, 8% missing values (400 samples)",
            "correlated": "Synthetic, 20 redundant features (350 samples)",
        }
    }


@app.get("/api/formations")
async def list_formations():
    from sofidr.formations import get_all, FORMATIONS
    out = {}
    for name in get_all():
        f = FORMATIONS[name]
        out[name] = {
            "icon": f.icon,
            "target_terrain": f.target_terrain,
            "paper": f.paper,
        }
    return out


@app.post("/api/optimize")
async def optimize(
    archetype: Optional[str] = Query(None),
    target_column: Optional[str] = Query(None),
    file: Optional[UploadFile] = File(None),
    model: str = Query("rf", pattern="^(rf|logreg)$"),
    iterations: int = Query(0, ge=0, le=1),
    epsilon: float = Query(0.15, ge=0.0, le=1.0),
):
    """Optimize preprocessing for a dataset.

    Either provide:
      - archetype: one of [breast_cancer, high_dimensional, imbalanced, noisy_missing, correlated]
      - file: a CSV with numeric columns (last is label unless ?target_column is set)
    """
    try:
        # Load data
        if archetype:
            if archetype not in ARCHETYPES:
                raise HTTPException(400, f"Unknown archetype: {archetype}")
            X, y = ARCHETYPES[archetype]()
            dataset_name = archetype
        elif file:
            upload = await _load_csv_upload(file, target_column, min_class_rows=3)
            X, y = upload.X, upload.y
            dataset_name = upload.filename
        else:
            raise HTTPException(400, "Provide either ?archetype or upload a file")

        if X.shape[0] < 10 or X.shape[1] < 1:
            raise HTTPException(400, "Dataset too small or invalid")

        # Terrain analysis uses bincount, so normalize every valid class label
        # (including negative/non-contiguous integers) to 0..n_classes-1.
        y = LabelEncoder().fit_transform(y)
        class_counts = pd.Series(y).value_counts()
        if len(class_counts) < 2:
            raise HTTPException(400, "Target must contain at least two classes")
        if class_counts.min() < 3:
            raise HTTPException(400, "Each target class must contain at least three rows")

        # Vercel Hobby has a short function timeout. Bound compute while
        # preserving class proportions and deterministic results.
        if len(y) > MAX_OPTIMIZATION_ROWS:
            splitter = StratifiedShuffleSplit(
                n_splits=1,
                train_size=MAX_OPTIMIZATION_ROWS,
                random_state=42,
            )
            keep, _ = next(splitter.split(X, y))
            X, y = X[keep], y[keep]
            dataset_name = f"{dataset_name} (stratified sample: {MAX_OPTIMIZATION_ROWS} rows)"

        # Run SOFIDR
        est = (
            RandomForestClassifier(n_estimators=20, n_jobs=1, random_state=42)
            if model == "rf"
            else __import__("sklearn.linear_model", fromlist=["LogisticRegression"]).LogisticRegression(max_iter=1000)
        )
        kb = KnowledgeBase(KB_PATH)
        fw = SOFIDRFramework(
            n_iterations=iterations,
            epsilon=epsilon,
            base_estimator=est,
            knowledge=kb,
            persist=True,
        )
        result = fw.execute(X, y)

        # Format response
        scoreboard = [
            FormationResult(
                name=res.formation,
                sei=round(res.sei, 4),
                accuracy=round(res.accuracy, 4),
                stability=round(res.stability, 4),
                retention=round(res.retention, 3),
                simplicity=round(res.simplicity, 3),
                error=res.error,
            )
            for res in result.ranked()
        ]

        return OptimizeResponse(
            success=True,
            dataset_name=dataset_name,
            terrain_tags=result.terrain.tags(),
            cold_start_default=result.cold_start_default,
            best_by_sei=result.best_by_sei,
            selected=result.selected,
            selection_reason=result.selection_reason,
            scoreboard=scoreboard,
            report=render(result, dataset_name=dataset_name),
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Optimization failed")
        raise HTTPException(
            status_code=500,
            detail="Optimization failed. Check the dataset and try again.",
        ) from exc


@app.post("/api/enhance")
async def enhance(
    formation: str = Query(...),
    target_column: Optional[str] = Query(None),
    file: UploadFile = File(...),
):
    """Apply a registered formation to every row of an uploaded CSV."""
    if formation not in FORMATIONS:
        raise HTTPException(400, f"Unknown formation: {formation}")

    upload = await _load_csv_upload(file, target_column, min_class_rows=2)
    try:
        result = enhance_dataset(
            formation,
            upload.X,
            upload.y,
            upload.feature_names,
            upload.target_name,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Enhancement failed")
        raise HTTPException(
            500, "Enhancement failed. Check the dataset and formation."
        ) from exc

    payload = result.dataframe.to_csv(index=False).encode("utf-8")
    if len(payload) > MAX_ENHANCE_OUTPUT_SIZE:
        raise HTTPException(
            413,
            "Enhanced CSV exceeds the maximum response size "
            f"({MAX_ENHANCE_OUTPUT_SIZE / 1024 / 1024:.0f}MB)",
        )

    stem = os.path.splitext(os.path.basename(upload.filename))[0] or "upload"
    safe_stem = "".join(char if char.isalnum() or char in "-_" else "_" for char in stem)
    filename = f"{safe_stem}-{formation}-sofidr.csv"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-SOFIDR-Input-Rows": str(result.input_rows),
        "X-SOFIDR-Input-Columns": str(result.input_columns),
        "X-SOFIDR-Output-Rows": str(result.output_rows),
        "X-SOFIDR-Output-Columns": str(result.output_columns),
        "X-SOFIDR-Synthetic-Rows": str(result.synthetic_rows),
        "X-SOFIDR-Removed-Rows": str(result.removed_rows),
        "X-SOFIDR-Steps": ",".join(result.steps),
    }
    return StreamingResponse(
        iter([payload]),
        media_type="text/csv",
        headers=headers,
    )


# Health check for Vercel
@app.get("/")
async def root():
    return {"message": "SOFIDR API is running"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
