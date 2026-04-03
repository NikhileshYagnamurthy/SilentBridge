// detector.js
// MediaPipe hand detection + multi-sample gesture matching
// Each gesture can have MULTIPLE images → better accuracy

const Detector = {
  hands: null,
  isRunning: false,
  activeCanvas: null,
  activeVideo: null,
  onGesture: null,
  _initialized: false,

  // ── Init MediaPipe once ──
  async init() {
    if (this._initialized) return;
    return new Promise((resolve, reject) => {
      try {
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
        this._initialized = true;
        resolve();
      } catch(e) { reject(e); }
    });
  },

  stop() {
    this.isRunning = false;
    this.activeCanvas = null;
    this.activeVideo = null;
  },

  // ── Extract landmarks from a static image element ──
  async processImage(imgEl) {
    if (!this._initialized) await this.init();
    return new Promise((resolve) => {
      const handler = (results) => {
        this.hands.onResults(r => this._onResults(r)); // restore normal handler
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

  // ── Called every frame during live call ──
  _onResults(results) {
    if (this.activeCanvas && this.activeVideo) {
      const ctx = this.activeCanvas.getContext('2d');
      this.activeCanvas.width  = this.activeCanvas.offsetWidth  || 640;
      this.activeCanvas.height = this.activeCanvas.offsetHeight || 480;
      ctx.clearRect(0, 0, this.activeCanvas.width, this.activeCanvas.height);
      if (results.multiHandLandmarks) {
        for (const lm of results.multiHandLandmarks) {
          const mirrored = lm.map(p => ({ x: 1-p.x, y: p.y, z: p.z }));
          drawConnectors(ctx, mirrored, HAND_CONNECTIONS, { color: '#7c6dfa', lineWidth: 2 });
          drawLandmarks(ctx, mirrored, { color: '#6dfabc', lineWidth: 1, radius: 3 });
        }
      }
    }
    if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) return;
    const label = this._matchGesture(results.multiHandLandmarks[0]);
    if (label && this.onGesture) this.onGesture(label);
  },

  // ── Match live hand against ALL saved gesture samples ──
  // Each gesture label can have multiple landmark samples
  // We find the single best match across all samples
  _matchGesture(rawLm) {
    const gestures = GestureDB.getAll();
    if (!gestures.length) return null;

    const normVec = this._flatten(this._normalize(rawLm));

    let bestLabel = null;
    let bestScore = 0;
    const THRESHOLD = 0.96; // slightly lower = more forgiving

    for (const g of gestures) {
      if (!g.landmarks) continue;
      // Each gesture stores an ARRAY of landmark sets (one per uploaded image)
      const samples = Array.isArray(g.landmarks[0]) && typeof g.landmarks[0][0] === 'object'
        ? g.landmarks          // new format: array of samples
        : [g.landmarks];       // old format: single sample, wrap it

      for (const sample of samples) {
        const savedVec = this._flatten(this._normalize(
          sample.map(lm => Array.isArray(lm)
            ? { x: lm[0], y: lm[1], z: lm[2] }
            : lm)
        ));
        const score = this._cosineSim(normVec, savedVec);
        if (score > bestScore) { bestScore = score; bestLabel = g.label; }
      }
    }

    return bestScore >= THRESHOLD ? bestLabel : null;
  },

  // ── Math helpers ──
  _normalize(lms) {
    let minX=1,minY=1,maxX=0,maxY=0;
    for (const l of lms) {
      minX=Math.min(minX,l.x); minY=Math.min(minY,l.y);
      maxX=Math.max(maxX,l.x); maxY=Math.max(maxY,l.y);
    }
    const rx=maxX-minX||1, ry=maxY-minY||1;
    return lms.map(l=>({x:(l.x-minX)/rx, y:(l.y-minY)/ry, z:l.z}));
  },

  _flatten(lms) {
    const v=[];
    for (const l of lms) v.push(l.x,l.y,l.z);
    return v;
  },

  _cosineSim(a,b) {
    let dot=0,nA=0,nB=0;
    for (let i=0;i<a.length;i++){dot+=a[i]*b[i];nA+=a[i]*a[i];nB+=b[i]*b[i];}
    return (nA&&nB)?dot/(Math.sqrt(nA)*Math.sqrt(nB)):0;
  }
};
