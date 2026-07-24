"""
BharatScore API — Email/password authentication + JWT.
"""

# ── Standard library ──────────────────────────────────────────────────────────
import os
import json
import re
import subprocess
import traceback
import uuid
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import unquote

# ── Third-party ───────────────────────────────────────────────────────────────
import joblib
import pandas as pd
import pymongo
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

# ── Internal ──────────────────────────────────────────────────────────────────
from auth import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from inference_utils import aggregate_user_scores, infer_user, pd_to_tier

# ── Environment ───────────────────────────────────────────────────────────────
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017").strip()
print("[OK] Email/password auth enabled (JWT)")

# ── Auth helpers ──────────────────────────────────────────────────────────────
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Verifies BharatScore JWTs issued after email/password login."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Unauthorized — no token provided")

    token = credentials.credentials

    payload = decode_access_token(token)
    if payload:
        return payload

    raise HTTPException(status_code=401, detail="Unauthorized — invalid or expired token")


# ── MongoDB ───────────────────────────────────────────────────────────────────
mongo_client = pymongo.MongoClient(MONGO_URI)
db = mongo_client["bharatscore"]
users_coll = db["users"]


# ── Ollama helper (optional, falls back gracefully) ───────────────────────────
def ollama_generate(prompt: str, model: str = "mistral") -> str:
    try:
        result = subprocess.run(
            ["ollama", "run", model],
            input=prompt.encode("utf-8"),
            capture_output=True,
            check=True,
            timeout=60,
        )
        return result.stdout.decode("utf-8").strip()
    except Exception as exc:
        return f"[AI insight unavailable: {exc}]"


# ── Feature KB ────────────────────────────────────────────────────────────────
try:
    with open("feature_explanations.json") as fh:
        feature_kb = json.load(fh)
except FileNotFoundError:
    feature_kb = {}


def retrieve_explanations(top_shap):
    return [feature_kb[f["feature"]] for f in top_shap if f["feature"] in feature_kb]


# ── Model loading ─────────────────────────────────────────────────────────────
class SimpleInference:
    def __init__(self, preprocessor, calibrated_clf):
        self.pre = preprocessor
        self.clf = calibrated_clf

    def predict_proba(self, X):
        return self.clf.predict_proba(self.pre.transform(X))

    def predict(self, X, thr=0.5):
        return (self.predict_proba(X)[:, 1] >= thr).astype(int)


try:
    bundle = joblib.load("artifacts/bharatscore_pipeline_bundle.pkl")
    inference = SimpleInference(bundle["preprocessor"], bundle["calibrated_clf"])
    explainer = bundle["explainer"]
    feature_names = bundle["feature_names"]
    print("[OK] Models loaded successfully!")
except Exception as exc:
    print(f"[ERROR] Error loading models: {exc}")
    traceback.print_exc()
    bundle = inference = explainer = feature_names = None


# ── Utility helpers ───────────────────────────────────────────────────────────
def ensure_consistent_output(result: dict) -> dict:
    return {
        **result,
        "final_cibil_score": result.get("final_cibil_score") or result.get("alt_cibil_score"),
        "final_tier": result.get("final_tier") or result.get("tier"),
        "loan_approval_probability": result.get("loan_approval_probability")
        or (1 - result.get("pd", 0)),
    }


def normalize_model_output(app):
    model_output = app.get("model_output", app)
    return {
        "final_cibil_score": model_output.get("final_cibil_score"),
        "final_tier": model_output.get("final_tier"),
        "loan_approval_probability": model_output.get("loan_approval_probability"),
    }


def _normalize_ts(value: str) -> str:
    """Normalize ISO timestamp strings for fuzzy comparison."""
    return (
        value.replace("Z", "")
        .replace("+00:00", "")
        .replace(" ", "T")
        .rstrip("0")
        .rstrip(".")
    )


