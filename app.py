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
import re
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from fastapi import Body
from fastapi import Response
from pathlib import Path

# ----- Timezone: Thailand (+07:00)
TH_TZ = timezone(timedelta(hours=7))

# -----------------------------
# Environment
# -----------------------------
ADMIN_KEY = os.getenv("ADMIN_KEY")  # ตั้งค่าใน Render/เครื่องคุณ เช่น tpbadmin2025
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = BASE_DIR / "data" / "checkin.db"
DB_PATH = Path(os.getenv("CHECKIN_DB", DEFAULT_DB_PATH))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

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
        # tables เดิมของคุณ…
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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS guests (
                name_key TEXT PRIMARY KEY,
                seat     TEXT,
                seat_en  TEXT
            )
        """)
        conn.commit()

        # --- เพิ่มคอลัมน์ display_name ถ้ายังไม่มี ---
        cols = conn.execute("PRAGMA table_info(guests)").fetchall()
        has_display = any(c["name"] == "display_name" for c in cols)
        if not has_display:
            conn.execute("ALTER TABLE guests ADD COLUMN display_name TEXT")
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
                pass

def load_guests():
    """
    ส่งออกเป็น dict:
    { name_key: {"seat":..., "seat_en":..., "display_name": ... } }
    """
    result = {}

    with get_conn() as conn:
        rows = conn.execute("SELECT name_key, seat, seat_en, display_name FROM guests").fetchall()
        for r in rows:
            result[r["name_key"]] = {
                "seat": r["seat"],
                "seat_en": r["seat_en"],
                "display_name": r.get("display_name") or r["name_key"]
            }
    if result:
        return result

    # fallback: CSV (เผื่อ DB ว่าง)
    try:
        with open("guests.csv", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                k = (r.get("name") or "").strip().lower()
                if not k: 
                    continue
                result[k] = {
                    "seat": (r.get("seat") or "").strip(),
                    "seat_en": (r.get("seat_en") or "").strip(),
                    "display_name": (r.get("name") or "").strip() or k
                }
    except FileNotFoundError:
        pass
    return result


def save_guests_to_csv():
    """Dump current guests to guests.csv so data survives restarts."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT display_name, seat, seat_en FROM guests ORDER BY seat, display_name"
        ).fetchall()
    with open("guests.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "seat", "seat_en"])
        for r in rows:
            writer.writerow([r["display_name"], r["seat"], r["seat_en"]])


# -----------------------------
# Startup
# -----------------------------
@app.on_event("startup")
def on_startup():
    init_db()

# -----------------------------
# Admin utils
# -----------------------------
SEAT_PATTERN = re.compile(r"^[A-L][1-9]$", re.IGNORECASE)

def admin_guard(request: Request):
    if not ADMIN_KEY:
        raise HTTPException(status_code=500, detail="Missing ADMIN_KEY")
    if request.headers.get("X-Admin-Key") != ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

def normalize_seat(s: str) -> str:
    s = (s or "").strip().upper()
    if not SEAT_PATTERN.match(s):
        raise HTTPException(status_code=400, detail="Seat must be A1..L9")
    return s

def seat_to_en(s: str) -> str:
    return f"Table {s}"

# -----------------------------
# Routes: Check-in (frontend API)
# -----------------------------
@app.post("/checkin")
async def checkin(request: Request, name: str = Form(...)):
    guests = load_guests()
    name_raw = (name or "").strip()
    name_key = name_raw.lower()

    # หาในรายชื่อ (ยอมรับพิมพ์แค่บางส่วน)
    found = None
    matched_key = None
    for gk, gv in guests.items():
        if name_key in gk:
            found = gv
            matched_key = gk
            break

    # context สำหรับ log
    ua = request.headers.get("user-agent", "-")
    ip = request.client.host if request.client else "-"
    now_th = datetime.now(TH_TZ).strftime("%Y-%m-%d %H:%M:%S")

    # ถ้าไม่พบชื่อใน master
    if not found:
        # log ความพยายามที่ไม่พบชื่อไว้เหมือนเดิม
        with get_conn() as conn:
            
            conn.execute(
                "INSERT INTO checkins (name, seat, seat_en, user_agent, ip, created_at) "
                "VALUES (?,?,?,?,?,?)",
                (name_raw, None, None, ua, ip, now_th),
            )
            conn.commit()
        return {"success": False, "error": "ไม่พบชื่อในระบบ / Name not found."}


    seat = found["seat"]
    seat_en = found["seat_en"]
    # ใช้ชื่อเต็มจากฐาน (ถ้าไม่มี ให้ fallback เป็น matched_key หรือ name_raw)
    canonical_name = (found.get("display_name") or matched_key or name_raw).strip()

    # ตรวจว่าเคยเช็คอินแล้วหรือยัง (ถือว่า 'เคย' ถ้ามีชื่อ+ที่นั่งนี้อย่างน้อย 1 แถว)
    # ปล. ถ้าคุณต้องการให้เทียบด้วย "ชื่อเต็มตามฐาน" ให้เปลี่ยน name_raw เป็น matched_key หรือชื่อ canonical ที่คุณเก็บไว้

    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 AS ok FROM checkins WHERE name=? AND seat=? LIMIT 1",
            (canonical_name, seat),
        ).fetchone()
        already = bool(row)

        # จะบันทึก log การเช็คอินซ้ำด้วยก็ได้ (ช่วยให้เห็นประวัติ)
        conn.execute(
            "INSERT INTO checkins (name, seat, seat_en, user_agent, ip, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (canonical_name, seat, seat_en, ua, ip, now_th),
        )
        conn.commit()


    return {"success": True, "seat": seat, "seat_en": seat_en, "already": already}


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
        {
            "name": v.get("display_name") or k,
            "seat": v["seat"],
            "seat_en": v["seat_en"],
            "key": k,
        }
        for k, v in guests.items()
    ]
    items.sort(key=lambda x: (x["seat"], x["name"]))
    return {"items": items}


