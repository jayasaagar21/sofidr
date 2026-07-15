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
