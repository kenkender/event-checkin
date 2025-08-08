// Pulse-animate any elements with .pulse-ani class
function addPulseEffect(element) {
  if (element) {
    element.classList.remove('pulse-ani');
    void element.offsetWidth;
    element.classList.add('pulse-ani');
  }
}

/* ---------- helpers: เคลียร์/ใส่ไฮไลต์ให้เอกสาร SVG ---------- */
function clearHighlightsInDoc(svgDoc) {
  if (!svgDoc) return;
  svgDoc.querySelectorAll('.seat-highlight').forEach(el => el.classList.remove('seat-highlight'));
  svgDoc.querySelectorAll('.seat-bg-highlight').forEach(el => el.classList.remove('seat-bg-highlight'));
}

function applyHighlightInDoc(svgDoc, seatId) {
  if (!svgDoc || !seatId) return;
  const seat = svgDoc.getElementById(seatId);
  if (!seat) return;

  // ขอบ
  seat.classList.add('seat-highlight');

  // พื้นหลัง (รองรับทั้ง <g> และ <rect>/<circle>)
  if (seat.tagName === 'g') {
    const bg = seat.querySelector('rect, circle');
    if (bg) {
      bg.classList.remove('seat-bg-highlight');
      void bg.offsetWidth;               // force repaint
      bg.classList.add('seat-bg-highlight');
    }
  } else if (seat.tagName === 'rect' || seat.tagName === 'circle') {
    seat.classList.remove('seat-bg-highlight');
    void seat.offsetWidth;               // force repaint
    seat.classList.add('seat-bg-highlight');
  }
}

/* ---------- ให้มีไฮไลต์ได้ทีละที่เดียว ทั้งแผนผังหลักและ modal ---------- */
function highlightSeat(seatId) {
    currentSeatId = seatId || null;
  const objMain  = document.getElementById('seating-map');
  const objModal = document.getElementById('seating-map-modal'); // อาจไม่มีถ้า modal ยังไม่เปิด

  // เคลียร์ของเดิมในทุกเอกสารที่มี
  if (objMain && objMain.contentDocument)  clearHighlightsInDoc(objMain.contentDocument);
  if (objModal && objModal.contentDocument) clearHighlightsInDoc(objModal.contentDocument);

  // ใส่ของใหม่ในแผนผังหลัก
  if (objMain && objMain.contentDocument && seatId) {
    applyHighlightInDoc(objMain.contentDocument, seatId);
  }
}

/* ---------- sync ไปยัง modal เมื่อเปิด ---------- */
function syncHighlightToModal() {
  const objModal = document.getElementById('seating-map-modal');
  if (!objModal) return;

  // ไม่มี seat ล่าสุด ไม่ต้องทำอะไร
  if (!currentSeatId) return;

  const applyNow = () => {
    if (!objModal.contentDocument) return;
    clearHighlightsInDoc(objModal.contentDocument);
    applyHighlightInDoc(objModal.contentDocument, currentSeatId);
  };

  // ถ้า modal ยังโหลดไม่เสร็จ รอ 'load' ก่อน
  if (!objModal.contentDocument) {
    objModal.addEventListener('load', () => applyNow(), { once: true });
  } else {
    applyNow();
  }
}

/* ---------- เช็คอิน ---------- */
async function checkIn() {
  const name = document.getElementById("name").value.trim();
  if (!name) { showResult("กรุณากรอกชื่อก่อน", false); return; }

  setBtnLoading(true);
  const formData = new FormData();
  formData.append("name", name);

  try {
    const res = await fetch("/checkin", { method: "POST", body: formData });
    const data = await res.json();
    if (data.success) {
      showResult(
        `✅ เช็คอินสำเร็จ! ที่นั่งของคุณคือ <span style="color:#e32c2c">${data.seat}</span><br>
         <span style="color:#ffe957;font-size:0.97em;">Check-in successful! Your seat is<br><span style="color:#e32c2c">${data.seat_en || data.seat}</span></span>`,
        true
      );
      // สำคัญ: ทุกครั้งที่เช็คอินใหม่ เคลียร์ก่อน แล้วใส่ไฮไลต์ใหม่ (ทำใน highlightSeat)
      highlightSeat(data.seat);
    } else {
      showResult(data.error, false);
      highlightSeat(null); // เคลียร์
    }
  } catch (e) {
    showResult("เกิดข้อผิดพลาดกับเซิร์ฟเวอร์ / Server error", false);
    highlightSeat(null);
  } finally {
    setBtnLoading(false);
  }
}

/* ---------- แสดงผลข้อความ ---------- */
function showResult(msg, success) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = `<span style="color:${success ? '#ffe957' : '#ff7878'}">${msg}</span>`;
  resultDiv.style.color = success ? "#ffe957" : "#ff7878";
  resultDiv.style.textShadow = success ? "0 2px 16px #ffe95733" : "0 2px 16px #ff7878bb";
  addPulseEffect(resultDiv);
}

/* ---------- กด Enter เพื่อเช็คอิน ---------- */
document.addEventListener('DOMContentLoaded', function () {
  const btn = document.getElementById('checkin-btn');
  const input = document.getElementById("name");
  if (btn) btn.addEventListener('click', () => addPulseEffect(btn));
  if (input) input.addEventListener("keydown", e => { if (e.key === "Enter") checkIn(); });
});

/* ---------- ปุ่มโหลด ---------- */
function setBtnLoading(loading) {
  const btn = document.getElementById('checkin-btn');
  const loader = document.getElementById('btn-loader');
  if (!btn || !loader) return;
  if (loading) {
    loader.style.display = "inline-block";
    btn.querySelector("span").style.opacity = "0.2";
    btn.disabled = true;
  } else {
    loader.style.display = "none";
    btn.querySelector("span").style.opacity = "1";
    btn.disabled = false;
  }
}

/* ---------- Modal Zoom Map + sync ---------- */
document.addEventListener('DOMContentLoaded', function () {
  const modal   = document.getElementById('mapModal');
  const openBtn = document.getElementById('openMapModalBtn');
  const closeBtn= document.getElementById('closeMapModalBtn');

  if (openBtn && modal) openBtn.onclick = () => {
    modal.classList.add('open');
    syncHighlightToModal();
  };
  if (closeBtn && modal) closeBtn.onclick = () => modal.classList.remove('open');
  if (modal) modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('open'); };
});