def find_application_by_timestamp(user_id: str, timestamp_str: str):
    """
    Locate a loan application by user_id + created timestamp.
    Handles datetime objects in MongoDB and ISO strings from the frontend.
    Returns (application_doc, created_value_as_stored) or (None, None).
    """
    decoded = unquote(timestamp_str).strip()
    target_norm = _normalize_ts(decoded)
    target_prefix = decoded[:19].replace(" ", "T")

    apps = list(
        users_coll.find({"user_id": user_id, "raw": {"$exists": True}})
    )
    for app in apps:
        created = app.get("created")
        if created is None:
            continue

        if isinstance(created, datetime):
            iso = created.isoformat()
            candidates = [
                iso,
                iso + "Z",
                created.strftime("%Y-%m-%dT%H:%M:%S.%f"),
                created.strftime("%Y-%m-%dT%H:%M:%S"),
            ]
            for cand in candidates:
                if cand == decoded or _normalize_ts(cand) == target_norm:
                    return app, created
            if iso[:19] == target_prefix or created.strftime("%Y-%m-%dT%H:%M:%S") == target_prefix:
                return app, created
        else:
            created_str = str(created)
            if (
                created_str == decoded
                or _normalize_ts(created_str) == target_norm
                or created_str[:19] == target_prefix
            ):
                return app, created

    return None, None


def generate_remark(application_data):
    explanations = retrieve_explanations(application_data.get("top_shap", []))
    explanations_text = "\n".join([f"- {e}" for e in explanations])
    prompt = f"""
You are a loan assessment AI assistant.
Generate a professional remark (2–3 sentences) for a loan application.

Application Details:
- Applicant: {application_data.get("name", "Unknown")}
- Loan Amount: ₹{application_data.get("loan_amount_requested", "N/A")}
- Decision: {application_data.get("decision", "N/A")}

AI Assessment:
- Credit Score: {application_data.get("alt_cibil_score", "N/A")}
- Risk Tier: {application_data.get("tier", "N/A")}
- Approval Probability: {round((1 - application_data.get("pd", 0)) * 100, 1)}%

SHAP Feature Explanations:
{explanations_text}

Guidelines: Mention the decision (Approved/Rejected/Review). Highlight 1–2 important SHAP features.
Keep it professional and easy for a non-technical person to understand.
"""
    return ollama_generate(prompt, model="mistral")


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="Bharat Score API", version="2.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _error_json(status_code: int, message: str, detail=None) -> JSONResponse:
    """Always return a JSON error body (never empty / 204)."""
    body = {
        "success": False,
        "message": message,
        "detail": detail if detail is not None else message,
    }
    return JSONResponse(status_code=status_code, content=body)


def _json_safe(value):
    """Recursively convert Mongo/BSON values into JSON-serializable types."""
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat() + ("Z" if value.tzinfo is None else "")
    if isinstance(value, ObjectId):
        return str(value)
    return value


def _public_user(doc: Optional[dict]) -> Optional[dict]:
    """Strip secrets and oversized blobs before returning a user in JSON."""
    if not doc:
        return None
    out = _json_safe(doc)
    out.pop("password_hash", None)
    out.pop("_id", None)
    profile = out.get("profile")
    if isinstance(profile, dict):
        # Keep response small — images stay in DB, not in the save response.
        profile.pop("aadhaar_front_image", None)
        profile.pop("aadhaar_back_image", None)
    return out


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, list):
        message = "Validation failed"
    elif isinstance(detail, dict):
        message = str(detail.get("message") or detail.get("detail") or detail)
    else:
        message = str(detail)
    return _error_json(exc.status_code, message, detail)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    return _error_json(422, "Validation failed", exc.errors())


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception):
    traceback.print_exc()
    return _error_json(500, "Internal server error", str(exc))


# ═══════════════════════════════════════════════════════════════════════════════
# Pydantic Models
# ═══════════════════════════════════════════════════════════════════════════════

class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class ProfileRequest(BaseModel):
    user_id: str
    name: str
    gender: str
    state: str
    occupation: str
    # Extended fields (optional, stored when provided)
    email: Optional[str] = None
    phone: Optional[str] = None
    aadhaar_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None
    date_of_birth: Optional[str] = None
    # Base64-encoded Aadhaar card images (optional)
    aadhaar_front_image: Optional[str] = None
    aadhaar_back_image: Optional[str] = None


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class OnboardRequest(BaseModel):
    user_id: str
    user_type: str
    region: str
    sms_count: float
    bill_on_time_ratio: Optional[float] = None
    recharge_freq: float
    sim_tenure: float
    location_stability: float
    income_signal: float
    coop_score: float
    land_verified: int
    age_group: str
    loan_amount_requested: float
    recharge_pattern: str
    loan_category: str
    psychometric_score: float
    consent: bool = True
    status: Optional[str] = None  # allows frontend to pass status


