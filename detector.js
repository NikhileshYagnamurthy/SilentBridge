// detector.js — Final clean version

const Detector = {
  hands: null,
  isRunning: false,
  activeCanvas: null,
  activeVideo: null,
  onGesture: null,
  _initialized: false,
  _busy: false,
  _cooldown: false,

  async init() {
    if (this._initialized) return;
    this.hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
    });
    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5
    });
    this.hands.onResults(r => this._onResults(r));
    await this.hands.initialize();
    this._initialized = true;
  },

  // ── Start detection on a live video (for call) ──
  startLoop(videoEl, canvasEl, onGesture) {
    this.activeVideo  = videoEl;
    this.activeCanvas = canvasEl;
    this.onGesture    = onGesture;
    this.isRunning    = true;
    this._runLoop();
  },

  async _runLoop() {
    if (!this.isRunning) return;
    const vid = this.activeVideo;
    if (vid && vid.readyState >= 2 && !vid.paused && !this._busy) {
      this._busy = true;
      try { await this.hands.send({ image: vid }); } catch(e) {}
      this._busy = false;
    }
    setTimeout(() => this._runLoop(), 60); // ~16fps
  },

  stop() {
    this.isRunning    = false;
    this.activeCanvas = null;
    this.activeVideo  = null;
    this.onGesture    = null;
    this._busy        = false;
    this._cooldown    = false;
  },

  // ── Process one image for training ──
  async processImage(imgEl) {
    if (!this._initialized) await this.init();
    return new Promise(resolve => {
      this.hands.onResults(results => {
        this.hands.onResults(r => this._onResults(r)); // restore
        resolve(results.multiHandLandmarks?.length > 0
          ? results.multiHandLandmarks[0] : null);
      });
      this.hands.send({ image: imgEl }).catch(() => resolve(null));
    });
  },

  _onResults(results) {
    // Draw dots on call canvas
    if (this.activeCanvas && this.activeVideo) {
      this._draw(this.activeCanvas, this.activeVideo, results.multiHandLandmarks);
    }
    if (!results.multiHandLandmarks?.length) return;
    if (this._cooldown) return;
    const label = this._matchGesture(results.multiHandLandmarks[0]);
    if (label && this.onGesture) {
      this.onGesture(label);
      this._cooldown = true;
      setTimeout(() => { this._cooldown = false; }, 1500);
    }
  },

  // ── THE KEY FIX ──
  // video has CSS: transform scaleX(-1)  → video appears mirrored on screen
  // canvas has NO CSS transform           → canvas coords are unmirrored
  // MediaPipe gives coords in RAW (unmirrored) space
  // So we draw at (1 - lm.x) to flip the dots to match the mirrored video
  _draw(canvas, video, landmarksList) {
    const vw = video.videoWidth  || 640;
    const vh = video.videoHeight || 480;
    if (canvas.width !== vw)  canvas.width  = vw;
    if (canvas.height !== vh) canvas.height = vh;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, vw, vh);
    if (!landmarksList?.length) return;
    for (const lm of landmarksList) {
      // Flip X to match CSS-mirrored video
      const flipped = lm.map(p => ({ x: 1 - p.x, y: p.y, z: p.z }));
      drawConnectors(ctx, flipped, HAND_CONNECTIONS, { color: '#7c6dfa', lineWidth: 2 });
      drawLandmarks(ctx,  flipped, { color: '#6dfabc', lineWidth: 1, radius: 5 });
    }
  },

  // Used by training camera in app.js
  drawOnCanvas(canvas, video, landmarksList) {
    this._draw(canvas, video, landmarksList);
  },

  _matchGesture(rawLm) {
    const gestures = GestureDB.getAll();
    if (!gestures.length) return null;
    const normVec = this._flatten(this._normalize(rawLm));
    let bestLabel = null, bestScore = 0;
    const THRESHOLD = 0.96;
    for (const g of gestures) {
      if (!g.landmarks) continue;
      const samples = (Array.isArray(g.landmarks[0]) && typeof g.landmarks[0][0] === 'object')
        ? g.landmarks : [g.landmarks];
      for (const s of samples) {
        const vec = this._flatten(this._normalize(
          s.map(p => Array.isArray(p) ? {x:p[0],y:p[1],z:p[2]} : p)
        ));
        const sc = this._cosineSim(normVec, vec);
        if (sc > bestScore) { bestScore = sc; bestLabel = g.label; }
      }
    }
    return bestScore >= THRESHOLD ? bestLabel : null;
  },

  _normalize(lms) {
    let x0=1,y0=1,x1=0,y1=0;
    for (const p of lms) { x0=Math.min(x0,p.x); y0=Math.min(y0,p.y); x1=Math.max(x1,p.x); y1=Math.max(y1,p.y); }
    const rx=x1-x0||1, ry=y1-y0||1;
    return lms.map(p=>({x:(p.x-x0)/rx, y:(p.y-y0)/ry, z:p.z}));
  },
  _flatten(lms) { const v=[]; for(const p of lms) v.push(p.x,p.y,p.z); return v; },
  _cosineSim(a,b) {
    let d=0,na=0,nb=0;
    for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];}
    return (na&&nb)?d/(Math.sqrt(na)*Math.sqrt(nb)):0;
  }
};
