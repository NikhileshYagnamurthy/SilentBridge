// app.js — SilentBridge

let trainCameraStream = null;
let trainCameraRunning = false;
let capturedTrainLandmarks = null;
let gestureDetectionOn = false;
let gestureCooldown = false;
let selectedFiles = []; // files queued for upload

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
// FILE UPLOAD HANDLING
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
  countLabel.textContent = files.length + ' image' + (files.length > 1 ? 's' : '') + ' selected';
  grid.innerHTML = '';

  files.forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement('div');
      div.className = 'preview-thumb-wrap';
      div.innerHTML = `
        <img src="${e.target.result}" class="preview-thumb"/>
        <button class="thumb-remove" onclick="removeFile(${i})">✕</button>
      `;
      grid.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  if (selectedFiles.length === 0) {
    clearPreview();
  } else {
    showPreview(selectedFiles);
  }
}

function clearPreview() {
  selectedFiles = [];
  document.getElementById('preview-area').style.display = 'none';
  document.getElementById('preview-grid').innerHTML = '';
  document.getElementById('file-input').value = '';
}

// Drag and drop
document.addEventListener('DOMContentLoaded', () => {
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
// SAVE GESTURE (processes all selected images)
// ══════════════════════════════════
async function saveGesture() {
  const label = document.getElementById('gesture-label').value.trim();
  if (!label) { showToast('⚠️ Enter a gesture label first'); return; }

  // Camera mode capture
  if (document.getElementById('mode-camera').style.display !== 'none' && capturedTrainLandmarks) {
    const vid = document.getElementById('train-video');
    const snap = document.createElement('canvas');
    snap.width = vid.videoWidth; snap.height = vid.videoHeight;
    snap.getContext('2d').drawImage(vid, 0, 0);
    const lmArray = capturedTrainLandmarks.map(lm => [lm.x, lm.y, lm.z]);
    GestureDB.addSample(label, lmArray, snap.toDataURL('image/jpeg', 0.6));
    showToast(`✅ "${label}" saved from camera!`);
    capturedTrainLandmarks = null;
    renderGesturesList(); updateStats(); return;
  }

  if (!selectedFiles.length) { showToast('⚠️ Select at least one image first'); return; }

  // Show progress
  const progressWrap = document.getElementById('progress-wrap');
  const progressFill = document.getElementById('progress-fill');
  const progressLabel = document.getElementById('progress-label');
  const saveBtn = document.getElementById('save-btn');
  progressWrap.style.display = 'block';
  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ Processing…';

  await Detector.init();

  let saved = 0;
  let failed = 0;

  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    const pct = Math.round(((i) / selectedFiles.length) * 100);
    progressFill.style.width = pct + '%';
    progressLabel.textContent = `Processing image ${i+1} of ${selectedFiles.length}…`;

    try {
      const dataUrl = await readFileAsDataURL(file);
      const img = await loadImage(dataUrl);
      const landmarks = await Detector.processImage(img);

      if (landmarks) {
        const lmArray = landmarks.map(lm => [lm.x, lm.y, lm.z]);
        GestureDB.addSample(label, lmArray, dataUrl);
        saved++;
      } else {
        failed++;
        console.warn('No hand detected in:', file.name);
      }
    } catch(e) {
      failed++;
      console.error('Error processing:', file.name, e);
    }

    // Small delay so UI can update
    await new Promise(r => setTimeout(r, 80));
  }

  progressFill.style.width = '100%';
  progressLabel.textContent = 'Done!';

  setTimeout(() => {
    progressWrap.style.display = 'none';
    progressFill.style.width = '0%';
  }, 1500);

  saveBtn.disabled = false;
  saveBtn.textContent = '💾 Save Gesture';

  if (saved > 0) {
    showToast(`✅ "${label}" saved! ${saved} image${saved>1?'s':''} learned${failed>0?' ('+failed+' had no hand detected)':''}.`);
    document.getElementById('gesture-label').value = '';
    clearPreview();
    renderGesturesList();
    updateStats();
  } else {
    showToast('❌ No hands detected in any image. Try clearer photos with a plain background.');
  }
}

// ══════════════════════════════════
// HELPERS
// ══════════════════════════════════
function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res(e.target.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// ══════════════════════════════════
// RENDER GESTURES LIST
// ══════════════════════════════════
function renderGesturesList() {
  const all = GestureDB.getAll();
  const search = (document.getElementById('gesture-search')?.value || '').toLowerCase();
  const filtered = all.filter(g => !search || g.label.toLowerCase().includes(search));

  const grid = document.getElementById('gestures-grid');
  const empty = document.getElementById('empty-state');

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = filtered.map(g => {
    const thumbSrc = Array.isArray(g.imageData) ? g.imageData[0] : g.imageData;
    const sampleCount = g.sampleCount || 1;
    const quality = sampleCount >= 5 ? '🟢' : sampleCount >= 3 ? '🟡' : '🔴';
    return `
      <div class="gesture-item">
        <img class="gesture-thumb" src="${thumbSrc || ''}" onerror="this.style.display='none'"/>
        <div class="gesture-info">
          <div class="gesture-name">${g.label}</div>
          <div class="gesture-pts">${quality} ${sampleCount} image${sampleCount>1?'s':''}</div>
        </div>
        <button class="gesture-del" onclick="deleteGesture('${g.id}')" title="Delete">✕</button>
      </div>
    `;
  }).join('');
}

function deleteGesture(id) {
  GestureDB.delete(id);
  renderGesturesList();
  updateStats();
  showToast('🗑️ Gesture deleted');
}

function clearAllGestures() {
  if (confirm('Delete ALL saved gestures? This cannot be undone.')) {
    GestureDB.clear();
    renderGesturesList();
    updateStats();
    showToast('🗑️ All gestures cleared');
  }
}

// ══════════════════════════════════
// IMPORT GESTURES
// ══════════════════════════════════
function importGestures(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const count = GestureDB.importFromFile(e.target.result);
    if (count !== false) {
      showToast(`✅ Imported ${count} gestures!`);
      renderGesturesList();
      updateStats();
    } else {
      showToast('❌ Invalid file format');
    }
  };
  reader.readAsText(file);
}

// ══════════════════════════════════
// CAMERA (for training)
// ══════════════════════════════════
function switchToCamera() {
  const cam = document.getElementById('mode-camera');
  cam.style.display = cam.style.display === 'none' ? 'block' : 'none';
}

async function toggleCamera() {
  if (trainCameraRunning) {
    stopTrainCamera();
  } else {
    await startTrainCamera();
  }
}

async function startTrainCamera() {
  try {
    trainCameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const vid = document.getElementById('train-video');
    const canvas = document.getElementById('train-overlay');
    vid.srcObject = trainCameraStream;
    await vid.play().catch(() => {});
    trainCameraRunning = true;
    document.getElementById('cam-btn').textContent = '⏹ Stop Camera';
    await Detector.init();
    Detector.hands.onResults((results) => {
      const ctx = canvas.getContext('2d');
      // Use raw video resolution for the canvas pixel buffer
      canvas.width = vid.videoWidth || 640;
      canvas.height = vid.videoHeight || 480;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Mirror to match the mirrored camera view
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-canvas.width, 0);
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const lm of results.multiHandLandmarks) {
          drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: '#7c6dfa', lineWidth: 2 });
          drawLandmarks(ctx, lm, { color: '#fa6d9a', radius: 4 });
        }
        ctx.restore();
        capturedTrainLandmarks = results.multiHandLandmarks[0];
        document.getElementById('cam-hint').textContent = '✅ Hand detected! Click Capture';
      } else {
        ctx.restore();
        capturedTrainLandmarks = null;
        document.getElementById('cam-hint').textContent = '✋ Show your hand gesture clearly';
      }
    });
    const loop = async () => {
      if (!trainCameraRunning) return;
      if (vid.readyState >= 2) { try { await Detector.hands.send({ image: vid }); } catch(e) {} }
      requestAnimationFrame(loop);
    };
    loop();
  } catch(e) { showToast('❌ Camera access denied'); }
}

