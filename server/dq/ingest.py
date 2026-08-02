"""Universal tabular ingest for common business dataset formats."""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import HTTPException


SUPPORTED_UPLOAD_EXTENSIONS = {".csv", ".tsv", ".txt", ".xlsx", ".xlsm", ".json"}


def _extension(filename: str | None) -> str:
    return Path(filename or "dataset.csv").suffix.lower()


def _normalize_frame(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    frame.columns = [
        str(column).strip() or f"Unnamed_{index + 1}"
        for index, column in enumerate(frame.columns)
    ]
    # Drop completely empty trailing columns created by Excel/CSV exports.
    while len(frame.columns) and frame.iloc[:, -1].isna().all() and str(frame.columns[-1]).startswith("Unnamed"):
        frame = frame.iloc[:, :-1]
    frame = frame.replace(r"^\s*$", np.nan, regex=True)
    return frame


def _read_delimited(content: bytes, delimiter: str = ",") -> tuple[pd.DataFrame, list[str]]:
    try:
        text = content.decode("utf-8-sig")
        rows = list(csv.reader(io.StringIO(text), delimiter=delimiter, strict=True))
    except (UnicodeDecodeError, csv.Error) as exc:
        raise HTTPException(400, f"Invalid delimited file: {exc}") from exc
    if len(rows) < 2:
        raise HTTPException(400, "File must contain a header and at least one data row")

    raw_header = [value.strip() for value in rows[0]]
    while raw_header and not raw_header[-1]:
        raw_header.pop()
    width = len(raw_header)
    if not width:
        raise HTTPException(400, "File header is empty")
    header = [value or f"Unnamed_{index + 1}" for index, value in enumerate(raw_header)]
    date_indexes = [
        index
        for index, name in enumerate(header)
        if any(token in name.lower() for token in ("date", "time", "timestamp"))
    ]
    normalized: list[list[str]] = []
    repaired_rows = 0
    for line_number, row in enumerate(rows[1:], 2):
        while len(row) > width and not str(row[-1]).strip():
            row.pop()
        if len(row) > width:
            overflow = len(row) - width
            repaired = False
            for index in date_indexes:
                end = index + overflow + 1
                if end > len(row):
                    continue
                candidate = ",".join(row[index:end]).strip()
                normalized_date = candidate.replace(",", "-")
                if pd.notna(
                    pd.to_datetime(
                        normalized_date,
                        errors="coerce",
                        format="mixed",
                        dayfirst=True,
                    )
                ):
                    row = row[:index] + [normalized_date] + row[end:]
                    repaired = True
                    repaired_rows += 1
                    break
            if not repaired:
                raise HTTPException(
                    400,
                    f"Invalid file: row {line_number} has {len(row)} fields; expected {width}",
                )
        if len(row) < width:
            row = row + [""] * (width - len(row))
            repaired_rows += 1
        normalized.append(row)

    frame = _normalize_frame(pd.DataFrame(normalized, columns=header))
    for column in frame.columns:
        non_missing = frame[column].notna()
        if not non_missing.any():
            continue
        numeric = pd.to_numeric(frame[column], errors="coerce")
        if numeric[non_missing].notna().all():
            frame[column] = numeric
    steps = [f"repaired_{repaired_rows}_malformed_rows"] if repaired_rows else []
    return frame, steps


def _read_excel(content: bytes) -> tuple[pd.DataFrame, list[str]]:
    try:
        workbook = pd.read_excel(io.BytesIO(content), sheet_name=0, engine="openpyxl")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Invalid Excel file: {exc}") from exc
    if workbook is None or workbook.empty:
        raise HTTPException(400, "Excel sheet must contain a header and at least one data row")
    return _normalize_frame(workbook), ["read_first_excel_sheet"]


def _read_json(content: bytes) -> tuple[pd.DataFrame, list[str]]:
    try:
        text = content.decode("utf-8-sig")
        payload = json.loads(text)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(400, f"Invalid JSON file: {exc}") from exc

    records = payload
    if isinstance(payload, dict):
        for key in ("data", "records", "rows", "items", "results"):
            if isinstance(payload.get(key), list):
                records = payload[key]
                break
        else:
            if all(not isinstance(value, (list, dict)) for value in payload.values()):
                records = [payload]
            else:
                raise HTTPException(
                    400,
                    "JSON must be an array of objects or an object with a data/records array",
                )
    if not isinstance(records, list) or not records:
        raise HTTPException(400, "JSON must contain at least one data object")
    if not all(isinstance(item, dict) for item in records):
        raise HTTPException(400, "JSON rows must be objects with named fields")
    return _normalize_frame(pd.DataFrame.from_records(records)), ["read_json_records"]


def read_tabular(content: bytes, filename: str | None) -> tuple[pd.DataFrame, list[str]]:
    """Load CSV/TSV/Excel/JSON into a DataFrame with conservative repairs."""
    if not content:
        raise HTTPException(400, "Uploaded file is empty")
    extension = _extension(filename)
    if extension not in SUPPORTED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            400,
            "Unsupported file type. Upload CSV, TSV, Excel (.xlsx), or JSON.",
        )

    if extension in {".csv", ".txt"}:
        frame, steps = _read_delimited(content, ",")
        return frame, ["parsed_csv"] + steps
    if extension == ".tsv":
        frame, steps = _read_delimited(content, "\t")
        return frame, ["parsed_tsv"] + steps
    if extension in {".xlsx", ".xlsm"}:
        return _read_excel(content)
    return _read_json(content)
