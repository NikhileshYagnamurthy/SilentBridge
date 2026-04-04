// detector.js

const Detector = {
  hands: null,
  isRunning: false,
  activeCanvas: null,
  activeVideo: null,
  onGesture: null,
  _initialized: false,
  _sending: false,       // prevents overlapping MediaPipe calls (fixes stuck/cluster bug)
  _lastLabel: null,
  _cooldown: false,

  async init() {
    if (this._initialized) return;
    this.hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
    });
    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.75,
      minTrackingConfidence: 0.6
    });
    this.hands.onResults(r => this._onResults(r));
    await this.hands.initialize();
    this._initialized = true;
  },

  stop() {
    this.isRunning = false;
    this.activeCanvas = null;
    this.activeVideo  = null;
    this._sending     = false;
  },

  // ── Start detection loop on a video element ──
  startLoop(videoEl, canvasEl, onGesture) {
    this.activeVideo  = videoEl;
    this.activeCanvas = canvasEl;
    this.onGesture    = onGesture;
    this.isRunning    = true;
    this._loop();
  },

  async _loop() {
    if (!this.isRunning) return;

    const vid = this.activeVideo;
    // Only send if video has real frames and we aren't already waiting
    if (vid && vid.readyState >= 2 && !vid.paused && !this._sending) {
      this._sending = true;
      try {
        await this.hands.send({ image: vid });
      } catch(e) {
        // ignore frame errors
      }
      this._sending = false;
    }

    // ~20fps — enough for smooth detection without overloading
    setTimeout(() => this._loop(), 50);
  },

  // ── Process one static image (for training) ──
  async processImage(imgEl) {
    if (!this._initialized) await this.init();
    return new Promise(resolve => {
      const saved = this.hands._userResultCallback;
      this.hands.onResults(results => {
        this.hands.onResults(r => this._onResults(r)); // restore
        resolve(
          results.multiHandLandmarks?.length > 0
            ? results.multiHandLandmarks[0]
            : null
        );
      });
      this.hands.send({ image: imgEl }).catch(() => resolve(null));
    });
  },

  // ── Called after every frame ──
  _onResults(results) {
    this._drawDots(results.multiHandLandmarks);

    if (!results.multiHandLandmarks?.length) return;

    if (!this._cooldown) {
      const label = this._matchGesture(results.multiHandLandmarks[0]);
      if (label && this.onGesture) {
        this.onGesture(label);
        this._cooldown = true;
        setTimeout(() => { this._cooldown = false; }, 1500);
      }
    }
  },

  // ── Draw skeleton dots on canvas ──
  // Strategy: set canvas pixels = video natural size
  //           CSS makes canvas fill the box
  //           mirror via ctx.scale so dots align with CSS-mirrored video
  _drawDots(landmarksList) {
    const canvas = this.activeCanvas;
    const video  = this.activeVideo;
    if (!canvas || !video) return;

    const vw = video.videoWidth  || 640;
    const vh = video.videoHeight || 480;

    // Only resize canvas if size actually changed — avoids flicker/cluster bug
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width  = vw;
      canvas.height = vh;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, vw, vh);

    if (!landmarksList?.length) return;

    // Mirror drawing to match scaleX(-1) on the video element
    ctx.save();
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);

    for (const lm of landmarksList) {
      drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: '#7c6dfa', lineWidth: 2 });
      drawLandmarks(ctx, lm, { color: '#6dfabc', lineWidth: 1, radius: 4 });
    }

    ctx.restore();
  },

  // ── Also expose _drawOnCanvas so app.js training camera can use it ──
  _drawOnCanvas(canvas, video, landmarksList) {
    const prev = [this.activeCanvas, this.activeVideo];
    this.activeCanvas = canvas;
    this.activeVideo  = video;
    this._drawDots(landmarksList);
    [this.activeCanvas, this.activeVideo] = prev;
  },

  // ── Match live hand against saved gestures ──
  _matchGesture(rawLm) {
    const gestures = GestureDB.getAll();
    if (!gestures.length) return null;

    const normVec = this._flatten(this._normalize(rawLm));
    let bestLabel = null, bestScore = 0;
    const THRESHOLD = 0.96;

    for (const g of gestures) {
      if (!g.landmarks) continue;
      const samples = Array.isArray(g.landmarks[0]) && typeof g.landmarks[0][0] === 'object'
        ? g.landmarks : [g.landmarks];
      for (const sample of samples) {
        const vec = this._flatten(this._normalize(
          sample.map(lm => Array.isArray(lm) ? { x: lm[0], y: lm[1], z: lm[2] } : lm)
        ));
        const score = this._cosineSim(normVec, vec);
        if (score > bestScore) { bestScore = score; bestLabel = g.label; }
      }
    }
    return bestScore >= THRESHOLD ? bestLabel : null;
  },

  _normalize(lms) {
    let minX=1, minY=1, maxX=0, maxY=0;
    for (const l of lms) {
      minX=Math.min(minX,l.x); minY=Math.min(minY,l.y);
      maxX=Math.max(maxX,l.x); maxY=Math.max(maxY,l.y);
    }
    const rx=maxX-minX||1, ry=maxY-minY||1;
    return lms.map(l => ({ x:(l.x-minX)/rx, y:(l.y-minY)/ry, z:l.z }));
  },

  _flatten(lms) {
    const v = [];
    for (const l of lms) v.push(l.x, l.y, l.z);
    return v;
  },

  _cosineSim(a, b) {
    let dot=0, nA=0, nB=0;
    for (let i=0; i<a.length; i++) { dot+=a[i]*b[i]; nA+=a[i]*a[i]; nB+=b[i]*b[i]; }
    return (nA&&nB) ? dot/(Math.sqrt(nA)*Math.sqrt(nB)) : 0;
  }
};
