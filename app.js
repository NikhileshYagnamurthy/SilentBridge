// app.js — Fixed version

let trainCameraStream = null;
let trainCameraRunning = false;
let capturedTrainLandmarks = null;
let gestureDetectionOn = false;
let lastSentGesture = null;
let gestureCooldown = false;

// ═══════════════════════════════════════
// PAGE NAVIGATION
// ═══════════════════════════════════════

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  if (pageId === 'page-train') renderGesturesList();
}

// ═══════════════════════════════════════
// TOAST
// ═══════════════════════════════════════

function showToast(msg, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ═══════════════════════════════════════
// COPY TO CLIPBOARD
// ═══════════════════════════════════════

function copyRoomId() {
  const id = document.getElementById('share-room-id').textContent;
  navigator.clipboard.writeText(id).then(() => {
    showToast('📋 Room ID copied: ' + id);
  }).catch(() => {
    showToast('Room ID: ' + id + ' (copy manually)');
  });
}

// ═══════════════════════════════════════
// TRAINING PAGE
// ═══════════════════════════════════════

function switchTab(mode) {
  document.getElementById('mode-upload').style.display = mode === 'upload' ? 'block' : 'none';
  document.getElementById('mode-camera').style.display = mode === 'camera' ? 'block' : 'none';
  document.getElementById('tab-upload').classList.toggle('active', mode === 'upload');
  document.getElementById('tab-camera').classList.toggle('active', mode === 'camera');
  if (mode !== 'camera') stopTrainCamera();
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById('preview-img');
    img.src = e.target.result;
    img.style.display = 'block';
    capturedTrainLandmarks = null;
  };
  reader.readAsDataURL(file);
}

document.addEventListener('DOMContentLoaded', () => {
  const dz = document.getElementById('drop-zone');
  if (dz) {
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; });
    dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; });
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (re) => {
          const img = document.getElementById('preview-img');
          img.src = re.target.result;
          img.style.display = 'block';
          capturedTrainLandmarks = null;
        };
        reader.readAsDataURL(file);
      }
    });
  }
});

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

    document.getElementById('cam-btn').textContent = '📸 Capture This Gesture';
    document.getElementById('cam-hint').textContent = '✋ Show your hand gesture clearly';

    await Detector.init();

    // Reuse the hands instance directly — manual frame loop
    Detector.hands.onResults((results) => {
      const ctx = canvas.getContext('2d');
      canvas.width = vid.videoWidth || 640;
      canvas.height = vid.videoHeight || 480;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const lm of results.multiHandLandmarks) {
          drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: '#7c6dfa', lineWidth: 2 });
          drawLandmarks(ctx, lm, { color: '#fa6d9a', radius: 4 });
        }
        capturedTrainLandmarks = results.multiHandLandmarks[0];
        document.getElementById('cam-hint').textContent = '✅ Hand detected! Click Capture';
      } else {
        capturedTrainLandmarks = null;
        document.getElementById('cam-hint').textContent = '✋ Show your hand gesture clearly';
      }
    });

    const loop = async () => {
      if (!trainCameraRunning) return;
      if (vid.readyState >= 2) {
        try { await Detector.hands.send({ image: vid }); } catch(e) {}
      }
      requestAnimationFrame(loop);
    };
    loop();

  } catch (e) {
    showToast('❌ Cannot access camera: ' + e.message);
  }
}

function stopTrainCamera() {
  if (trainCameraStream) {
    trainCameraStream.getTracks().forEach(t => t.stop());
    trainCameraStream = null;
  }
  trainCameraRunning = false;
  capturedTrainLandmarks = null;
  document.getElementById('cam-btn').textContent = '▶ Start Camera';
  document.getElementById('cam-hint').textContent = '📸 Position your hand gesture in frame';
}

async function saveGesture() {
  const label = document.getElementById('gesture-label').value.trim();
  if (!label) { showToast('⚠️ Enter a label first (e.g. "Hello")'); return; }

  const activeTab = document.getElementById('tab-upload').classList.contains('active') ? 'upload' : 'camera';
  let landmarks = null, imageData = null;

  if (activeTab === 'upload') {
    const img = document.getElementById('preview-img');
    if (!img.src || img.style.display === 'none') { showToast('⚠️ Upload an image first'); return; }
    showToast('⏳ Detecting hand in image…');
    try {
      await Detector.init();
      landmarks = await Detector.processImage(img);
    } catch(e) {
      showToast('❌ Could not load AI detector'); return;
    }
    if (!landmarks) { showToast('❌ No hand detected. Use a clearer photo with good lighting.'); return; }
    imageData = img.src;

  } else {
    if (!capturedTrainLandmarks) { showToast('⚠️ No hand detected yet. Show your hand to the camera.'); return; }
    landmarks = capturedTrainLandmarks;
    // Screenshot the video frame (not the canvas overlay)
    const vid = document.getElementById('train-video');
    const snap = document.createElement('canvas');
    snap.width = vid.videoWidth; snap.height = vid.videoHeight;
    snap.getContext('2d').drawImage(vid, 0, 0);
    imageData = snap.toDataURL('image/jpeg', 0.6);
  }

  const lmArray = landmarks.map(lm => [lm.x, lm.y, lm.z]);
  GestureDB.save({ label, landmarks: lmArray, imageData });
  showToast(`✅ "${label}" saved!`);

  document.getElementById('gesture-label').value = '';
  document.getElementById('preview-img').style.display = 'none';
  capturedTrainLandmarks = null;
  renderGesturesList();
}