class InputData(BaseModel):
    user_type: str
    region: str
    sms_count: float
    bill_on_time_ratio: float
    recharge_freq: float
    sim_tenure: float
    location_stability: float
    income_signal: float
    coop_score: float
    land_verified: int
    age_group: str
    loan_amount_requested: float
    recharge_pattern: str
    loan_category: str
    psychometric_score: float


class PsychometricScoreRequest(BaseModel):
    user_id: str
    psychometric_score: float


class ApplicationUpdateRequest(BaseModel):
    status: str
    remarks: Optional[str] = ""
    admin_notes: Optional[str] = ""


class AIInsightRequest(BaseModel):
    user_id: str
    application_created: str


# ═══════════════════════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _auth_response(user_doc: dict) -> dict:
    user_id = user_doc["user_id"]
    email = user_doc.get("email", "")
    name = user_doc.get("name", "")
    token = create_access_token(
        data={
            "sub": user_id,
            "email": email,
            "name": name,
            "auth_provider": "email",
        }
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user_id,
        "email": email,
        "name": name,
        "has_profile": bool(user_doc.get("has_profile")),
    }


@app.post("/auth/register")
def register(req: RegisterRequest):
    """Create a new user with email + bcrypt-hashed password. Returns JWT."""
    email = _normalize_email(req.email)
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email address")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = users_coll.find_one({"email": email, "raw": {"$exists": False}})
    if existing and existing.get("password_hash"):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user_id = f"user_{uuid.uuid4().hex}"
    doc = {
        "user_id": user_id,
        "email": email,
        "name": name,
        "password_hash": hash_password(req.password),
        "auth_provider": "email",
        "has_profile": False,
        "created_at": datetime.utcnow(),
    }
    users_coll.insert_one(doc)
    return _auth_response(doc)


@app.post("/auth/login")
def login(req: LoginRequest):
    """Authenticate with email + password. Returns JWT."""
    email = _normalize_email(req.email)
    user = users_coll.find_one({"email": email, "raw": {"$exists": False}})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    users_coll.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.utcnow()}},
    )
    return _auth_response(user)


