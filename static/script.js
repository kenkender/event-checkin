/* -------------------------------------------------------
   Utilities
------------------------------------------------------- */
let currentSeatId = null; // เก็บที่นั่งล่าสุดไว้ซิงก์กับ modal

function addPulseEffect(el){
  if(!el) return;
  el.classList.remove('pulse-ani');
  void el.offsetWidth;
  el.classList.add('pulse-ani');
}

/* -------------------------------------------------------
   SVG Highlight helpers
------------------------------------------------------- */
function clearHighlightsInDoc(svgDoc){
  if(!svgDoc) return;
  svgDoc.querySelectorAll('.seat-highlight').forEach(el=>el.classList.remove('seat-highlight'));
  svgDoc.querySelectorAll('.seat-bg-highlight').forEach(el=>el.classList.remove('seat-bg-highlight'));
}
function applyHighlightInDoc(svgDoc, seatId){
  if(!svgDoc || !seatId) return;
  const seat = svgDoc.getElementById(seatId);
  if(!seat) return;

  seat.classList.add('seat-highlight');

  if(seat.tagName === 'g'){
    const bg = seat.querySelector('rect, circle');
    if(bg){
      bg.classList.remove('seat-bg-highlight');
      void bg.offsetWidth;
      bg.classList.add('seat-bg-highlight');
    }
  }else if(seat.tagName === 'rect' || seat.tagName === 'circle'){
    seat.classList.remove('seat-bg-highlight');
    void seat.offsetWidth;
    seat.classList.add('seat-bg-highlight');
  }
}

/* ให้มีไฮไลต์ได้ทีละที่เดียว */
function highlightSeat(seatId){
  currentSeatId = seatId || null;

  const objMain  = document.getElementById('seating-map');
  const objModal = document.getElementById('seating-map-modal');

  if(objMain && objMain.contentDocument)  clearHighlightsInDoc(objMain.contentDocument);
  if(objModal && objModal.contentDocument) clearHighlightsInDoc(objModal.contentDocument);

  if(objMain && objMain.contentDocument && seatId){
    applyHighlightInDoc(objMain.contentDocument, seatId);
  }
}

/* ซิงก์ไป modal เมื่อเปิด */
function syncHighlightToModal(){
  const objModal = document.getElementById('seating-map-modal');
  if(!objModal || !currentSeatId) return;

  const applyNow = () => {
    if(!objModal.contentDocument) return;
    clearHighlightsInDoc(objModal.contentDocument);
    applyHighlightInDoc(objModal.contentDocument, currentSeatId);
  };

  if(!objModal.contentDocument){
    objModal.addEventListener('load', applyNow, { once:true });
  }else{
    applyNow();
  }
}

/* -------------------------------------------------------
   Check-in
------------------------------------------------------- */
async function checkIn(){
  const name = document.getElementById('name').value.trim();
  if(!name){ showResult('กรุณากรอกชื่อก่อน', false); return; }

  setBtnLoading(true);
  const formData = new FormData();
  formData.append('name', name);

  try{
    const res  = await fetch('/checkin', { method:'POST', body:formData });
    const data = await res.json();

    if(data.success){
      showResult(
        `✅ เช็คอินสำเร็จ! ที่นั่งของคุณคือ <span style="color:#e32c2c">${data.seat}</span><br>
         <span style="color:#ffe957;font-size:0.97em;">Check-in successful! Your seat is<br><span style="color:#e32c2c">${data.seat_en || data.seat}</span></span>`,
        true
      );
      highlightSeat(data.seat);
      
      // ✅ ถ้าเป็นการเช็คอินซ้ำ ➜ เปิดป๊อปอัปแจ้งเตือน
    if (data.already === true) {
    openDupModal(
      `คุณได้เช็คอินเรียบร้อยแล้ว ที่นั่งของคุณคือ <b>${data.seat}</b><br>
       <span style="font-size:.95em;color:#345;">You have already checked in. Your seat is <b>${data.seat_en || data.seat}</b>.</span>`
    );
  }
    }else{
      showResult(data.error, false);
      highlightSeat(null);
    }
  }catch(e){
    showResult('เกิดข้อผิดพลาดกับเซิร์ฟเวอร์ / Server error', false);
    highlightSeat(null);
  }finally{
    setBtnLoading(false);
  }
}

