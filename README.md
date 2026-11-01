# Timetable Assistant

Turn a photo of your university timetable into an editable class list, catch clashes, and export it to your Google calendar so users get notifications.

 Many universities in Uganda still manage timetables manually using spreadsheets and paperwork.
This leads to:
•Lecturer conflicts
•Room allocation clashes
•Time-consuming timetable generation
•Frequent timetable changes
•Student confusion"

**Live demo:** https://saidn-dev.github.io/Campus-pilot/ (reads photos with AI through a free Render server, which can take up to a minute to wake up; without a server it falls back to demo mode with sample data, and adding `?demo` to a local URL turns that on)

Gemini 3.5 Flash-Lite reads the image and Gemma 4 writes study tips. Plain rules in the browser handle conflict detection, so those results are exact.

```text
photo ──► /api/extract (Gemini) ──► editable table ──► conflict check (analysis.js)
                                          │                   │
                                          ▼                   ▼
                                    weekly grid         /api/tips (Gemma 4)
                                          │
                                          ▼
                                   timetable.ics
```

## Features

- **Photo to table.** Upload a JPG, PNG, or WebP (max 15 MB). Gemini 3.5 Flash-Lite lists each class with course, code, type, day, start, end, room, and lecturer. You can edit every field, add a class with **+ Add class** (it starts where the last one ends), or copy one with the duplicate button next to delete.
- **Conflict detection.** Rule-based checks in `web/analysis.js` flag:

  | Check | Rule |
  |---|---|
  | Clash | Two classes overlap on the same day |
  | Invalid time | Missing day, missing time, or end before start |
  | Duplicate | Same code and same times listed twice |
  | Tight room change | Less than 10 min between classes in different rooms |
  | Long stretch | 4 h or more of classes with less than 15 min between them |

- **Weekly grid** view of the timetable.
- **Study tips.** Gemma 4 suggests 5 to 7 tips based on your classes, the issues found, and your free gaps (08:00 to 18:00).
- **Calendar export.** Downloads `timetable.ics` with weekly repeating events until the semester end date you pick (16 weeks from today if left blank), plus a reminder 15 min before each class.
- **Local storage.** Your classes are saved in the browser's `localStorage`. Nothing is stored on the server.

## Stack

| Part | Files |
|---|---|
| Backend: FastAPI, httpx | `server/main.py`, `server/gemma.py` |
| Frontend: vanilla HTML/CSS/JS | `web/index.html`, `web/styles.css`, `web/app.js`, `web/analysis.js` |
| Models | Photos: `gemini-3.5-flash-lite` (fallback `gemini-3.5-flash`). Tips: `gemma-4-31b-it` (fallback `gemma-4-26b-a4b-it`). All through the Gemini API |

## Setup

**Prerequisites:** Python 3 and a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/saidn-dev/Campus-pilot.git
cd Campus-pilot
```

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

On macOS/Linux, use `source .venv/bin/activate` and `cp .env.example .env` instead.

Then set your key in `.env`:

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Gemini API key |
| `GEMINI_API_KEY_2` | No | Backup key, used when the first is rate-limited |
| `GEMMA_MODEL` | No | Model for study tips. Default `gemma-4-31b-it`; `gemma-4-26b-a4b-it` is faster |
| `VISION_MODEL` | No | Model for reading photos. Default `gemini-3.5-flash-lite`, with `gemini-3.5-flash` as backup. Gemma 4 on the Gemini API rejected images with a 400 error as of November 2026 |
| `ALLOWED_ORIGINS` | No | Sites allowed to call the API from a browser, comma-separated. Only needed when hosting |
| `RATE_LIMIT_PER_HOUR` | No | AI requests each visitor can make per hour. `0` (default) means no limit |

## Run

On Windows:

```bash
run.bat
```

`run.bat` creates `.env` from `.env.example` if it is missing, then starts the server. On any OS:

```bash
uvicorn server.main:app --port 8000
```

Open http://localhost:8000.

> **Note:** When the Gemini API returns 429, 500, or 503, the server waits 2 s and tries the next key, then the backup model.

## API

The server also serves `web/` at `/`.

| Endpoint | Body | Returns |
|---|---|---|
| `GET /api/health` | none | `{"ok": true}` |
| `POST /api/extract` | multipart form, field `image` | `{"classes": [...]}` |
| `POST /api/tips` | `{"analysis": {...}}` | `{"tips": [{"title", "detail"}]}` |

Model errors return HTTP 502 with a readable message, such as a missing API key or a timeout. Going over `RATE_LIMIT_PER_HOUR` returns 429.

## Deploy

The live demo is two parts: the page on GitHub Pages and the API on Render's free tier.

1. **API on Render.** In the [Render dashboard](https://dashboard.render.com), choose **New > Blueprint** and pick this repo. Render reads `render.yaml` and asks for `GEMINI_API_KEY` (and optionally `GEMINI_API_KEY_2`). The service gets a URL like `https://campus-pilot.onrender.com`.
2. **Page on GitHub Pages.** In the repo's **Settings > Pages**, set the source to **GitHub Actions**. Under **Settings > Secrets and variables > Actions > Variables**, add `API_BASE_URL` with the Render URL. The next push to `main` deploys the page pointed at that server.

If `API_BASE_URL` isn't set, the page deploys in demo mode instead. Render's free tier sleeps after about 15 minutes idle, so the first request after that can take up to a minute. The page pings `/api/health` on load to start waking it.

Thanks

<!-- TODO: add a License section once a LICENSE file is chosen -->