@app.get("/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    """Return current user info from JWT payload."""
    return current_user


@app.post("/auth/admin/login")
def admin_login(req: AdminLoginRequest):
    """Validate admin credentials from environment and return a short-lived admin JWT."""
    admin_user = os.getenv("ADMIN_USERNAME", "admin")
    admin_pass = os.getenv("ADMIN_PASSWORD", "hackathon123")
    if req.username != admin_user or req.password != admin_pass:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    token = create_access_token(
        data={"sub": "admin", "role": "admin", "username": req.username},
        expires_delta=timedelta(hours=12),
    )
    return {"access_token": token, "token_type": "bearer", "role": "admin"}


# ═══════════════════════════════════════════════════════════════════════════════
# PROFILE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/profile")
def create_or_update_profile(
    req: ProfileRequest,
    current_user: dict = Depends(get_current_user),
):
    # Ensure the JWT subject matches the profile being written
    token_uid = current_user.get("sub")
    if token_uid and token_uid != req.user_id:
        raise HTTPException(status_code=403, detail="Cannot update another user's profile")

    if not (req.name or "").strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if not (req.gender or "").strip():
        raise HTTPException(status_code=400, detail="Gender is required")
    if not (req.state or "").strip():
        raise HTTPException(status_code=400, detail="State is required")
    if not (req.occupation or "").strip():
        raise HTTPException(status_code=400, detail="Occupation is required")

    try:
        profile_doc = {
            "name": req.name.strip(),
            "gender": req.gender.strip(),
            "state": req.state.strip(),
            "occupation": req.occupation.strip(),
        }
        if req.email:
            profile_doc["email"] = req.email
        if req.phone:
            profile_doc["phone"] = req.phone
        if req.aadhaar_number:
            profile_doc["aadhaar_number"] = req.aadhaar_number
        if req.address:
            profile_doc["address"] = req.address
        if req.city:
            profile_doc["city"] = req.city
        if req.pincode:
            profile_doc["pincode"] = req.pincode
        if req.date_of_birth:
            profile_doc["date_of_birth"] = req.date_of_birth
        if req.aadhaar_front_image:
            profile_doc["aadhaar_front_image"] = req.aadhaar_front_image
        if req.aadhaar_back_image:
            profile_doc["aadhaar_back_image"] = req.aadhaar_back_image

        doc = {
            "user_id": req.user_id,
            "profile": profile_doc,
            "has_profile": True,
            "profile_updated_at": datetime.utcnow(),
        }
        # Prefer the account document (no loan `raw` payload). Avoid upsert with
        # `$exists` filters — they can create duplicate user_id docs.
        result = users_coll.update_one(
            {"user_id": req.user_id, "raw": {"$exists": False}},
            {"$set": doc},
        )
        if result.matched_count == 0:
            users_coll.update_one(
                {"user_id": req.user_id},
                {"$set": doc, "$setOnInsert": {"created_at": datetime.utcnow()}},
                upsert=True,
            )

        user = users_coll.find_one(
            {"user_id": req.user_id, "raw": {"$exists": False}},
            {"_id": 0, "password_hash": 0},
        )
        if not user:
            user = users_coll.find_one(
                {"user_id": req.user_id},
                {"_id": 0, "password_hash": 0},
            )

        public = _public_user(user) or {
            "user_id": req.user_id,
            "profile": {
                k: v
                for k, v in profile_doc.items()
                if k not in ("aadhaar_front_image", "aadhaar_back_image")
            },
            "has_profile": True,
        }

        # Explicit JSONResponse — never 204 / empty body on success.
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Profile saved successfully",
                "user": public,
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save profile: {exc}")


@app.get("/profile")
def get_profile(user_id: str):
    proj = {"_id": 0, "profile": 1, "has_profile": 1, "user_id": 1}
    user = users_coll.find_one({"user_id": user_id}, proj)
    if user and user.get("profile"):
        return {"profile": user["profile"], "has_profile": True}
    return {"profile": None, "has_profile": False}


# ═══════════════════════════════════════════════════════════════════════════════
# ONBOARDING
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/onboard")
def onboard(req: OnboardRequest, current_user: dict = Depends(get_current_user)):
    token_uid = current_user.get("sub")
    if token_uid and token_uid != req.user_id:
        raise HTTPException(status_code=403, detail="Cannot submit application for another user")

    if req.bill_on_time_ratio is None:
        req.bill_on_time_ratio = 0.0

    raw = req.dict()
    # Keep identity outside the model feature payload
    raw.pop("status", None)
    raw.pop("user_id", None)
    raw.pop("consent", None)

    doc = {
        "user_id": req.user_id,
        "raw": raw,
        "created": datetime.utcnow(),
        "status": "received",
    }
    inserted_id = users_coll.insert_one(doc).inserted_id
    return {
        "mongo_id": str(inserted_id),
        "user_id": req.user_id,
        "status": "stored",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PREDICTION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/predict")
def predict(data: InputData):
    if inference is None:
        return {"error": "Model not loaded"}
    try:
        df = pd.DataFrame([data.dict()])
        result = infer_user(df, inference, explainer, feature_names, top_k_shap=5)
        return ensure_consistent_output(result)
    except Exception as exc:
        return {"error": str(exc), "details": traceback.format_exc()}


@app.get("/predict/{user_id}")
def predict_existing_user(user_id: str):
    if inference is None:
        return {"error": "Model not loaded"}
    user = users_coll.find_one({"_id": ObjectId(user_id)})
    if not user:
        return {"error": "User not found"}
    df = pd.DataFrame([user["raw"]])
    result = infer_user(df, inference, explainer, feature_names, top_k_shap=5)
    users_coll.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"prediction": result, "status": "predicted"}},
    )
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# PSYCHOMETRIC ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/save-psychometric")
def save_psychometric_score(
    req: PsychometricScoreRequest,
    current_user: dict = Depends(get_current_user),
):
    token_uid = current_user.get("sub")
    if token_uid and token_uid != req.user_id:
        raise HTTPException(status_code=403, detail="Cannot save score for another user")

    if not (0 <= req.psychometric_score <= 1):
        raise HTTPException(status_code=400, detail="Score must be between 0 and 1")
    now = datetime.utcnow()
    # Prefer updating the account/profile document (no loan raw payload)
    result = users_coll.update_one(
        {"user_id": req.user_id, "raw": {"$exists": False}},
        {"$set": {"psychometric_score": req.psychometric_score, "psychometric_taken_at": now}},
    )
    if result.matched_count == 0:
        users_coll.update_one(
            {"user_id": req.user_id},
            {"$set": {"psychometric_score": req.psychometric_score, "psychometric_taken_at": now}},
            upsert=True,
        )
    return {
        "status": "saved",
        "user_id": req.user_id,
        "score": req.psychometric_score,
        "taken_at": now,
    }


@app.get("/psychometric-status")
def psychometric_status(user_id: str):
    # Check account doc first, then any doc for this user
    user = users_coll.find_one({"user_id": user_id, "psychometric_score": {"$exists": True}})
    if not user:
        return {"completed": False}
    return {
        "completed": True,
        "score": user["psychometric_score"],
        "last_test_date": user["psychometric_taken_at"].isoformat()
        if isinstance(user.get("psychometric_taken_at"), datetime)
        else None,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# USER DATA ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

REQUIRED_FIELDS = {
    "user_type", "region", "sms_count", "bill_on_time_ratio", "recharge_freq",
    "sim_tenure", "location_stability", "income_signal", "coop_score",
    "land_verified", "age_group", "loan_amount_requested", "recharge_pattern",
    "loan_category", "psychometric_score",
}


@app.get("/users")
def get_user_data(user_id: str):
    apps_cursor = users_coll.find(
        {"user_id": user_id, "raw": {"$exists": True}}, {"_id": 0}
    )
    applications = list(apps_cursor)
    if not applications:
        # No loan apps yet — return empty scoring payload (not 404)
        return {
            "applications": [],
            "final_cibil_score": None,
            "final_tier": None,
            "loan_count": 0,
            "loan_approval_probability": None,
        }

    if inference is None:
        raise HTTPException(status_code=503, detail="Scoring model not loaded")

    loan_results = []
    for app in applications:
        raw_data = app.get("raw")
        if not raw_data:
            continue
        if not REQUIRED_FIELDS.issubset(raw_data.keys()):
            print("Skipping app due to missing fields")
            continue
        df = pd.DataFrame([raw_data])
        result = infer_user(df, inference, explainer, feature_names, top_k_shap=5)
        result = ensure_consistent_output(result)
        result["loan_amount_requested"] = raw_data.get("loan_amount_requested", 0)
        created = app.get("created")
        if isinstance(created, datetime):
            created = created.isoformat()
        result["created"] = created
        result["status"] = app.get("status")
        loan_results.append(result)

    if not loan_results:
        return {
            "applications": [],
            "final_cibil_score": None,
            "final_tier": None,
            "loan_count": 0,
            "loan_approval_probability": None,
        }

    aggregated = aggregate_user_scores(loan_results)
    return {
        "applications": loan_results,
        "final_cibil_score": aggregated["final_cibil_score"],
        "final_tier": aggregated["final_tier"],
        "loan_count": aggregated["loan_count"],
        "loan_approval_probability": aggregated.get("loan_approval_probability"),
    }


@app.get("/user/applications/{user_id}")
def get_user_applications_with_notifications(user_id: str):
    """Get user applications with latest notification status."""
    try:
        applications = list(
            users_coll.find(
                {"user_id": user_id, "raw": {"$exists": True}},
                {
                    "_id": 0,
                    "created": 1,
                    "status": 1,
                    "raw": 1,
                    "model_output": 1,
                    "user_notification": 1,
                    "admin_remarks": 1,
                    "admin_notes": 1,
                    "status_updated_at": 1,
                    "status_updated_by": 1,
                },
            )
            .sort("created", -1)
            .limit(50)
        )

        for app in applications:
            if "created" in app and isinstance(app["created"], datetime):
                app["created"] = app["created"].isoformat()
            if "status_updated_at" in app and isinstance(app["status_updated_at"], datetime):
                app["status_updated_at"] = app["status_updated_at"].isoformat()
            if "user_notification" in app:
                notif = app["user_notification"]
                if isinstance(notif.get("timestamp"), datetime):
                    notif["timestamp"] = notif["timestamp"].isoformat()

        return {"applications": applications, "total_count": len(applications)}
    except Exception as exc:
        print(f"Error fetching applications: {exc}")
        return {"applications": [], "total_count": 0, "error": str(exc)}


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/applications-summary")
def admin_applications_summary():
    # Only count / list loan application documents (those with raw payload)
    pipeline = [
        {"$match": {"raw": {"$exists": True}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    counts = list(users_coll.aggregate(pipeline))
    total = sum(c["count"] for c in counts)
    summary = {"total_applications": total, "pending": 0, "approved": 0, "issues": 0}
    for c in counts:
        if c["_id"] in ["received", "pending", None]:
            summary["pending"] += c["count"]
        elif c["_id"] == "approved":
            summary["approved"] += c["count"]
        elif c["_id"] in ["issue", "rejected"]:
            summary["issues"] += c["count"]

    cursor = users_coll.find(
        {"raw": {"$exists": True}},
        {
            "_id": 0,
            "user_id": 1,
            "status": 1,
            "created": 1,
            "raw.loan_amount_requested": 1,
        },
    ).sort("created", -1)

    # Prefetch profiles for display names
    profile_map = {}
    for pdoc in users_coll.find(
        {"profile": {"$exists": True}},
        {"_id": 0, "user_id": 1, "profile.name": 1},
    ):
        profile_map[pdoc.get("user_id")] = (pdoc.get("profile") or {}).get("name")

    applicants = []
    for doc in cursor:
        created = doc.get("created")
        if isinstance(created, datetime):
            created = created.isoformat()
        uid = doc.get("user_id")
        applicants.append(
            {
                "user_id": uid,
                "name": profile_map.get(uid) or "Unknown",
                "status": doc.get("status", "pending"),
                "created": created,
                "loan_amount_requested": doc.get("raw", {}).get("loan_amount_requested", 0),
            }
        )

    summary["applicants"] = applicants
    return summary


@app.get("/admin/applications/{user_id}")
def admin_application_detail(user_id: str):
    user_docs = list(users_coll.find({"user_id": user_id}))
    if not user_docs:
        raise HTTPException(status_code=404, detail="No applications found for this user")

    # Prefer the dedicated profile document
    profile = {}
    for d in user_docs:
        if d.get("profile"):
            profile = d["profile"]
            break

    applications = []

    for app in user_docs:
        raw_data = app.get("raw")
        if not raw_data:
            continue

        model_result = app.get("model_output")
        if not model_result:
            try:
                df = pd.DataFrame([raw_data])
                model_result = infer_user(df, inference, explainer, feature_names, top_k_shap=5)
                users_coll.update_one(
                    {"_id": app["_id"]}, {"$set": {"model_output": model_result}}
                )
            except Exception as exc:
                model_result = {"error": str(exc)}
            model_result = ensure_consistent_output(model_result)

        created = app.get("created")
        if isinstance(created, datetime):
            created = created.isoformat()

        user_notif = app.get("user_notification", {})
        if isinstance(user_notif.get("timestamp"), datetime):
            user_notif["timestamp"] = user_notif["timestamp"].isoformat()

        applications.append(
            {
                "raw": raw_data,
                "model_output": model_result,
                "created": created,
                "status": app.get("status", "pending"),
                "ai_insight": app.get("ai_insight", ""),
                "admin_remarks": app.get("admin_remarks", ""),
                "admin_notes": app.get("admin_notes", ""),
                "user_notification": user_notif,
            }
        )

    return {
        "user_id": user_id,
        "profile": profile,
        "applications": applications,
    }


@app.patch("/admin/applications/{user_id}/{created_timestamp}")
def update_application_status(
    user_id: str,
    created_timestamp: str,
    update_req: ApplicationUpdateRequest,
):
    valid_status = {"approved", "rejected", "issue", "pending"}
    if update_req.status not in valid_status:
        raise HTTPException(
            status_code=400, detail=f"Invalid status. Allowed: {valid_status}"
        )

    application, matched_timestamp = find_application_by_timestamp(
        user_id, created_timestamp
    )
    if not application:
        all_apps = list(
            users_coll.find({"user_id": user_id}, {"created": 1, "_id": 0})
        )
        available = [str(a.get("created", "")) for a in all_apps]
        raise HTTPException(
            status_code=404,
            detail=f"Application not found. Available: {available}. Searched: {unquote(created_timestamp)}",
        )

    status_messages = {
        "approved": "Congratulations! Your loan application has been approved. Please visit the nearest branch for document verification and loan disbursement.",
        "rejected": "Your loan application has been declined. Please contact our support team for more information.",
        "issue": "Your application requires additional review. Our team will contact you shortly with next steps.",
        "pending": "Your application is under review. We will update you on the progress soon.",
    }

    now = datetime.utcnow()
    update_doc = {
        "status": update_req.status,
        "admin_remarks": update_req.remarks,
        "admin_notes": update_req.admin_notes,
        "status_updated_at": now,
        "status_updated_by": "admin",
        "user_notification": {
            "message": status_messages.get(
                update_req.status, "Your application status has been updated."
            ),
            "timestamp": now,
            "read": False,
        },
    }

    result = users_coll.update_one(
        {"_id": application["_id"]},
        {"$set": update_doc},
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Failed to update application")

    created_out = matched_timestamp
    if isinstance(created_out, datetime):
        created_out = created_out.isoformat()

    return {
        "message": "Application updated successfully",
        "user_id": user_id,
        "created": created_out,
        "new_status": update_req.status,
        "admin_remarks": update_req.remarks,
        "user_notification": {**update_doc["user_notification"], "timestamp": now.isoformat()},
    }


@app.post("/admin/generate-insight")
async def generate_ai_insight(req: AIInsightRequest):
    app = users_coll.find_one(
        {"user_id": req.user_id, "created": req.application_created}
    )
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    raw_data = app.get("raw")
    if not raw_data:
        raise HTTPException(status_code=400, detail="No application data found")

    try:
        df = pd.DataFrame([raw_data])
        model_result = infer_user(df, inference, explainer, feature_names, top_k_shap=5)
    except Exception as exc:
        return {"error": f"Model prediction failed: {str(exc)}"}

    profile = app.get("profile", {})
    applicant_name = profile.get("name", "Unknown User")

    insight = f"AI Assessment for {applicant_name}:\n\n"
    score = model_result.get("final_cibil_score") or model_result.get("alt_cibil_score")
    if score:
        insight += f"• Bharat Credit Score: {score}/1000 "
        if score >= 700:
            insight += "(Excellent creditworthiness)\n"
        elif score >= 600:
            insight += "(Good creditworthiness)\n"
        elif score >= 400:
            insight += "(Fair creditworthiness - requires careful evaluation)\n"
        else:
            insight += "(Poor creditworthiness - high risk)\n"

    prob = model_result.get("loan_approval_probability") or (1 - model_result.get("pd", 0))
    if prob is not None:
        insight += f"• Approval Probability: {prob * 100:.1f}%\n"

    tier = model_result.get("final_tier") or model_result.get("tier")
    if tier:
        insight += f"• Risk Category: {tier}\n"

    insight += "\nAI Recommendation: "
    if prob is not None:
        if prob >= 0.7:
            insight += "APPROVE - Strong candidate with low risk profile"
        elif prob >= 0.4:
            insight += "REVIEW - Moderate risk, consider additional verification"
        else:
            insight += "HIGH RISK - Requires careful manual assessment"

    users_coll.update_one(
        {"user_id": req.user_id, "created": req.application_created},
        {
            "$set": {
                "ai_insight": insight,
                "ai_insight_generated_at": datetime.utcnow(),
                "model_output": model_result,
            }
        },
    )

    return {
        "insight": insight,
        "model_output": model_result,
        "generated_at": datetime.utcnow().isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# NOTIFICATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

def _serialize_notification(app_doc: dict) -> dict:
    """Safely extract and serialise a notification from an application doc."""
    notif = app_doc.get("user_notification", {})
    ts = notif.get("timestamp")
    return {
        "message": notif.get("message", ""),
        "timestamp": ts.isoformat() if isinstance(ts, datetime) else str(ts),
        "read": notif.get("read", False),
        "status": app_doc.get("status", ""),
        "application_date": app_doc.get("created", ""),
        "admin_remarks": app_doc.get("admin_remarks", ""),
    }


@app.get("/user/notifications")
def get_user_notifications(user_id: str):
    applications = list(
        users_coll.find(
            {"user_id": user_id, "user_notification": {"$exists": True}},
            {"_id": 0, "user_notification": 1, "status": 1, "created": 1, "admin_remarks": 1},
        ).sort("created", -1)
    )
    notifications = [_serialize_notification(a) for a in applications if "user_notification" in a]
    return {"notifications": notifications}


@app.post("/user/notifications/mark-read")
def mark_notifications_read(user_id: str):
    users_coll.update_many(
        {"user_id": user_id, "user_notification.read": False},
        {"$set": {"user_notification.read": True}},
    )
    return {"message": "All notifications marked as read"}


@app.get("/user/notifications/{user_id}")
def get_user_notifications_detailed(user_id: str):
    applications = list(
        users_coll.find(
            {"user_id": user_id, "user_notification": {"$exists": True}},
            {
                "_id": 0,
                "user_notification": 1,
                "status": 1,
                "created": 1,
                "admin_remarks": 1,
                "raw.loan_amount_requested": 1,
                "raw.loan_category": 1,
                "model_output.final_cibil_score": 1,
                "model_output.final_tier": 1,
                "profile.name": 1,
            },
        ).sort("user_notification.timestamp", -1)
    )

    notifications = []
    for app in applications:
        if "user_notification" not in app:
            continue
        notif = app["user_notification"]
        ts = notif.get("timestamp")
        created = app.get("created")
        notifications.append(
            {
                "id": f"{user_id}_{created}",
                "message": notif.get("message", ""),
                "timestamp": ts.isoformat() if isinstance(ts, datetime) else str(ts),
                "read": notif.get("read", False),
                "status": app.get("status", ""),
                "application_date": created.isoformat() if isinstance(created, datetime) else str(created),
                "admin_remarks": app.get("admin_remarks", ""),
                "loan_amount": app.get("raw", {}).get("loan_amount_requested", 0),
                "loan_category": app.get("raw", {}).get("loan_category", ""),
                "cibil_score": app.get("model_output", {}).get("final_cibil_score"),
                "risk_tier": app.get("model_output", {}).get("final_tier"),
                "applicant_name": app.get("profile", {}).get("name", ""),
            }
        )

    return {"notifications": notifications}


@app.get("/user/notifications/count/{user_id}")
def get_unread_notification_count(user_id: str):
    count = users_coll.count_documents(
        {"user_id": user_id, "user_notification.read": False}
    )
    return {"unread_count": count}


@app.patch("/user/notifications/{user_id}/mark-read")
def mark_specific_notification_read(user_id: str, notification_id: str = None):
    if notification_id:
        try:
            created_str = notification_id.split(f"{user_id}_")[1]
            users_coll.update_one(
                {
                    "user_id": user_id,
                    "created": created_str,
                    "user_notification.read": False,
                },
                {"$set": {"user_notification.read": True}},
            )
        except IndexError:
            pass
    else:
        users_coll.update_many(
            {"user_id": user_id, "user_notification.read": False},
            {"$set": {"user_notification.read": True}},
        )
    return {"message": "Notification(s) marked as read"}


# ═══════════════════════════════════════════════════════════════════════════════
# GENERATE REMARK (strips unknown fields to avoid model errors)
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/generate-remark")
def generate_remark_endpoint(data: InputData):
    df = pd.DataFrame([data.dict()])
    result = infer_user(df, inference, explainer, feature_names, top_k_shap=5)
    remark = generate_remark(result)
    result["ai_remark"] = remark
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# HEALTH & ROOT
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "models_loaded": inference is not None,
        "explainer_loaded": explainer is not None,
        "mongo_connected": True,
    }


@app.get("/")
def root():
    return {"message": "Bharat Score API v2.1 is running!"}
