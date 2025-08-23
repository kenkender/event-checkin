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
function ensureHighlightStyles(svgDoc){
  if(!svgDoc) return;
  if(svgDoc.getElementById('seatHighlightStyles')) return;
  const style = svgDoc.createElementNS('http://www.w3.org/2000/svg','style');
  style.id = 'seatHighlightStyles';
  style.textContent = `
    @keyframes seat-blink{
      0%{stroke:#b2c0ff; filter:drop-shadow(0 0 16px #579aff);}
      40%{stroke:#ff5b5b; filter:drop-shadow(0 0 32px #e32c2c);}
      60%{stroke:#5792ff; filter:drop-shadow(0 0 42px #5784ff);}
      80%{stroke:#ff3939; filter:drop-shadow(0 0 22px #ff5757);}
      100%{stroke:#144bfd; filter:drop-shadow(0 0 16px #5776ff);}
    }
    .seat-highlight{
      stroke:#fd5959 !important;
      stroke-width:7px !important;
      filter:drop-shadow(0 0 22px #577eff);
      animation:seat-blink .7s cubic-bezier(.7,.1,1,1.1) infinite alternate;
    }
    @keyframes seat-fill-blink{
      0%{fill:#3078ff; filter:drop-shadow(0 0 18px #ffe957);}
      40%{fill:#e32c2c; filter:drop-shadow(0 0 36px #e32c2c);}
      60%{fill:#5776ff; filter:drop-shadow(0 0 46px #ffe957);}
      80%{fill:#ff5d57; filter:drop-shadow(0 0 24px #ffe957);}
      100%{fill:#578cff; filter:drop-shadow(0 0 16px #ffe957);}
    }
    rect.seat-bg-highlight,
    circle.seat-bg-highlight,
    ellipse.seat-bg-highlight,
    path.seat-bg-highlight,
    polygon.seat-bg-highlight{
      fill:#ff95e8 !important;
      animation:seat-fill-blink .7s cubic-bezier(.7,.1,1,1.1) infinite alternate;
    }
  `;
  svgDoc.documentElement.appendChild(style);
}
function clearHighlightsInDoc(svgDoc){
  if(!svgDoc) return;
  svgDoc.querySelectorAll('.seat-highlight').forEach(el=>el.classList.remove('seat-highlight'));
  svgDoc.querySelectorAll('.seat-bg-highlight').forEach(el=>el.classList.remove('seat-bg-highlight'));
}
function applyHighlightInDoc(svgDoc, seatId){
  if(!svgDoc || !seatId) return;
  ensureHighlightStyles(svgDoc);
  const seat = svgDoc.getElementById(seatId);
  if(!seat) return;

  // กรณีเป็นกลุ่ม (<g>) ให้เลือกชิ้นส่วนที่เป็นสี่เหลี่ยมหรือวงกลมภายใน
  // เพื่อให้เอฟเฟกต์เส้นและพื้นหลังทำงานได้ถูกต้อง
  // ไว้ทั้งกลุ่มและชิ้นส่วนภายใน เพื่อรองรับโครงสร้าง SVG ที่หลากหลาย
  const elements = [];
  if(seat.tagName.toLowerCase() === 'g'){
    elements.push(seat);
    const shape = seat.querySelector('rect, circle, ellipse, path, polygon');
    if(shape) elements.push(shape);
  }else{
    elements.push(seat);
  }
  
   elements.forEach(el=>{
    el.classList.remove('seat-highlight', 'seat-bg-highlight');
    void el.offsetWidth;
    el.classList.add('seat-highlight');
    if(/rect|circle|ellipse|path|polygon/i.test(el.tagName)){
      el.classList.add('seat-bg-highlight');
    }
    });
}

/* ให้มีไฮไลต์ได้ทีละที่เดียว */
function highlightSeat(seatId){
  currentSeatId = seatId || null;

  const objMain  = document.getElementById('seating-map');
  const objModal = document.getElementById('seating-map-modal');

  if(objMain && objMain.contentDocument)  clearHighlightsInDoc(objMain.contentDocument);
  if(objModal && objModal.contentDocument) clearHighlightsInDoc(objModal.contentDocument);

  const applyTo = (obj) => {
    if(!obj) return;
    const run = () => {
      if(obj.contentDocument && seatId){
        applyHighlightInDoc(obj.contentDocument, seatId);
      }
    };
    if(obj.contentDocument){
      run();
    }else if(seatId){
      obj.addEventListener('load', run, { once:true });
    }
  };

  applyTo(objMain);
  applyTo(objModal);
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
    // แสดงผลปกติ
    showResult(
      `✅ เช็คอินสำเร็จ! ที่นั่งของคุณคือ <span style="color:#e32c2c">${data.seat}</span><br>
       <span style="color:#ffe957;font-size:0.97em;">Check-in successful! Your seat is<br><span style="color:#e32c2c">${data.seat_en || data.seat}</span></span>`,
      true
    );
    highlightSeat(data.seat);

    // ถ้าเช็คอินซ้ำ => เปิด modal แจ้งเตือน
    if (data.already) {
      openDupModal(`
        <div style="margin-bottom:8px;">คุณได้เช็คอินเรียบร้อยแล้ว</div>
        <div style="font-weight:700; margin-bottom:6px;">
          ที่นั่งของคุณคือ <span style="color:#e32c2c">${data.seat}</span>
        </div>
        <div style="opacity:.9">You have already checked in.<br>Your seat is <b>${data.seat_en || data.seat}</b>.</div>
      `);
    }
  }else{
    showResult(data.error, false);
    highlightSeat(null);
  }
}catch(e){
  showResult("เกิดข้อผิดพลาดกับเซิร์ฟเวอร์ / Server error", false);
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

function openDupModal(msgHtml){
  const m = document.getElementById('dupModal');
  const body = document.getElementById('dupBody');
  const ok = document.getElementById('dupOkBtn');
  const x = document.getElementById('dupCloseBtn');
  if(!m || !body) return;
  body.innerHTML = msgHtml;
  m.classList.add('open');
  m.setAttribute('aria-hidden','false');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  const close = () => closeDupModal();
  if(ok) ok.onclick = close;
  if(x)  x.onclick  = close;
  m.onclick = (e)=>{ if(e.target === m) closeDupModal(); };
  document.addEventListener('keydown', escCloseOnce);
}
function escCloseOnce(e){
  const m = document.getElementById('dupModal');
  if(e.key === 'Escape' && m && m.classList.contains('open')) closeDupModal();
  document.removeEventListener('keydown', escCloseOnce);
}
function closeDupModal(){
  const m = document.getElementById('dupModal');
  if(!m) return;
  m.classList.remove('open');
  m.setAttribute('aria-hidden','true');
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
}