function stopTrainCamera() {
  if (trainCameraStream) { trainCameraStream.getTracks().forEach(t => t.stop()); trainCameraStream = null; }
  trainCameraRunning = false;
  capturedTrainLandmarks = null;
  document.getElementById('cam-btn').textContent = '▶ Start Camera';
  document.getElementById('cam-hint').textContent = '📸 Show your hand gesture clearly';
}

async function captureFromCamera() {
  if (!capturedTrainLandmarks) { showToast('⚠️ No hand detected yet. Show your hand to camera.'); return; }
  const label = document.getElementById('gesture-label').value.trim();
  if (!label) { showToast('⚠️ Enter a label first'); return; }
  const vid = document.getElementById('train-video');
  const snap = document.createElement('canvas');
  snap.width = vid.videoWidth; snap.height = vid.videoHeight;
  snap.getContext('2d').drawImage(vid, 0, 0);
  const lmArray = capturedTrainLandmarks.map(lm => [lm.x, lm.y, lm.z]);
  GestureDB.addSample(label, lmArray, snap.toDataURL('image/jpeg', 0.6));
  showToast(`✅ Captured! Keep going to add more samples for "${label}"`);
  capturedTrainLandmarks = null;
  renderGesturesList(); updateStats();
}

// ══════════════════════════════════
// CALL PAGE
// ══════════════════════════════════
async function createRoom() {
  showToast('⏳ Setting up room…');
  try {
    const roomId = await Call.createRoom();
    _enterCallUI(roomId);
    showToast('✅ Room ready! Share the Room ID.', 5000);
  } catch(e) { showToast('❌ Could not create room'); }
}

