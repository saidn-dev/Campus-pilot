import os
import time
from collections import defaultdict, deque
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from server import gemma  # noqa: E402  (needs the .env loaded first)

MAX_IMAGE_BYTES = 15 * 1024 * 1024

# AI calls per visitor per hour; 0 turns the limit off (the default for local use)
RATE_LIMIT_PER_HOUR = int(os.getenv("RATE_LIMIT_PER_HOUR", "0") or 0)

app = FastAPI(title="Timetable Assistant")

# lets the GitHub Pages site call this server, e.g. ALLOWED_ORIGINS=https://saidn-dev.github.io
origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

_calls = defaultdict(deque)


def rate_limit(request: Request):
    if RATE_LIMIT_PER_HOUR <= 0:
        return
    # behind Render's proxy the visitor's address is the first X-Forwarded-For entry
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")
    now = time.monotonic()
    calls = _calls[ip]
    while calls and now - calls[0] > 3600:
        calls.popleft()
    if len(calls) >= RATE_LIMIT_PER_HOUR:
        minutes = int((3600 - (now - calls[0])) // 60) + 1
        raise HTTPException(429, f"You've hit this demo's limit of {RATE_LIMIT_PER_HOUR} AI requests an hour. Try again in {minutes} min, or run it locally with your own key.")
    calls.append(now)
    if len(_calls) > 10000:  # don't let the table grow forever
        for key in [k for k, v in _calls.items() if not v or now - v[-1] > 3600]:
            del _calls[key]


class TipsRequest(BaseModel):
    analysis: dict


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.post("/api/extract", dependencies=[Depends(rate_limit)])
async def extract(image: UploadFile = File(...)):
    if not (image.content_type or "").startswith("image/"):
        raise HTTPException(400, "Please upload an image file (JPG, PNG or WebP).")
    data = await image.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(400, "That image is over 15 MB. Use a smaller photo or a screenshot.")
    try:
        classes = await gemma.extract_classes(data, image.content_type)
    except gemma.GemmaError as err:
        raise HTTPException(502, str(err))
    return {"classes": classes}


@app.post("/api/tips", dependencies=[Depends(rate_limit)])
async def tips(req: TipsRequest):
    try:
        result = await gemma.generate_tips(req.analysis)
    except gemma.GemmaError as err:
        raise HTTPException(502, str(err))
    return {"tips": result}


app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")
