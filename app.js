// app.js — SilentBridge Final

let trainCameraStream = null;
let trainCameraRunning = false;
let trainBusy = false;
let capturedTrainLandmarks = null;
let gestureDetectionOn = false;
let selectedFiles = [];

// ══════════════════════════════════
// PAGE NAVIGATION
// ══════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'page-train') { renderGesturesList(); updateStats(); }
}

// ══════════════════════════════════
// TOAST
// ══════════════════════════════════
function showToast(msg, dur=3000) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), dur);
}

// ══════════════════════════════════
// SERVER SYNC
// ══════════════════════════════════
async function pushGesturesToServer() {
  showToast('⏳ Pushing to server…');
  const ok = await GestureDB.pushToServer();
  showToast(ok ? `✅ ${GestureDB.count()} gestures pushed! Everyone gets them now.` : '❌ Server error.');
}

function downloadForGithub() {
  GestureDB.exportSlimForGithub();
  showToast('✅ gestures.json downloaded! Commit it to GitHub.');
}

function copyRoomId() {
  const id = document.getElementById('share-room-id').textContent;
  navigator.clipboard.writeText(id).then(() => showToast('📋 Copied: ' + id)).catch(() => showToast('ID: ' + id));
}

// ══════════════════════════════════
// STATS
// ══════════════════════════════════
function updateStats() {
  const c = GestureDB.count(), s = GestureDB.totalSamples();
  const r = c > 0 ? Math.min(100, Math.round((s/(c*3))*100)) : 0;
  document.getElementById('stat-gestures').textContent = c;
  document.getElementById('stat-samples').textContent  = s;
  document.getElementById('stat-ready').textContent    = r + '%';
  document.getElementById('gesture-count').textContent = c;
}

// ══════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════
function handleFileUpload(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  selectedFiles = files; showPreview(files);
}

function showPreview(files) {
  document.getElementById('preview-area').style.display = 'block';
  document.getElementById('preview-count').textContent = files.length + ' image' + (files.length>1?'s':'') + ' selected';
  const grid = document.getElementById('preview-grid');
  grid.innerHTML = '';
  files.forEach((f,i) => {
    const r = new FileReader();
    r.onload = e => {
      const d = document.createElement('div');
      d.className = 'preview-thumb-wrap';
      d.innerHTML = `<img src="${e.target.result}" class="preview-thumb"/><button class="thumb-remove" onclick="removeFile(${i})">✕</button>`;
      grid.appendChild(d);
    };
    r.readAsDataURL(f);
  });
}

function removeFile(i) {
  selectedFiles.splice(i,1);
  selectedFiles.length ? showPreview(selectedFiles) : clearPreview();
}

function clearPreview() {
  selectedFiles = [];
  document.getElementById('preview-area').style.display = 'none';
  document.getElementById('preview-grid').innerHTML = '';
  document.getElementById('file-input').value = '';
}

// ══════════════════════════════════
// STARTUP — load gestures from server
// ══════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  showToast('⏳ Loading gestures…', 2000);
  const count = await GestureDB.loadFromServer();
  showToast(count > 0 ? `✅ ${count} gestures ready!` : '⚠️ No gestures yet. Add some in Gesture Library.');

  const dz = document.getElementById('drop-zone');
  if (!dz) return;
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/'));
    if (files.length) { selectedFiles=files; showPreview(files); }
  });
});

// ══════════════════════════════════
// SAVE GESTURE
// ══════════════════════════════════
async function saveGesture() {
  const label = document.getElementById('gesture-label').value.trim();
  if (!label) { showToast('⚠️ Enter a label first'); return; }

  // Camera path
  if (document.getElementById('mode-camera').style.display !== 'none' && capturedTrainLandmarks) {
    const vid  = document.getElementById('train-video');
    const snap = document.createElement('canvas');
    snap.width=vid.videoWidth; snap.height=vid.videoHeight;
    snap.getContext('2d').drawImage(vid,0,0);
    await GestureDB.addSample(label, capturedTrainLandmarks.map(p=>[p.x,p.y,p.z]), snap.toDataURL('image/jpeg',0.6));
    showToast(`✅ "${label}" saved from camera!`);
    capturedTrainLandmarks=null; renderGesturesList(); updateStats(); return;
  }

  if (!selectedFiles.length) { showToast('⚠️ Select at least one image'); return; }

  const pw  = document.getElementById('progress-wrap');
  const pf  = document.getElementById('progress-fill');
  const pl  = document.getElementById('progress-label');
  const btn = document.getElementById('save-btn');
  pw.style.display='block'; btn.disabled=true; btn.textContent='⏳ Processing…';

  await Detector.init();
  let saved=0, failed=0;

  for (let i=0; i<selectedFiles.length; i++) {
    pf.style.width = Math.round((i/selectedFiles.length)*100)+'%';
    pl.textContent = `Processing ${i+1} of ${selectedFiles.length}…`;
    try {
      const url = await readAsURL(selectedFiles[i]);
      const img = await loadImg(url);
      const lm  = await Detector.processImage(img);
      if (lm) { await GestureDB.addSample(label, lm.map(p=>[p.x,p.y,p.z]), url); saved++; }
      else failed++;
    } catch(e) { failed++; }
    await new Promise(r=>setTimeout(r,80));
  }

  pf.style.width='100%'; pl.textContent='Done!';
  setTimeout(()=>{ pw.style.display='none'; pf.style.width='0%'; },1500);
  btn.disabled=false; btn.textContent='💾 Save Gesture';

  if (saved>0) {
    showToast(`✅ "${label}" saved! ${saved} image${saved>1?'s':''} learned.${failed?' ('+failed+' skipped)':''}`);
    document.getElementById('gesture-label').value=''; clearPreview(); renderGesturesList(); updateStats();
  } else {
    showToast('❌ No hands detected. Use clear photos with plain background.');
  }
}

