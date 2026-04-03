// detector.js
// Two detection modes:
//   1. BUILT-IN gestures — pure math rules on finger positions (works for everyone, no training)
//   2. CUSTOM gestures   — cosine similarity against user-saved landmarks (from GestureDB)
// Built-in gestures are checked first, then custom ones.

const Detector = {
  hands: null,
  isRunning: false,
  activeCanvas: null,
  activeVideo: null,
  onGesture: null,

  // ─────────────────────────────────────────
  // MediaPipe landmark indices (for reference)
  // 0=wrist, 4=thumb tip, 8=index tip,
  // 12=middle tip, 16=ring tip, 20=pinky tip
  // Each finger: [MCP, PIP, DIP, TIP]
  // Thumb: [1,2,3,4]  Index:[5,6,7,8]
  // Middle:[9,10,11,12] Ring:[13,14,15,16] Pinky:[17,18,19,20]
  // ─────────────────────────────────────────

  // ── Initialize MediaPipe Hands ──
  async init() {
    if (this.hands) return; // already initialized
    return new Promise((resolve, reject) => {
      try {
        this.hands = new Hands({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        this.hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.75,
          minTrackingConfidence: 0.6
        });
        this.hands.onResults((r) => this._onResults(r));
        resolve();
      } catch (e) { reject(e); }
    });
  },

  stop() {
    this.isRunning = false;
    this.activeCanvas = null;
    this.activeVideo = null;
  },

  // ── Process a static image for custom gesture training ──
  async processImage(imgEl) {
    if (!this.hands) await this.init();
    return new Promise((resolve) => {
      const handler = (results) => {
        this.hands.onResults((r) => this._onResults(r)); // restore
        resolve(
          results.multiHandLandmarks && results.multiHandLandmarks.length > 0
            ? results.multiHandLandmarks[0]
            : null
        );
      };
      this.hands.onResults(handler);
      this.hands.send({ image: imgEl }).catch(() => resolve(null));
    });
  },

  // ── Called every frame ──
  _onResults(results) {
    // Draw skeleton on canvas overlay
    if (this.activeCanvas && this.activeVideo) {
      const ctx = this.activeCanvas.getContext('2d');
      this.activeCanvas.width  = this.activeVideo.videoWidth  || 640;
      this.activeCanvas.height = this.activeVideo.videoHeight || 480;
      ctx.clearRect(0, 0, this.activeCanvas.width, this.activeCanvas.height);

      if (results.multiHandLandmarks) {
        for (const lm of results.multiHandLandmarks) {
          drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: '#7c6dfa', lineWidth: 2 });
          drawLandmarks(ctx, lm, { color: '#6dfabc', lineWidth: 1, radius: 3 });
        }
      }
    }

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) return;

    const lm = results.multiHandLandmarks[0];

    // 1. Try built-in gestures first
    let label = this._detectBuiltIn(lm);

    // 2. If no built-in match, try user's custom saved gestures
    if (!label) {
      label = this._matchCustom(lm);
    }

    if (label && this.onGesture) {
      this.onGesture(label);
    }
  },

  // ═══════════════════════════════════════════════════
  // BUILT-IN GESTURE RULES
  // Uses finger joint positions — no training needed
  // ═══════════════════════════════════════════════════

  _detectBuiltIn(lm) {
    const fingers = this._getFingerStates(lm);
    // fingers = { thumb, index, middle, ring, pinky }
    // true = finger is UP/extended, false = finger is DOWN/curled

    const { thumb, index, middle, ring, pinky } = fingers;

    // ── All 5 fingers up = OPEN PALM ──
    if (thumb && index && middle && ring && pinky)
      return '✋ Open Palm';

    // ── All fingers closed = FIST ──
    if (!thumb && !index && !middle && !ring && !pinky)
      return '✊ Fist / No';

    // ── Only thumb up = THUMBS UP ──
    if (thumb && !index && !middle && !ring && !pinky)
      return '👍 Yes / Good';

    // ── Only index up = POINTING ──
    if (!thumb && index && !middle && !ring && !pinky)
      return '☝️ One moment';

    // ── Index + middle up = PEACE / V sign ──
    if (!thumb && index && middle && !ring && !pinky)
      return '✌️ Peace / 2';

    // ── Index + middle + ring up = 3 ──
    if (!thumb && index && middle && ring && !pinky)
      return '3️⃣ Three';

    // ── Index + middle + ring + pinky up (no thumb) = 4 ──
    if (!thumb && index && middle && ring && pinky)
      return '4️⃣ Four';

    // ── Only pinky up = PINKY ──
    if (!thumb && !index && !middle && !ring && pinky)
      return '🤙 Call me';

    // ── Thumb + pinky up (hang loose / ILY base) ──
    if (thumb && !index && !middle && !ring && pinky)
      return '🤙 I love you';

    // ── Thumb + index up (L shape) ──
    if (thumb && index && !middle && !ring && !pinky)
      return '👌 Okay / L';

    // ── Index + pinky up (rock / horns) ──
    if (!thumb && index && !middle && !ring && pinky)
      return '🤘 Rock on';

    // ── Thumb down = THUMBS DOWN ──
    if (this._isThumbDown(lm) && !index && !middle && !ring && !pinky)
      return '👎 No / Bad';

    return null; // no built-in match
  },

  // ── Determine if each finger is extended ──
  _getFingerStates(lm) {
    return {
      thumb:  this._isThumbUp(lm),
      index:  this._isFingerUp(lm, 5, 6, 8),
      middle: this._isFingerUp(lm, 9, 10, 12),
      ring:   this._isFingerUp(lm, 13, 14, 16),
      pinky:  this._isFingerUp(lm, 17, 18, 20),
    };
  },

  // A finger is "up" if its TIP is higher (lower Y) than its MCP base
  // We compare tip Y vs pip Y — if tip is above pip, finger is extended
  _isFingerUp(lm, mcp, pip, tip) {
    return lm[tip].y < lm[pip].y;
  },

  // Thumb is special — compare tip X vs MCP X (horizontal movement)
  _isThumbUp(lm) {
    // Thumb tip should be clearly above (lower Y) than thumb IP joint
    return lm[4].y < lm[3].y && lm[4].y < lm[2].y;
  },

  _isThumbDown(lm) {
    return lm[4].y > lm[3].y && lm[4].y > lm[2].y;
  },

  // ═══════════════════════════════════════════════════
  // CUSTOM GESTURE MATCHING (user-trained)
  // Cosine similarity on normalized landmarks
  // ═══════════════════════════════════════════════════

  _matchCustom(rawLm) {
    const gestures = GestureDB.getAll();
    if (gestures.length === 0) return null;

    const normalized = this._normalize(rawLm);
    const vec = this._flatten(normalized);

    let best = null;
    let bestScore = 0;
    const THRESHOLD = 0.97;

    for (const g of gestures) {
      if (!g.landmarks) continue;
      const savedNorm = this._normalize(
        g.landmarks.map(lm => Array.isArray(lm)
          ? { x: lm[0], y: lm[1], z: lm[2] }
          : lm)
      );
      const savedVec = this._flatten(savedNorm);
      const score = this._cosineSim(vec, savedVec);
      if (score > bestScore) { bestScore = score; best = g.label; }
    }

    return bestScore >= THRESHOLD ? best : null;
  },

  _normalize(landmarks) {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const lm of landmarks) {
      minX = Math.min(minX, lm.x); minY = Math.min(minY, lm.y);
      maxX = Math.max(maxX, lm.x); maxY = Math.max(maxY, lm.y);
    }
    const rx = maxX - minX || 1;
    const ry = maxY - minY || 1;
    return landmarks.map(lm => ({ x: (lm.x - minX) / rx, y: (lm.y - minY) / ry, z: lm.z }));
  },

  _flatten(landmarks) {
    const v = [];
    for (const lm of landmarks) v.push(lm.x, lm.y, lm.z);
    return v;
  },

  _cosineSim(a, b) {
    let dot = 0, nA = 0, nB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]; nA += a[i] * a[i]; nB += b[i] * b[i];
    }
    return (nA && nB) ? dot / (Math.sqrt(nA) * Math.sqrt(nB)) : 0;
  }
};
