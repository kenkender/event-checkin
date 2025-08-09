# ============================================================
# app.py  —  FastAPI (Frontend + Admin APIs + Check-in logging)
# ============================================================

from fastapi import FastAPI, Form, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import csv
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta

TH_TZ = timezone(timedelta(hours=7))  # Asia/Bangkok (+07:00)


# -----------------------------
# Environment
# -----------------------------
ADMIN_KEY = os.getenv("ADMIN_KEY")  # ตั้งใน Render/เครื่องคุณ เช่น tpbadmin2025
DB_PATH = os.getenv("CHECKIN_DB", "checkins.db")

# -----------------------------
# FastAPI app & CORS
# -----------------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# SQLite helpers
# -----------------------------
def dict_factory(cursor, row):
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}

@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = dict_factory
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS checkins (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT,
                seat       TEXT,
                seat_en    TEXT,
                user_agent TEXT,
                ip         TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()

# -----------------------------
# Data: load guests from CSV
# -----------------------------
def load_guests():
    guests = {}
    try:
        with open("guests.csv", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row["name"].strip().lower()
                guests[name] = {
                    "seat": row.get("seat", ""),
                    "seat_en": row.get("seat_en", ""),
                }
    except FileNotFoundError:
        pass
    return guests

# -----------------------------
# Startup
# -----------------------------
@app.on_event("startup")
def on_startup():
    init_db()

# -----------------------------
# Admin guard
# -----------------------------
def admin_guard(request: Request):
    if not ADMIN_KEY:
        raise HTTPException(status_code=500, detail="Missing ADMIN_KEY")
    key = request.headers.get("X-Admin-Key")
    if key != ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

# -----------------------------
# Routes: Check-in (frontend API)
# -----------------------------
@app.post("/checkin")
async def checkin(request: Request, name: str = Form(...)):
    guests = load_guests()
    name_key = name.strip().lower()
    found = None
    for guest_name in guests:
        if name_key in guest_name:
            found = guests[guest_name]
            break

    # เก็บ context สำหรับ log
    ua = request.headers.get("user-agent", "-")
    ip = request.client.host if request.client else "-"
    now_th = datetime.now(TH_TZ).strftime("%Y-%m-%d %H:%M:%S")


    if found:
        # log สำเร็จ
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO checkins (name, seat, seat_en, user_agent, ip) VALUES (?,?,?,?,?)",
                (name.strip(), found["seat"], found["seat_en"], ua, ip),
            )

            conn.commit()
        return {"success": True, "seat": found["seat"], "seat_en": found["seat_en"]}
    else:
        # log ไม่พบชื่อ (seat = NULL)
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO checkins (name, seat, seat_en, user_agent, ip, created_at) VALUES (?,?,?,?,?,?)",
                (name.strip(), None, None, ua, ip, now_th),
            )

            conn.commit()
        return {"success": False, "error": "ไม่พบชื่อในระบบ / Name not found."}

# -----------------------------
# Routes: Admin APIs
# -----------------------------
@app.get("/api/admin/checkins")
def api_admin_checkins(request: Request):
    admin_guard(request)
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, name, seat, seat_en, user_agent, ip, created_at
            FROM checkins
            ORDER BY created_at DESC, id DESC
            """
        ).fetchall()
    return {"items": rows}

@app.get("/api/admin/guests")
def api_admin_guests(request: Request):
    admin_guard(request)
    guests = load_guests()
    items = [
        {"name": k, "seat": v["seat"], "seat_en": v["seat_en"]}
        for k, v in guests.items()
    ]
    items.sort(key=lambda x: (x["seat"], x["name"]))
    return {"items": items}

# -----------------------------
# Static / Pages
# -----------------------------
# เสิร์ฟไฟล์ static/*
app.mount("/static", StaticFiles(directory="static"), name="static")

# หน้า frontend หลัก
@app.get("/")
def main_page():
    return FileResponse("index.html")

# หน้า admin UI (คุณต้องมีไฟล์ admin.html อยู่ในโฟลเดอร์เดียวกับ app.py)
@app.get("/admin")
def admin_page():
    return FileResponse("admin.html")

# (ไม่บังคับ) healthcheck
@app.get("/health")
def health():
    return {"ok": True}
