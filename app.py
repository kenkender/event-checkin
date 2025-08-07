from fastapi import FastAPI, Form
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import csv
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

def load_guests():
    guests = {}
    try:
        with open("guests.csv", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row["name"].strip().lower()
                guests[name] = {
                    "seat": row["seat"],
                    "seat_en": row["seat_en"]
                }
    except FileNotFoundError:
        pass
    return guests

@app.post("/checkin")
async def checkin(name: str = Form(...)):
    guests = load_guests()
    name_key = name.strip().lower()
    found = None
    for guest_name in guests:
        # ตรวจสอบชื่อบางส่วน (partial match)
        if name_key in guest_name:
            found = guests[guest_name]
            break
    if found:
        return {
            "success": True,
            "seat": found["seat"],
            "seat_en": found["seat_en"]
        }
    else:
        return {
            "success": False,
            "error": "ไม่พบชื่อในระบบ / Name not found."
        }

@app.get("/")
def main():
    return FileResponse("index.html")