function renderGesturesList() {
  const gestures = GestureDB.getAll();
  const grid = document.getElementById('gestures-grid');
  const empty = document.getElementById('empty-state');
  const clearBtn = document.getElementById('clear-btn');
  document.getElementById('gesture-count').textContent = gestures.length;

  if (gestures.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    clearBtn.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  clearBtn.style.display = 'block';
  grid.innerHTML = gestures.map(g => `
    <div class="gesture-item">
      <img class="gesture-thumb" src="${g.imageData || ''}" onerror="this.style.display='none'" />
      <div class="gesture-info">
        <div class="gesture-name">${g.label}</div>
        <div class="gesture-pts">21 landmarks ✓</div>
      </div>
      <button class="gesture-del" onclick="deleteGesture('${g.id}')" title="Delete">✕</button>
    </div>
  `).join('');
}

function deleteGesture(id) {
  GestureDB.delete(id);
  renderGesturesList();
  showToast('🗑️ Gesture deleted');
}

function clearAllGestures() {
  if (confirm('Delete ALL saved gestures?')) {
    GestureDB.clear();
    renderGesturesList();
    showToast('🗑️ All gestures cleared');
  }
}

// ═══════════════════════════════════════
// CALL PAGE
// ═══════════════════════════════════════

async function createRoom() {
  showToast('⏳ Setting up room…');
  try {
    const roomId = await Call.createRoom();
    _enterCallUI(roomId);
    showToast('✅ Room ready! Share the Room ID below.', 5000);
  } catch (e) {
    showToast('❌ Could not create room: ' + (e.message || e));
  }
}

async function joinRoom() {
  const raw = document.getElementById('join-room-input').value.trim().toUpperCase();
  if (!raw) { showToast('⚠️ Enter a Room ID first'); return; }
  showToast('⏳ Joining room…');
  try {
    await Call.joinRoom(raw);
    _enterCallUI(raw);
  } catch (e) {
    // error shown inside Call module
  }
}

function _enterCallUI(roomId) {
  document.getElementById('room-setup').style.display = 'none';
  document.getElementById('call-ui').style.display = 'flex';
  document.getElementById('room-id-display').textContent = 'Room: ' + roomId;
  document.getElementById('share-room-id').textContent = roomId;
}

// ── Gesture detection on call ──
async function toggleGestureDetection() {
  const btn = document.getElementById('btn-gesture');
  const status = document.getElementById('gesture-status');

  if (gestureDetectionOn) {
    // Turn OFF
    Detector.stop();
    gestureDetectionOn = false;
    btn.classList.remove('active');
    status.textContent = '● Off';
    status.className = 'status-dot offline';
    showToast('✋ Gesture detection off');
  } else {
    // Turn ON
    if (GestureDB.count() === 0) {
      showToast('⚠️ No gestures trained! Go to Train Gestures first.');
      return;
    }
    if (!Call.localStream) {
      showToast('⚠️ Start a call first before enabling gestures.');
      return;
    }

    try {
      await Detector.init();

      // KEY FIX: We run MediaPipe directly on the local video element
      // using our own frame loop (not Camera utility) so it doesn't
      // conflict with the WebRTC stream
      const localVid = document.getElementById('local-video');
      const localCanvas = document.getElementById('local-overlay');

      Detector.activeCanvas = localCanvas;
      Detector.activeVideo = localVid;
      Detector.isRunning = true;

      Detector.hands.onResults((results) => {
        // Draw landmarks on overlay
        const ctx = localCanvas.getContext('2d');
        localCanvas.width = localVid.videoWidth || 640;
        localCanvas.height = localVid.videoHeight || 480;
        ctx.clearRect(0, 0, localCanvas.width, localCanvas.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          for (const lm of results.multiHandLandmarks) {
            drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: '#7c6dfa', lineWidth: 2 });
            drawLandmarks(ctx, lm, { color: '#6dfabc', radius: 3 });
          }

          // Match against saved gestures
          const matched = Detector._matchGesture(results.multiHandLandmarks[0]);
          if (matched && !gestureCooldown) {
            gestureCooldown = true;
            setTimeout(() => { gestureCooldown = false; }, 1500); // 1.5s between sends

            // Show locally
            document.getElementById('detected-text').textContent = matched;

            // Send to other person
            Call.sendGesture(matched);
          }
        } else {
          // No hand visible
          ctx.clearRect(0, 0, localCanvas.width, localCanvas.height);
        }
      });

      // Manual frame loop using the existing video element
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
      showToast('🤚 Gesture detection ON! Do your gestures.');

    } catch(e) {
      console.error('Gesture detection error:', e);
      showToast('❌ Could not start gesture detector: ' + e.message);
    }
  }
}

// ── Camera toggle ──
function toggleCam() {
  const btn = document.getElementById('btn-cam');
  const enabled = Call.toggleCamera(); // returns new state (true=on, false=off)
  if (enabled) {
    btn.classList.remove('active');
    btn.innerHTML = '📷<span>Camera</span>';
    showToast('📷 Camera on');
  } else {
    btn.classList.add('active');
    btn.innerHTML = '🚫<span>Camera</span>';
    showToast('🚫 Camera off');
  }
}

// ── End call ──
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
    document.getElementById('gesture-status').textContent = '● Detecting…';
    document.getElementById('gesture-status').className = 'status-dot offline';
    document.getElementById('btn-gesture').classList.remove('active');
    document.getElementById('btn-cam').classList.remove('active');
    document.getElementById('btn-cam').innerHTML = '📷<span>Camera</span>';
    document.getElementById('remote-placeholder').style.display = 'flex';
    showToast('📵 Call ended');
  }
}
