// detector.js
const Detector = {
  hands: null,
  isRunning: false,
  activeCanvas: null,
  activeVideo: null,
  onGesture: null,
  _initialized: false,

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

  async processImage(imgEl) {
    if (!this._initialized) await this.init();
    return new Promise((resolve) => {
      const handler = (results) => {
        this.hands.onResults(r => this._onResults(r));
        resolve(
          results.multiHandLandmarks && results.multiHandLandmarks.length > 0
            ? results.multiHandLandmarks[0] : null
        );
      };
      this.hands.onResults(handler);
      this.hands.send({ image: imgEl }).catch(() => resolve(null));
    });
  },

  _drawOnCanvas(canvas, video, landmarks) {
    if (!canvas || !video) return;

    const vw = video.videoWidth  || 640;
    const vh = video.videoHeight || 480;
    canvas.width  = vw;
    canvas.height = vh;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, vw, vh);

    if (!landmarks || !landmarks.length) return;

    // Draw landmarks at raw MediaPipe coordinates (no JS flipping)
    // CSS transform: scaleX(-1) on both video and canvas handles the mirror
    // so dots appear exactly on top of the hand as seen on screen
    for (const lm of landmarks) {
      drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: '#7c6dfa', lineWidth: 3 });
      drawLandmarks(ctx, lm, { color: '#6dfabc', lineWidth: 1, radius: 5 });
    }
  },

  _onResults(results) {
    this._drawOnCanvas(
      this.activeCanvas,
      this.activeVideo,
      results.multiHandLandmarks
    );
    if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) return;
    const label = this._matchGesture(results.multiHandLandmarks[0]);
    if (label && this.onGesture) this.onGesture(label);
  },

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
        const savedVec = this._flatten(this._normalize(
          sample.map(lm => Array.isArray(lm) ? { x: lm[0], y: lm[1], z: lm[2] } : lm)
        ));
        const score = this._cosineSim(normVec, savedVec);
        if (score > bestScore) { bestScore = score; bestLabel = g.label; }
      }
    }
    return bestScore >= THRESHOLD ? bestLabel : null;
  },

  _normalize(lms) {
    let minX=1,minY=1,maxX=0,maxY=0;
    for (const l of lms) { minX=Math.min(minX,l.x); minY=Math.min(minY,l.y); maxX=Math.max(maxX,l.x); maxY=Math.max(maxY,l.y); }
    const rx=maxX-minX||1, ry=maxY-minY||1;
    return lms.map(l=>({x:(l.x-minX)/rx, y:(l.y-minY)/ry, z:l.z}));
  },
  _flatten(lms) { const v=[]; for (const l of lms) v.push(l.x,l.y,l.z); return v; },
  _cosineSim(a,b) {
    let dot=0,nA=0,nB=0;
    for (let i=0;i<a.length;i++){dot+=a[i]*b[i];nA+=a[i]*a[i];nB+=b[i]*b[i];}
    return (nA&&nB)?dot/(Math.sqrt(nA)*Math.sqrt(nB)):0;
  }
};
