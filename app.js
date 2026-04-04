// app.js — SilentBridge

let trainCameraStream = null;
let trainCameraRunning = false;
let capturedTrainLandmarks = null;
let gestureDetectionOn = false;
let gestureCooldown = false;
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
function showToast(msg, duration=3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), duration);
}

// ══════════════════════════════════
// SERVER SYNC
// ══════════════════════════════════
async function pushGesturesToServer() {
  showToast('⏳ Pushing to server…');
  const ok = await GestureDB.pushToServer();
  showToast(ok
    ? `✅ ${GestureDB.count()} gestures pushed! Everyone will get them now.`
    : '❌ Could not reach server.');
}

// Download gestures.json for GitHub commit (landmarks only, no images)
function downloadForGithub() {
  GestureDB.exportSlimForGithub();
  showToast('✅ gestures.json downloaded! Now commit it to GitHub.');
}

// ══════════════════════════════════
// COPY ROOM ID
// ══════════════════════════════════
function copyRoomId() {
  const id = document.getElementById('share-room-id').textContent;
  navigator.clipboard.writeText(id)
    .then(() => showToast('📋 Room ID copied: ' + id))
    .catch(() => showToast('Room ID: ' + id));
}

// ══════════════════════════════════
// STATS BAR
// ══════════════════════════════════
function updateStats() {
  const count = GestureDB.count();
  const samples = GestureDB.totalSamples();
  const ready = count > 0 ? Math.min(100, Math.round((samples / (count * 3)) * 100)) : 0;
  document.getElementById('stat-gestures').textContent = count;
  document.getElementById('stat-samples').textContent = samples;
  document.getElementById('stat-ready').textContent = ready + '%';
  document.getElementById('gesture-count').textContent = count;
}

// ══════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════
function handleFileUpload(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  selectedFiles = files;
  showPreview(files);
}

function showPreview(files) {
  const area = document.getElementById('preview-area');
  const grid = document.getElementById('preview-grid');
  const countLabel = document.getElementById('preview-count');
  area.style.display = 'block';
  countLabel.textContent = files.length + ' image' + (files.length>1?'s':'') + ' selected';
  grid.innerHTML = '';
  files.forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = e => {
      const div = document.createElement('div');
      div.className = 'preview-thumb-wrap';
      div.innerHTML = `<img src="${e.target.result}" class="preview-thumb"/><button class="thumb-remove" onclick="removeFile(${i})">✕</button>`;
      grid.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}

function removeFile(i) {
  selectedFiles.splice(i, 1);
  selectedFiles.length ? showPreview(selectedFiles) : clearPreview();
}

function clearPreview() {
  selectedFiles = [];
  document.getElementById('preview-area').style.display = 'none';
  document.getElementById('preview-grid').innerHTML = '';
  document.getElementById('file-input').value = '';
}

// ══════════════════════════════════
// DRAG AND DROP + AUTO LOAD
// ══════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Auto-load gestures from server for ALL devices
  showToast('⏳ Loading gestures…', 2000);
  const count = await GestureDB.loadFromServer();
  showToast(count > 0
    ? `✅ ${count} gestures ready to use!`
    : '⚠️ No gestures on server yet. Go to Gesture Library to add some.');

  const dz = document.getElementById('drop-zone');
  if (!dz) return;
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) { selectedFiles = files; showPreview(files); }
  });
});

// ══════════════════════════════════
// SAVE GESTURE
// ══════════════════════════════════
async function saveGesture() {
  const label = document.getElementById('gesture-label').value.trim();
  if (!label) { showToast('⚠️ Enter a gesture label first'); return; }

  // Camera capture path
  if (document.getElementById('mode-camera').style.display !== 'none' && capturedTrainLandmarks) {
    const vid = document.getElementById('train-video');
    const snap = document.createElement('canvas');
    snap.width = vid.videoWidth; snap.height = vid.videoHeight;
    snap.getContext('2d').drawImage(vid, 0, 0);
    await GestureDB.addSample(label, capturedTrainLandmarks.map(lm=>[lm.x,lm.y,lm.z]), snap.toDataURL('image/jpeg',0.6));
    showToast(`✅ "${label}" captured!`);
    capturedTrainLandmarks = null;
    renderGesturesList(); updateStats(); return;
  }

  if (!selectedFiles.length) { showToast('⚠️ Select images first'); return; }

  const progressWrap  = document.getElementById('progress-wrap');
  const progressFill  = document.getElementById('progress-fill');
  const progressLabel = document.getElementById('progress-label');
  const saveBtn       = document.getElementById('save-btn');
  progressWrap.style.display = 'block';
  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ Processing…';

  await Detector.init();
  let saved = 0, failed = 0;

  for (let i = 0; i < selectedFiles.length; i++) {
    progressFill.style.width = Math.round((i / selectedFiles.length) * 100) + '%';
    progressLabel.textContent = `Processing image ${i+1} of ${selectedFiles.length}…`;
    try {
      const dataUrl = await readFileAsDataURL(selectedFiles[i]);
      const img     = await loadImage(dataUrl);
      const lm      = await Detector.processImage(img);
      if (lm) {
        await GestureDB.addSample(label, lm.map(p=>[p.x,p.y,p.z]), dataUrl);
        saved++;
      } else { failed++; }
    } catch(e) { failed++; }
    await new Promise(r => setTimeout(r, 80));
  }

  progressFill.style.width = '100%';
  progressLabel.textContent = 'Done!';
  setTimeout(() => { progressWrap.style.display='none'; progressFill.style.width='0%'; }, 1500);
  saveBtn.disabled = false;
  saveBtn.textContent = '💾 Save Gesture';

  if (saved > 0) {
    showToast(`✅ "${label}" saved! ${saved} image${saved>1?'s':''} learned.${failed>0?' ('+failed+' skipped — no hand found)':''}`);
    document.getElementById('gesture-label').value = '';
    clearPreview();
    renderGesturesList(); updateStats();
  } else {
    showToast('❌ No hands detected. Use clearer photos with plain background.');
  }
}

