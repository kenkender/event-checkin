# db.py
import sqlite3, os, pathlib

BASE_DIR = pathlib.Path(__file__).resolve().parent

# Runtime data directory; default to /data for persistence but allow
# overriding via CHECKIN_DATA_DIR or CHECKIN_DB environment variables.
DATA_DIR = pathlib.Path(os.getenv("CHECKIN_DATA_DIR", "/data"))
if not DATA_DIR.is_absolute():
    DATA_DIR = BASE_DIR / DATA_DIR
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_FILE = pathlib.Path(os.getenv("CHECKIN_DB", DATA_DIR / "checkin.db"))
DB_FILE.parent.mkdir(parents=True, exist_ok=True)

def get_conn():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("""
        CREATE TABLE IF NOT EXISTS checkins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            seat TEXT,
            seat_en TEXT,
            user_agent TEXT,
            ip TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        conn.commit()