function readAsURL(file) {
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(file); });
}
function loadImg(src) {
  return new Promise((res,rej)=>{ const img=new Image(); img.crossOrigin='anonymous'; img.onload=()=>res(img); img.onerror=rej; img.src=src; });
}

// ══════════════════════════════════
// GESTURE LIST
// ══════════════════════════════════
function renderGesturesList() {
  const all    = GestureDB.getAll();
  const search = (document.getElementById('gesture-search')?.value||'').toLowerCase();
  const list   = all.filter(g=>!search||g.label.toLowerCase().includes(search));
  const grid   = document.getElementById('gestures-grid');
  const empty  = document.getElementById('empty-state');
  if (!list.length) { grid.innerHTML=''; empty.style.display='flex'; return; }
  empty.style.display='none';
  grid.innerHTML = list.map(g=>{
    const thumb = Array.isArray(g.imageData)?g.imageData[0]:g.imageData;
    const n=g.sampleCount||1, q=n>=5?'🟢':n>=3?'🟡':'🔴';
    return `<div class="gesture-item">
      ${thumb?`<img class="gesture-thumb" src="${thumb}" onerror="this.style.display='none'"/>`:'<div class="gesture-thumb" style="background:var(--surface2);display:flex;align-items:center;justify-content:center">🤚</div>'}
      <div class="gesture-info"><div class="gesture-name">${g.label}</div><div class="gesture-pts">${q} ${n} sample${n>1?'s':''}</div></div>
      <button class="gesture-del" onclick="deleteGesture('${g.id}')">✕</button>
    </div>`;
  }).join('');
}

function deleteGesture(id) { GestureDB.delete(id); renderGesturesList(); updateStats(); showToast('🗑️ Deleted'); }
function clearAllGestures() {
  if(confirm('Delete ALL gestures?')){ GestureDB.clear(); renderGesturesList(); updateStats(); showToast('🗑️ Cleared'); }
}
function importGestures(e) {
  const file=e.target.files[0]; if(!file) return;
  const r=new FileReader();
  r.onload=ev=>{ const n=GestureDB.importFromFile(ev.target.result); if(n!==false){showToast(`✅ Imported ${n}`);renderGesturesList();updateStats();}else showToast('❌ Bad file'); };
  r.readAsText(file);
}

// ══════════════════════════════════
// TRAINING CAMERA
// ══════════════════════════════════
function switchToCamera() {
  const c=document.getElementById('mode-camera');
  c.style.display=c.style.display==='none'?'block':'none';
}
async function toggleCamera() { trainCameraRunning?stopTrainCamera():await startTrainCamera(); }

async function startTrainCamera() {
  try {
    trainCameraStream = await navigator.mediaDevices.getUserMedia({video:true});
    const vid=document.getElementById('train-video'), canvas=document.getElementById('train-overlay');
    vid.srcObject=trainCameraStream; await vid.play().catch(()=>{});
    trainCameraRunning=true;
    document.getElementById('cam-btn').textContent='⏹ Stop Camera';
    await Detector.init();

    Detector.hands.onResults(results=>{
      Detector.drawOnCanvas(canvas, vid, results.multiHandLandmarks);
      if(results.multiHandLandmarks?.length>0){
        capturedTrainLandmarks=results.multiHandLandmarks[0];
        document.getElementById('cam-hint').textContent='✅ Hand detected! Click Capture';
      } else {
        capturedTrainLandmarks=null;
        document.getElementById('cam-hint').textContent='✋ Show your hand gesture clearly';
      }
    });

    const loop=async()=>{
      if(!trainCameraRunning) return;
      if(vid.readyState>=2&&!Detector._busy){
        Detector._busy=true;
        try{await Detector.hands.send({image:vid});}catch(e){}
        Detector._busy=false;
      }
      setTimeout(loop,60);
    };
    loop();
  } catch(e){ showToast('❌ Camera denied'); }
}

function stopTrainCamera() {
  if(trainCameraStream){trainCameraStream.getTracks().forEach(t=>t.stop());trainCameraStream=null;}
  trainCameraRunning=false; capturedTrainLandmarks=null;
  document.getElementById('cam-btn').textContent='▶ Start Camera';
}

