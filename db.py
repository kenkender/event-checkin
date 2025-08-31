# db.py
import sqlite3, os, pathlib

BASE_DIR = pathlib.Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data"
DB_PATH.mkdir(exist_ok=True)
DB_FILE = DB_PATH / "checkin.db"

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
