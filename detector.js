// detector.js
// Uses MediaPipe Hands to detect hand landmarks
// Then compares them against saved gestures using cosine similarity

const Detector = {
  hands: null,
  isRunning: false,
  lastDetected: null,
  onGesture: null, // callback(label)
  camera: null,

  // ── Initialize MediaPipe Hands ──
  async init() {
    return new Promise((resolve, reject) => {
      try {
        this.hands = new Hands({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        this.hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.5
        });
        this.hands.onResults((results) => this._onResults(results));
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  },

  // ── Start detecting on a video element ──
  async startOnVideo(videoEl, canvasEl) {
    if (!this.hands) await this.init();
    this.isRunning = true;

    if (this.camera) {
      this.camera.stop();
    }

    this.activeCanvas = canvasEl;
    this.activeVideo = videoEl;

    this.camera = new Camera(videoEl, {
      onFrame: async () => {
        if (this.isRunning) {
          await this.hands.send({ image: videoEl });
        }
      },
      width: 640,
      height: 480
    });
    await this.camera.start();
  },

  // ── Process a static image (for training) ──
  async processImage(imgEl) {
    if (!this.hands) await this.init();
    return new Promise((resolve) => {
      const onceHandler = (results) => {
        this.hands.onResults(onceHandler); // reset
        this.hands.onResults((r) => this._onResults(r));
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          resolve(results.multiHandLandmarks[0]);
        } else {
          resolve(null);
        }
      };
      this.hands.onResults(onceHandler);
      this.hands.send({ image: imgEl }).catch(() => resolve(null));
    });
  },

  stop() {
    this.isRunning = false;
    if (this.camera) {
      try { this.camera.stop(); } catch(e) {}
      this.camera = null;
    }
  },

  // ── Internal: called on every frame ──
  _onResults(results) {
    // Draw on canvas if available
    if (this.activeCanvas && this.activeVideo) {
      const ctx = this.activeCanvas.getContext('2d');
      this.activeCanvas.width = this.activeVideo.videoWidth || 640;
      this.activeCanvas.height = this.activeVideo.videoHeight || 480;
      ctx.clearRect(0, 0, this.activeCanvas.width, this.activeCanvas.height);

      if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
          drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#7c6dfa', lineWidth: 2 });
          drawLandmarks(ctx, landmarks, { color: '#fa6d9a', lineWidth: 1, radius: 3 });
        }
      }
    }

    // Match gesture
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      const label = this._matchGesture(landmarks);
      if (label && label !== this.lastDetected) {
        this.lastDetected = label;
        if (this.onGesture) this.onGesture(label);
      }
    }
  },

  // ── Normalize landmarks to be scale/position invariant ──
  _normalize(landmarks) {
    // Find bounding box
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const lm of landmarks) {
      minX = Math.min(minX, lm.x);
      minY = Math.min(minY, lm.y);
      maxX = Math.max(maxX, lm.x);
      maxY = Math.max(maxY, lm.y);
    }
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    // Normalize each point
    return landmarks.map(lm => ({
      x: (lm.x - minX) / rangeX,
      y: (lm.y - minY) / rangeY,
      z: lm.z
    }));
  },

  // ── Flatten landmarks to a vector ──
  _flatten(landmarks) {
    const vec = [];
    for (const lm of landmarks) {
      vec.push(lm.x, lm.y, lm.z);
    }
    return vec;
  },

  // ── Cosine similarity between two vectors ──
  _cosineSim(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  },

  // ── Match current landmarks against saved gestures ──
  _matchGesture(rawLandmarks) {
    const gestures = GestureDB.getAll();
    if (gestures.length === 0) return null;

    const normalized = this._normalize(rawLandmarks);
    const vec = this._flatten(normalized);

    let best = null;
    let bestScore = 0;
    const THRESHOLD = 0.97; // high threshold = only very confident matches

    for (const g of gestures) {
      if (!g.landmarks) continue;
      const savedNorm = this._normalize(
        g.landmarks.map((lm, i) => Array.isArray(lm)
          ? { x: lm[0], y: lm[1], z: lm[2] }
          : lm)
      );
      const savedVec = this._flatten(savedNorm);
      const score = this._cosineSim(vec, savedVec);
      if (score > bestScore) {
        bestScore = score;
        best = g.label;
      }
    }

    return bestScore >= THRESHOLD ? best : null;
  }
};
