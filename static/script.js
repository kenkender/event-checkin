// Pulse-animate any elements with .pulse-ani class
function addPulseEffect(element) {
    if (element) {
        element.classList.remove('pulse-ani');
        void element.offsetWidth;
        element.classList.add('pulse-ani');
    }
}

// Highlight seat in main SVG
function highlightSeat(seatId) {
    const svgObj = document.getElementById('seating-map');
    if (svgObj && svgObj.contentDocument) {
        const svgDoc = svgObj.contentDocument;
        // ลบ highlight เดิม
        svgDoc.querySelectorAll('.seat-highlight').forEach(el => el.classList.remove('seat-highlight'));
        svgDoc.querySelectorAll('.seat-bg-highlight').forEach(el => el.classList.remove('seat-bg-highlight'));
        if (seatId) {
            // ใส่ขอบ stroke
            const seat = svgDoc.getElementById(seatId);
            if (seat) seat.classList.add('seat-highlight');
            // ใส่ fill (พื้นหลัง)
            if (seat && seat.tagName === 'g') {
                const bg = seat.querySelector('rect');
                if (bg) {
                    bg.classList.remove('seat-bg-highlight');
                    void bg.offsetWidth;
                    bg.classList.add('seat-bg-highlight');
                }
            } else if (seat && (seat.tagName === 'rect' || seat.tagName === 'circle')) {
                seat.classList.remove('seat-bg-highlight');
                void seat.offsetWidth;
                seat.classList.add('seat-bg-highlight');
            }
        }
    }
}

// ดึง seat highlight ล่าสุด ไปโชว์ใน modal ด้วย
function syncHighlightToModal() {
    const svgMain = document.getElementById('seating-map');
    const svgModal = document.getElementById('seating-map-modal');
    if (!svgMain || !svgModal) return;

    svgModal.addEventListener('load', function () {
        if (svgMain.contentDocument && svgModal.contentDocument) {
            const seatHighlighted = svgMain.contentDocument.querySelector('.seat-highlight');
            const seatBgHighlighted = svgMain.contentDocument.querySelector('.seat-bg-highlight');
            svgModal.contentDocument.querySelectorAll('.seat-highlight').forEach(el => el.classList.remove('seat-highlight'));
            svgModal.contentDocument.querySelectorAll('.seat-bg-highlight').forEach(el => el.classList.remove('seat-bg-highlight'));
            if (seatHighlighted) {
                const seatId = seatHighlighted.id;
                const modalSeat = svgModal.contentDocument.getElementById(seatId);
                if (modalSeat) modalSeat.classList.add('seat-highlight');
            }
            if (seatBgHighlighted) {
                const seatId = seatBgHighlighted.id;
                const modalSeat = svgModal.contentDocument.getElementById(seatId);
                if (modalSeat) modalSeat.classList.add('seat-bg-highlight');
            }
        }
    }, { once: true });
}

async function checkIn() {
    const name = document.getElementById("name").value.trim();
    if (!name) {
        showResult("กรุณากรอกชื่อก่อน", false);
        return;
    }

    setBtnLoading(true);

    const formData = new FormData();
    formData.append("name", name);

    try {
        const res = await fetch("/checkin", {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showResult(`✅ เช็คอินสำเร็จ! ที่นั่งของคุณคือ <span style="color:#e32c2c">${data.seat}</span><br>
            <span style="color:#ffe957;font-size:0.97em;">Check-in successful! Your seat is<br><span style="color:#e32c2c">${data.seat_en || data.seat}</span></span>`, true);

            highlightSeat(data.seat); // highlight ที่นั่งใน SVG หลัก
        } else {
            showResult(data.error, false);
            highlightSeat(null);
        }
    } catch (e) {
        showResult("เกิดข้อผิดพลาดกับเซิร์ฟเวอร์ / Server error", false);
        highlightSeat(null);
    } finally {
        setBtnLoading(false);
    }
}

function showResult(msg, success) {
    const resultDiv = document.getElementById("result");
    resultDiv.innerHTML = `<span style="color:${success ? '#ffe957' : '#ff7878'}">${msg}</span>`;
    resultDiv.style.color = success ? "#ffe957" : "#ff7878";
    resultDiv.style.textShadow = success ? "0 2px 16px #ffe95733" : "0 2px 16px #ff7878bb";
    addPulseEffect(resultDiv);
}

// ปุ่ม Enter สามารถเช็คอินได้
document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('checkin-btn');
    const input = document.getElementById("name");
    if (btn) {
        btn.addEventListener('click', function () {
            addPulseEffect(btn);
        });
    }
    if (input) {
        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                checkIn();
            }
        });
    }
});

// Loading Spinner บนปุ่ม
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

// Modal Zoom Map + sync effect
document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('mapModal');
    const openBtn = document.getElementById('openMapModalBtn');
    const closeBtn = document.getElementById('closeMapModalBtn');
    // เปิด modal + sync highlight
    if (openBtn && modal) openBtn.onclick = () => {
        modal.classList.add('open');
        syncHighlightToModal();
    };
    // ปิด modal
    if (closeBtn && modal) closeBtn.onclick = () => modal.classList.remove('open');
    // ปิดเมื่อคลิกนอกกล่อง
    if (modal) modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('open'); };
});