function showResult(msg, success){
  const resultDiv = document.getElementById('result');
  resultDiv.innerHTML = `<span style="color:${success ? '#ffe957' : '#ff7878'}">${msg}</span>`;
  resultDiv.style.color = success ? '#ffe957' : '#ff7878';
  resultDiv.style.textShadow = success ? '0 2px 16px #ffe95733' : '0 2px 16px #ff7878bb';
  addPulseEffect(resultDiv);
}

/* Enter -> checkin */
document.addEventListener('DOMContentLoaded', () => {
  const btn   = document.getElementById('checkin-btn');
  const input = document.getElementById('name');
  if(btn)   btn.addEventListener('click', () => addPulseEffect(btn));
  if(input) input.addEventListener('keydown', e => { if(e.key === 'Enter') checkIn(); });
});

/* Loading spinner */
function setBtnLoading(loading){
  const btn    = document.getElementById('checkin-btn');
  const loader = document.getElementById('btn-loader');
  if(!btn || !loader) return;

  if(loading){
    loader.style.display = 'inline-block';
    btn.querySelector('span').style.opacity = '0.2';
    btn.disabled = true;
  }else{
    loader.style.display = 'none';
    btn.querySelector('span').style.opacity = '1';
    btn.disabled = false;
  }
}

/* -------------------------------------------------------
   Modal Zoom Map
------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  const modal    = document.getElementById('mapModal');
  const openBtn  = document.getElementById('openMapModalBtn');
  const closeBtn = document.getElementById('closeMapModalBtn');

  if(openBtn && modal){
    openBtn.onclick = () => { modal.classList.add('open'); syncHighlightToModal(); };
  }
  if(closeBtn && modal){
    closeBtn.onclick = () => modal.classList.remove('open');
  }
  if(modal){
    modal.onclick = (e) => { if(e.target === modal) modal.classList.remove('open'); };
  }
});

/* -------------------------------------------------------
   Welcome Modal (แสดงทุกครั้งที่โหลดหน้า)
------------------------------------------------------- */
function openWelcomeModal(){
  const modal = document.getElementById('welcomeModal');
  if(!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}
function closeWelcomeModal(){
  const modal = document.getElementById('welcomeModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  const nameInput = document.getElementById('name');
  if(nameInput) nameInput.focus();
}

document.addEventListener('DOMContentLoaded', () => {
  const modal  = document.getElementById('welcomeModal');
  const btnCta = document.getElementById('welcomeCtaBtn');
  const btnX   = document.getElementById('welcomeCloseBtn');
  if(!modal || !btnCta || !btnX) return;

  btnCta.addEventListener('click', closeWelcomeModal);
  btnX.addEventListener('click', closeWelcomeModal);
  modal.addEventListener('click', (e) => { if(e.target === modal) closeWelcomeModal(); });
  document.addEventListener('keydown', (e) => {
    if(modal.classList.contains('open') && e.key === 'Escape') closeWelcomeModal();
  });

  function openDupModal(html){
  const m = document.getElementById('dupModal');
  const msg = document.getElementById('dupMsg');
  if(!m || !msg) return;
  msg.innerHTML = html;
  m.classList.add('open');
}
function closeDupModal(){
  const m = document.getElementById('dupModal');
  if(!m) return;
  m.classList.remove('open');
}
document.addEventListener('DOMContentLoaded', () => {
  const m = document.getElementById('dupModal');
  const x = document.getElementById('dupCloseBtn');
  if(x) x.addEventListener('click', closeDupModal);
  if(m) m.addEventListener('click', (e)=>{ if(e.target === m) closeDupModal(); });
});


  // แสดงทุกครั้งที่รีเฟรช
  openWelcomeModal();
});