async function joinRoom() {
  const raw = document.getElementById('join-room-input').value.trim().toUpperCase();
  if (!raw) { showToast('⚠️ Enter a Room ID'); return; }
  showToast('⏳ Joining room…');
  try { await Call.joinRoom(raw); _enterCallUI(raw); } catch(e) {}
}

function _enterCallUI(roomId) {
  document.getElementById('room-setup').style.display = 'none';
  document.getElementById('call-ui').style.display = 'flex';
  document.getElementById('room-id-display').textContent = 'Room: ' + roomId;
  document.getElementById('share-room-id').textContent = roomId;
}

async function toggleGestureDetection() {
  const btn = document.getElementById('btn-gesture');
  const status = document.getElementById('gesture-status');

  if (gestureDetectionOn) {
    Detector.stop();
    gestureDetectionOn = false;
    btn.classList.remove('active');
    status.textContent = '● Off';
    status.className = 'status-dot offline';
    showToast('✋ Gesture detection off');
    return;
  }

  if (GestureDB.count() === 0) {
    showToast('⚠️ No gestures saved! Go to Gesture Library first.');
    return;
  }
  if (!Call.localStream) {
    showToast('⚠️ Start a call first.');
    return;
  }

  try {
    await Detector.init();
    const localVid = document.getElementById('local-video');
    const localCanvas = document.getElementById('local-overlay');
    Detector.activeCanvas = localCanvas;
    Detector.activeVideo = localVid;
    Detector.isRunning = true;

    Detector.hands.onResults((results) => {
      const ctx = localCanvas.getContext('2d');
      // Match canvas to actual displayed video dimensions (not raw resolution)
      // This fixes the 2cm offset bug caused by object-fit scaling
      localCanvas.width = localVid.videoWidth || 640;
      localCanvas.height = localVid.videoHeight || 480;
      ctx.clearRect(0, 0, localCanvas.width, localCanvas.height);
      // Mirror the canvas to match mirrored video
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-localCanvas.width, 0);

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const lm of results.multiHandLandmarks) {
          drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: '#7c6dfa', lineWidth: 2 });
          drawLandmarks(ctx, lm, { color: '#6dfabc', radius: 3 });
        }
        ctx.restore();
        const matched = Detector._matchGesture(results.multiHandLandmarks[0]);
        if (matched && !gestureCooldown) {
          gestureCooldown = true;
          setTimeout(() => { gestureCooldown = false; }, 1500);
          document.getElementById('detected-text').textContent = matched;
          Call.sendGesture(matched);
        }
      } else {
        ctx.restore();
        ctx.clearRect(0, 0, localCanvas.width, localCanvas.height);
      }
    });

    const detectLoop = async () => {
      if (!Detector.isRunning) return;
      if (localVid.readyState >= 2 && !localVid.paused) {
        try { await Detector.hands.send({ image: localVid }); } catch(e) {}
      }
      requestAnimationFrame(detectLoop);
    };
    detectLoop();

    gestureDetectionOn = true;
    btn.classList.add('active');
    status.textContent = '● Detecting';
    status.className = 'status-dot online';
    showToast('🤚 Gesture detection ON!');
  } catch(e) {
    showToast('❌ Could not start gesture detector: ' + e.message);
  }
}

function toggleCam() {
  const btn = document.getElementById('btn-cam');
  const enabled = Call.toggleCamera();
  btn.classList.toggle('active', !enabled);
  btn.innerHTML = (enabled ? '📷' : '🚫') + '<span>Camera</span>';
  showToast(enabled ? '📷 Camera on' : '🚫 Camera off');
}

function endCall() {
  if (confirm('End the call?')) {
    Detector.stop();
    gestureDetectionOn = false;
    Call.end();
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
    document.getElementById('remote-placeholder').style.display = 'flex';
    showToast('📵 Call ended');
  }
}
