# ============================================================
# app.py — FastAPI (Frontend + Admin APIs + Check-in logging)
# ============================================================

from fastapi import FastAPI, Form, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import os
import csv
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta

# ----- Timezone: Thailand (+07:00)
TH_TZ = timezone(timedelta(hours=7))

# -----------------------------
# Environment
# -----------------------------
ADMIN_KEY = os.getenv("ADMIN_KEY")              # ตั้งค่าใน Render/เครื่องคุณ เช่น tpbadmin2025
DB_PATH   = os.getenv("CHECKIN_DB", "checkins.db")

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
    """สร้างตาราง + นำเข้ารายชื่อจาก CSV ครั้งแรก"""
    with get_conn() as conn:
        # checkins log
        conn.execute("""
            CREATE TABLE IF NOT EXISTS checkins (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT,
                seat       TEXT,
                seat_en    TEXT,
                user_agent TEXT,
                ip         TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # master guests
        conn.execute("""
            CREATE TABLE IF NOT EXISTS guests (
                name_key TEXT PRIMARY KEY,
                seat     TEXT,
                seat_en  TEXT
            )
        """)
        conn.commit()

        # ถ้าตาราง guests ยังว่าง ให้ import จาก CSV
        count = conn.execute("SELECT COUNT(*) AS c FROM guests").fetchone()["c"]
        if count == 0:
            try:
                with open("guests.csv", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    rows = []
                    for r in reader:
                        k = (r.get("name") or "").strip().lower()
                        seat = (r.get("seat") or "").strip()
                        seat_en = (r.get("seat_en") or "").strip()
                        if k:
                            rows.append((k, seat, seat_en))
                    if rows:
                        conn.executemany(
                            "INSERT OR IGNORE INTO guests(name_key, seat, seat_en) VALUES (?,?,?)",
                            rows
                        )
                        conn.commit()
            except FileNotFoundError:
                # ไม่มี CSV ก็ข้ามไป (ยังใช้งาน API อื่นได้)
                pass

def load_guests():
    """
    ดึงรายชื่อแขกเป็น dict จาก DB (ถ้าไม่มีข้อมูลจะลองอ่าน CSV เป็น fallback)
    รูปแบบผลลัพธ์: { "ชื่อ (lowercase)": {"seat": "...", "seat_en": "..."} }
    """
    result = {}
    # 1) ลองจาก DB ก่อน
    with get_conn() as conn:
        rows = conn.execute("SELECT name_key, seat, seat_en FROM guests").fetchall()
        for r in rows:
            result[r["name_key"]] = {"seat": r["seat"], "seat_en": r["seat_en"]}
    if result:
        return result

    # 2) fallback จาก CSV (กรณีตารางยังว่าง/ไม่มีไฟล์ DB)
    try:
        with open("guests.csv", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                k = (r.get("name") or "").strip().lower()
                if not k:
                    continue
                result[k] = {
                    "seat": (r.get("seat") or "").strip(),
                    "seat_en": (r.get("seat_en") or "").strip()
                }
    except FileNotFoundError:
        pass
    return result

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
    if request.headers.get("X-Admin-Key") != ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

# -----------------------------
# Routes: Check-in (frontend API)
# -----------------------------
@app.post("/checkin")
async def checkin(request: Request, name: str = Form(...)):
    guests = load_guests()
    name_key = (name or "").strip().lower()
    found = None
    for guest_name in guests:
        if name_key in guest_name:
            found = guests[guest_name]
            break

    # context สำหรับ log
    ua = request.headers.get("user-agent", "-")
    ip = request.client.host if request.client else "-"
    now_th = datetime.now(TH_TZ).strftime("%Y-%m-%d %H:%M:%S")

    if found:
        # log (พบชื่อ)
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO checkins (name, seat, seat_en, user_agent, ip, created_at) "
                "VALUES (?,?,?,?,?,?)",
                (name.strip(), found["seat"], found["seat_en"], ua, ip, now_th),
            )
            conn.commit()
        return {"success": True, "seat": found["seat"], "seat_en": found["seat_en"]}
    else:
        # log (ไม่พบชื่อ)
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO checkins (name, seat, seat_en, user_agent, ip, created_at) "
                "VALUES (?,?,?,?,?,?)",
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
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def main_page():
    return FileResponse("index.html")

@app.get("/admin")
def admin_page():
    return FileResponse("admin.html")

@app.get("/health")
def health():
    return {"ok": True}