async function captureFromCamera() {
  if(!capturedTrainLandmarks){showToast('⚠️ No hand detected');return;}
  const label=document.getElementById('gesture-label').value.trim();
  if(!label){showToast('⚠️ Enter a label first');return;}
  const vid=document.getElementById('train-video');
  const snap=document.createElement('canvas');
  snap.width=vid.videoWidth; snap.height=vid.videoHeight;
  snap.getContext('2d').drawImage(vid,0,0);
  await GestureDB.addSample(label,capturedTrainLandmarks.map(p=>[p.x,p.y,p.z]),snap.toDataURL('image/jpeg',0.6));
  showToast(`✅ Captured "${label}"! Add more for better accuracy.`);
  capturedTrainLandmarks=null; renderGesturesList(); updateStats();
}

// ══════════════════════════════════
// CALL PAGE
// ══════════════════════════════════
async function createRoom() {
  showToast('⏳ Creating room…');
  try { const id=await Call.createRoom(); _enterCallUI(id); showToast('✅ Room ready! Share the ID.',4000); }
  catch(e){ showToast('❌ Could not create room'); }
}

async function joinRoom() {
  const raw=document.getElementById('join-room-input').value.trim().toUpperCase();
  if(!raw){showToast('⚠️ Enter a Room ID');return;}
  showToast('⏳ Joining…');
  try{await Call.joinRoom(raw);_enterCallUI(raw);}catch(e){}
}

function _enterCallUI(roomId) {
  document.getElementById('room-setup').style.display='none';
  document.getElementById('call-ui').style.display='flex';
  document.getElementById('room-id-display').textContent='Room: '+roomId;
  document.getElementById('share-room-id').textContent=roomId;
}

// ══════════════════════════════════
// GESTURE DETECTION IN CALL
// ══════════════════════════════════
async function toggleGestureDetection() {
  const btn=document.getElementById('btn-gesture');
  const status=document.getElementById('gesture-status');

  if(gestureDetectionOn){
    Detector.stop(); gestureDetectionOn=false;
    btn.classList.remove('active');
    status.textContent='● Off'; status.className='status-dot offline';
    const c=document.getElementById('local-overlay');
    c.getContext('2d').clearRect(0,0,c.width,c.height);
    showToast('✋ Gestures off'); return;
  }

  if(GestureDB.count()===0){showToast('⚠️ No gestures! Add in Gesture Library.');return;}
  if(!Call.localStream){showToast('⚠️ Start a call first.');return;}

  try {
    showToast('⏳ Starting…');
    await Detector.init();
    const vid=document.getElementById('local-video');
    const canvas=document.getElementById('local-overlay');

    Detector.startLoop(vid, canvas, label=>{
      document.getElementById('detected-text').textContent=label;
      const h=document.getElementById('text-history');
      const chip=document.createElement('div'); chip.className='history-chip'; chip.textContent=label;
      h.prepend(chip); while(h.children.length>10) h.removeChild(h.lastChild);
      Call.sendGesture(label);
    });

    gestureDetectionOn=true;
    btn.classList.add('active');
    status.textContent='● Detecting'; status.className='status-dot online';
    showToast('🤚 Gestures ON!');
  } catch(e){ showToast('❌ '+e.message); console.error(e); }
}

// ══════════════════════════════════
// CAMERA & MIC TOGGLES
// ══════════════════════════════════
function toggleCam() {
  const btn=document.getElementById('btn-cam');
  const on=Call.toggleCamera();
  btn.classList.toggle('active',!on);
  btn.innerHTML=(on?'📷':'🚫')+'<span>Camera</span>';
  showToast(on?'📷 Camera on':'🚫 Camera off');
}

function toggleMic() {
  const btn=document.getElementById('btn-mic');
  const on=Call.toggleMic();
  // muted class = red border to show it's off
  if(on){ btn.classList.remove('muted'); btn.classList.remove('active'); btn.innerHTML='🎤<span>Mic</span>'; showToast('🎤 Mic on'); }
  else  { btn.classList.add('muted');    btn.innerHTML='🔇<span>Muted</span>'; showToast('🔇 Mic muted'); }
}

// ══════════════════════════════════
// END CALL
// ══════════════════════════════════
function endCall() {
  if(!confirm('End the call?')) return;
  Detector.stop(); gestureDetectionOn=false; Call.end();
  document.getElementById('room-setup').style.display='block';
  document.getElementById('call-ui').style.display='none';
  document.getElementById('room-id-display').textContent='No Room';
  document.getElementById('join-room-input').value='';
  document.getElementById('detected-text').textContent='—';
  document.getElementById('text-history').innerHTML='';
  document.getElementById('gesture-status').textContent='● Off';
  document.getElementById('gesture-status').className='status-dot offline';
  document.getElementById('btn-gesture').classList.remove('active');
  document.getElementById('btn-cam').classList.remove('active','muted');
  document.getElementById('btn-cam').innerHTML='📷<span>Camera</span>';
  document.getElementById('btn-mic').classList.remove('active','muted');
  document.getElementById('btn-mic').innerHTML='🎤<span>Mic</span>';
  document.getElementById('remote-placeholder').style.display='flex';
  showToast('📵 Call ended');
}