# === Admin: add/insert guest (JSON body) ===
from fastapi import Body

from fastapi import Body

@app.post("/api/admin/guest")
def api_admin_add_guest(
    request: Request,
    name: str = Body(...),
    seat: str = Body(...),
    seat_en: str = Body(None),
):
    admin_guard(request)


    display_name = (name or "").strip()        # << เก็บชื่อเต็มไว้ใช้แสดงผล
    name_key = display_name.lower()
    seat     = (seat or "").strip().upper()
    seat_en  = (seat_en or f"Table {seat}").strip()

    if not name_key or not seat:
        raise HTTPException(status_code=400, detail="name/seat is required")

    import re
    if not re.fullmatch(r"[A-L][1-9]", seat):
        raise HTTPException(status_code=400, detail="Seat must be like A1..L9")

    with get_conn() as conn:

        if conn.execute("SELECT 1 FROM guests WHERE name_key=?", (name_key,)).fetchone():
            raise HTTPException(status_code=409, detail="ชื่อนี้ถูกเพิ่มไว้แล้ว")
        
        if conn.execute("SELECT 1 FROM guests WHERE seat=?", (seat,)).fetchone():
            raise HTTPException(status_code=409, detail="ที่นั่งนี้มีผู้ใช้งานแล้ว")

        conn.execute(
            "INSERT INTO guests(name_key, seat, seat_en, display_name) VALUES (?,?,?,?)",
            (name_key, seat, seat_en, display_name),
        )
        conn.commit()

    save_guests_to_csv()
    return {"ok": True}

@app.put("/api/admin/guest/{name_key}")
def api_admin_update_guest(
    request: Request,
    name_key: str,
    name: str = Body(...),
    seat: str = Body(...),
    seat_en: str = Body(None),
):
    admin_guard(request)

    display_name = (name or "").strip()
    new_key = display_name.lower()
    seat = normalize_seat(seat)
    seat_en = (seat_en or seat_to_en(seat)).strip()

    if not new_key:
        raise HTTPException(status_code=400, detail="name is required")

    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM guests WHERE name_key=?", (name_key,)).fetchone():
            raise HTTPException(status_code=404, detail="guest not found")

        if conn.execute(
            "SELECT 1 FROM guests WHERE seat=? AND name_key<>?",
            (seat, name_key),
        ).fetchone():
            raise HTTPException(status_code=409, detail="ที่นั่งนี้มีผู้ใช้งานแล้ว")

        if new_key != name_key and conn.execute(
            "SELECT 1 FROM guests WHERE name_key=?",
            (new_key,),
        ).fetchone():
            raise HTTPException(status_code=409, detail="ชื่อนี้ถูกใช้แล้ว")

        conn.execute(
            "UPDATE guests SET name_key=?, display_name=?, seat=?, seat_en=? WHERE name_key=?",
            (new_key, display_name, seat, seat_en, name_key),
        )
        conn.commit()

    save_guests_to_csv()
    return {"ok": True}


@app.delete("/api/admin/guest/{name_key}")
def api_admin_delete_guest(request: Request, name_key: str):
    admin_guard(request)
    with get_conn() as conn:
        conn.execute("DELETE FROM guests WHERE name_key=?", (name_key,))
        conn.commit()
    save_guests_to_csv()
    return {"ok": True}


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

@app.api_route("/ping", methods=["GET", "HEAD"])
def ping():
    return Response(content="OK", media_type="text/plain")

@app.get("/health")
def health():
    return {"ok": True}