function readFileAsDataURL(file) {
  return new Promise((res,rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((res,rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// ══════════════════════════════════
// RENDER GESTURE LIST
// ══════════════════════════════════
function renderGesturesList() {
  const all      = GestureDB.getAll();
  const search   = (document.getElementById('gesture-search')?.value||'').toLowerCase();
  const filtered = all.filter(g => !search || g.label.toLowerCase().includes(search));
  const grid     = document.getElementById('gestures-grid');
  const empty    = document.getElementById('empty-state');
  if (!filtered.length) { grid.innerHTML=''; empty.style.display='flex'; return; }
  empty.style.display = 'none';
  grid.innerHTML = filtered.map(g => {
    const thumb = Array.isArray(g.imageData) ? g.imageData[0] : g.imageData;
    const n = g.sampleCount || 1;
    const q = n>=5?'🟢':n>=3?'🟡':'🔴';
    return `
      <div class="gesture-item">
        ${thumb ? `<img class="gesture-thumb" src="${thumb}" onerror="this.style.display='none'"/>` : '<div class="gesture-thumb" style="background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:1.2rem">🤚</div>'}
        <div class="gesture-info">
          <div class="gesture-name">${g.label}</div>
          <div class="gesture-pts">${q} ${n} sample${n>1?'s':''}</div>
        </div>
        <button class="gesture-del" onclick="deleteGesture('${g.id}')">✕</button>
      </div>`;
  }).join('');
}

function deleteGesture(id) {
  GestureDB.delete(id);
  renderGesturesList(); updateStats();
  showToast('🗑️ Gesture deleted');
}

function clearAllGestures() {
  if (confirm('Delete ALL gestures? This clears them for everyone!')) {
    GestureDB.clear(); renderGesturesList(); updateStats();
    showToast('🗑️ All gestures cleared');
  }
}

function importGestures(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const count = GestureDB.importFromFile(e.target.result);
    if (count !== false) { showToast(`✅ Imported ${count} gestures!`); renderGesturesList(); updateStats(); }
    else showToast('❌ Invalid file');
  };
  reader.readAsText(file);
}

// ══════════════════════════════════
// TRAINING CAMERA
// ══════════════════════════════════
function switchToCamera() {
  const cam = document.getElementById('mode-camera');
  cam.style.display = cam.style.display === 'none' ? 'block' : 'none';
}

async function toggleCamera() {
  trainCameraRunning ? stopTrainCamera() : await startTrainCamera();
}

async function startTrainCamera() {
  try {
    trainCameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const vid    = document.getElementById('train-video');
    const canvas = document.getElementById('train-overlay');
    vid.srcObject = trainCameraStream;
    await vid.play().catch(()=>{});
    trainCameraRunning = true;
    document.getElementById('cam-btn').textContent = '⏹ Stop Camera';

    await Detector.init();

    // Override onResults just for training camera
    Detector.hands.onResults(results => {
      Detector._drawOnCanvas(canvas, vid, results.multiHandLandmarks);
      if (results.multiHandLandmarks?.length > 0) {
        capturedTrainLandmarks = results.multiHandLandmarks[0];
        document.getElementById('cam-hint').textContent = '✅ Hand detected! Click Capture';
      } else {
        capturedTrainLandmarks = null;
        document.getElementById('cam-hint').textContent = '✋ Show your hand gesture clearly';
      }
    });

    // Simple loop for training camera
    const loop = async () => {
      if (!trainCameraRunning) return;
      if (vid.readyState >= 2 && !vid.paused && !Detector._sending) {
        Detector._sending = true;
        try { await Detector.hands.send({ image: vid }); } catch(e) {}
        Detector._sending = false;
      }
      setTimeout(loop, 80);
    };
    loop();

  } catch(e) { showToast('❌ Camera access denied'); }
}

function stopTrainCamera() {
  if (trainCameraStream) { trainCameraStream.getTracks().forEach(t=>t.stop()); trainCameraStream=null; }
  trainCameraRunning = false; capturedTrainLandmarks = null;
  document.getElementById('cam-btn').textContent = '▶ Start Camera';
}

async function captureFromCamera() {
  if (!capturedTrainLandmarks) { showToast('⚠️ No hand detected'); return; }
  const label = document.getElementById('gesture-label').value.trim();
  if (!label) { showToast('⚠️ Enter a label first'); return; }
  const vid = document.getElementById('train-video');
  const snap = document.createElement('canvas');
  snap.width=vid.videoWidth; snap.height=vid.videoHeight;
  snap.getContext('2d').drawImage(vid,0,0);
  await GestureDB.addSample(label, capturedTrainLandmarks.map(lm=>[lm.x,lm.y,lm.z]), snap.toDataURL('image/jpeg',0.6));
  showToast(`✅ Captured! Add more for better accuracy.`);
  capturedTrainLandmarks = null;
  renderGesturesList(); updateStats();
}

// ══════════════════════════════════
// CALL PAGE
// ══════════════════════════════════
async function createRoom() {
  showToast('⏳ Creating room…');
  try { const id = await Call.createRoom(); _enterCallUI(id); showToast('✅ Room ready! Share the ID.', 4000); }
  catch(e) { showToast('❌ Could not create room'); }
}

async function joinRoom() {
  const raw = document.getElementById('join-room-input').value.trim().toUpperCase();
  if (!raw) { showToast('⚠️ Enter a Room ID'); return; }
  showToast('⏳ Joining…');
  try { await Call.joinRoom(raw); _enterCallUI(raw); }
  catch(e) {}
}

function _enterCallUI(roomId) {
  document.getElementById('room-setup').style.display = 'none';
  document.getElementById('call-ui').style.display = 'flex';
  document.getElementById('room-id-display').textContent = 'Room: ' + roomId;
  document.getElementById('share-room-id').textContent = roomId;
}

async function toggleGestureDetection() {
  const btn    = document.getElementById('btn-gesture');
  const status = document.getElementById('gesture-status');

  if (gestureDetectionOn) {
    Detector.stop();
    gestureDetectionOn = false;
    btn.classList.remove('active');
    status.textContent = '● Off';
    status.className = 'status-dot offline';
    // Clear canvas
    const c = document.getElementById('local-overlay');
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    showToast('✋ Gestures off');
    return;
  }

  if (GestureDB.count() === 0) { showToast('⚠️ No gestures! Add some in Gesture Library.'); return; }
  if (!Call.localStream)       { showToast('⚠️ Start a call first.'); return; }

  try {
    showToast('⏳ Starting gesture detector…');
    await Detector.init();

    const localVid    = document.getElementById('local-video');
    const localCanvas = document.getElementById('local-overlay');

    // startLoop handles everything — no manual loops needed
    Detector.startLoop(localVid, localCanvas, (label) => {
      document.getElementById('detected-text').textContent = label;
      const history = document.getElementById('text-history');
      const chip = document.createElement('div');
      chip.className = 'history-chip';
      chip.textContent = label;
      history.prepend(chip);
      while (history.children.length > 10) history.removeChild(history.lastChild);
      Call.sendGesture(label);
    });

    gestureDetectionOn = true;
    btn.classList.add('active');
    status.textContent = '● Detecting';
    status.className = 'status-dot online';
    showToast('🤚 Gestures ON! Do your hand gestures.');
  } catch(e) {
    console.error('Gesture detection error:', e);
    showToast('❌ Error starting gestures: ' + e.message);
  }
}

function toggleCam() {
  const btn     = document.getElementById('btn-cam');
  const enabled = Call.toggleCamera();
  btn.classList.toggle('active', !enabled);
  btn.innerHTML = (enabled?'📷':'🚫')+'<span>Camera</span>';
  showToast(enabled ? '📷 Camera on' : '🚫 Camera off');
}

function toggleMic() {
  const btn     = document.getElementById('btn-mic');
  const enabled = Call.toggleMic();
  btn.classList.toggle('active', !enabled);
  btn.innerHTML = (enabled?'🎤':'🔇')+'<span>Mic</span>';
  showToast(enabled ? '🎤 Mic on' : '🔇 Mic muted');
}

function endCall() {
  if (!confirm('End the call?')) return;
  Detector.stop(); gestureDetectionOn = false; Call.end();
  document.getElementById('room-setup').style.display = 'block';
  document.getElementById('call-ui').style.display = 'none';
  document.getElementById('room-id-display').textContent = 'No Room';
  document.getElementById('join-room-input').value = '';
  document.getElementById('detected-text').textContent = '—';
  document.getElementById('text-history').innerHTML = '';
  document.getElementById('gesture-status').textContent = '● Off';
  document.getElementById('gesture-status').className = 'status-dot offline';
  document.getElementById('btn-gesture').classList.remove('active');
  document.getElementById('btn-cam').classList.remove('active');
  document.getElementById('btn-cam').innerHTML = '📷<span>Camera</span>';
  document.getElementById('btn-mic').classList.remove('active');
  document.getElementById('btn-mic').innerHTML = '🎤<span>Mic</span>';
  document.getElementById('remote-placeholder').style.display = 'flex';
  showToast('📵 Call ended');
}
