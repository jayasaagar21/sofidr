import io

import pandas as pd
from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def _csv(rows: int = 18, labels=(0, 1)) -> bytes:
    frame = pd.DataFrame(
        {
            "feature_a": [float(i) for i in range(rows)],
            "feature_b": [float((i * 7) % 11) for i in range(rows)],
            "target": [labels[i % len(labels)] for i in range(rows)],
        }
    )
    return frame.to_csv(index=False).encode()


def test_health_and_security_headers():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "1.0.0"}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


def test_metadata_endpoints_are_populated():
    archetypes = client.get("/api/archetypes")
    formations = client.get("/api/formations")
    assert archetypes.status_code == 200
    assert "breast_cancer" in archetypes.json()["archetypes"]
    assert formations.status_code == 200
    assert {"phalanx", "guerrilla", "reconnaissance"} <= set(formations.json())


def test_upload_accepts_negative_class_labels():
    response = client.post(
        "/api/optimize?model=logreg",
        files={"file": ("negative-labels.csv", io.BytesIO(_csv(labels=(-1, 1))), "text/csv")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["best_by_sei"]
    assert len(body["scoreboard"]) == 8


def test_upload_rejects_continuous_target():
    frame = pd.DataFrame(
        {
            "feature": range(20),
            "target": [i / 10 for i in range(20)],
        }
    )
    response = client.post(
        "/api/optimize",
        files={
            "file": (
                "regression.csv",
                io.BytesIO(frame.to_csv(index=False).encode()),
                "text/csv",
            )
        },
    )
    assert response.status_code == 400
    assert "discrete classes" in response.json()["detail"]


def test_upload_rejects_infinite_features():
    payload = b"feature,target\n1,0\n2,0\n3,0\n4,1\n5,1\ninf,1\n"
    response = client.post(
        "/api/optimize",
        files={"file": ("infinite.csv", io.BytesIO(payload), "text/csv")},
    )
    assert response.status_code == 400
    assert "infinite values" in response.json()["detail"]


def test_missing_input_is_a_client_error():
    response = client.post("/api/optimize")
    assert response.status_code == 400
    assert "Provide either" in response.json()["detail"]


def test_enhance_returns_parseable_attachment_and_metadata():
    frame = pd.DataFrame(
        {
            "feature_a": [float(i) for i in range(20)],
            "label": ["majority"] * 15 + ["minority"] * 5,
            "feature_b": [float((i * 3) % 7) for i in range(20)],
        }
    )
    response = client.post(
        "/api/enhance?formation=guerrilla&target_column=label",
        files={
            "file": (
                "source data.csv",
                io.BytesIO(frame.to_csv(index=False).encode()),
                "text/csv",
            )
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"] == (
        'attachment; filename="source_data-guerrilla-sofidr.csv"'
    )
    assert response.headers["x-sofidr-input-rows"] == "20"
    assert response.headers["x-sofidr-output-rows"] == "30"
    assert response.headers["x-sofidr-synthetic-rows"] == "10"
    assert response.headers["x-sofidr-removed-rows"] == "0"
    assert response.headers["x-sofidr-steps"] == "impute,smote,scale"

    enhanced = pd.read_csv(io.BytesIO(response.content))
    assert enhanced.columns.tolist() == [
        "feature_a", "feature_b", "label", "_sofidr_row_origin"
    ]
    assert enhanced["label"].value_counts().to_dict() == {
        "majority": 15,
        "minority": 15,
    }


def test_enhance_uses_all_rows_beyond_optimization_sample():
    response = client.post(
        "/api/enhance?formation=reconnaissance",
        files={"file": ("large.csv", io.BytesIO(_csv(rows=350)), "text/csv")},
    )

    assert response.status_code == 200
    assert response.headers["x-sofidr-input-rows"] == "350"
    assert response.headers["x-sofidr-output-rows"] == "350"
    assert len(pd.read_csv(io.BytesIO(response.content))) == 350


def test_enhance_rejects_unknown_formation_and_malformed_csv():
    unknown = client.post(
        "/api/enhance?formation=unknown",
        files={"file": ("data.csv", io.BytesIO(_csv()), "text/csv")},
    )
    malformed = client.post(
        "/api/enhance?formation=phalanx",
        files={"file": ("bad.csv", io.BytesIO(b'a,b\n1,"unterminated'), "text/csv")},
    )

    assert unknown.status_code == 400
    assert "Unknown formation" in unknown.json()["detail"]
    assert malformed.status_code == 400
    assert "Invalid CSV" in malformed.json()["detail"]


def test_enhance_requires_enough_rows_per_class_for_smote():
    frame = pd.DataFrame(
        {
            "feature": range(10),
            "target": [0] * 9 + [1],
        }
    )
    response = client.post(
        "/api/enhance?formation=guerrilla",
        files={"file": ("tiny-class.csv", io.BytesIO(frame.to_csv(index=False).encode()), "text/csv")},
    )

    assert response.status_code == 400
    assert "at least 2 rows" in response.json()["detail"]
