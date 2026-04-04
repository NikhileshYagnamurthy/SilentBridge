// gesture-db.js
// Loads gestures from server on startup → works on ALL devices automatically
// Images are stored locally only (too large for server)
// Landmarks (the math points) are stored on server → shared for everyone

const GestureDB = {
  LOCAL_KEY: 'silentbridge_gestures_v2',
  _cache: null,

  // ── Load from server on startup ──
  async loadFromServer() {
    try {
      const res = await fetch('/api/gestures');
      if (!res.ok) throw new Error('Server error');
      const serverGestures = await res.json();

      if (Array.isArray(serverGestures) && serverGestures.length > 0) {
        // Merge server gestures with any local images we have
        // Server has landmarks, local storage has the preview images
        const local = this._readLocal();
        const merged = serverGestures.map(sg => {
          const localMatch = local.find(lg => lg.id === sg.id);
          return {
            ...sg,
            // Use local images if available, otherwise no image (still works!)
            imageData: (localMatch && localMatch.imageData) || sg.imageData || []
          };
        });
        this._cache = merged;
        // Save merged version locally
        localStorage.setItem(this.LOCAL_KEY, JSON.stringify(merged));
        console.log(`✅ Loaded ${merged.length} gestures from server`);
        return merged.length;
      }
    } catch(e) {
      console.warn('Server load failed, using localStorage:', e.message);
    }
    // Fallback to local storage
    this._cache = this._readLocal();
    return this._cache.length;
  },

  // ── Push to server — landmarks only, NO images (images are too large) ──
  async pushToServer() {
    const all = this.getAll();
    // Strip image data before sending — landmarks are enough for detection
    const slim = all.map(g => ({
      id: g.id,
      label: g.label,
      landmarks: g.landmarks,
      sampleCount: g.sampleCount || 1
      // imageData intentionally excluded — too large, stays local only
    }));
    try {
      const res = await fetch('/api/gestures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slim)
      });
      const result = await res.json();
      if (result.ok) {
        console.log(`✅ Pushed ${result.count} gestures to server (landmarks only)`);
        return true;
      }
    } catch(e) {
      console.error('Push failed:', e.message);
    }
    return false;
  },

  getAll() {
    if (this._cache) return this._cache;
    this._cache = this._readLocal();
    return this._cache;
  },

  _readLocal() {
    try { return JSON.parse(localStorage.getItem(this.LOCAL_KEY) || '[]'); }
    catch { return []; }
  },

  _saveLocal(all) {
    this._cache = all;
    localStorage.setItem(this.LOCAL_KEY, JSON.stringify(all));
  },

  async addSample(label, landmarkArray, imageDataUrl) {
    const all = this.getAll();
    const existing = all.find(g => g.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      // Normalize to multi-sample format
      if (!Array.isArray(existing.landmarks[0]) || typeof existing.landmarks[0][0] !== 'object') {
        existing.landmarks = [existing.landmarks];
        existing.imageData = Array.isArray(existing.imageData) ? existing.imageData : [existing.imageData];
      }
      existing.landmarks.push(landmarkArray);
      existing.imageData.push(imageDataUrl);
      existing.sampleCount = existing.landmarks.length;
    } else {
      all.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        label,
        landmarks: [landmarkArray],
        imageData: [imageDataUrl],
        sampleCount: 1
      });
    }
    this._saveLocal(all);
    // Auto push landmarks to server
    await this.pushToServer();
  },

  delete(id) {
    const all = this.getAll().filter(g => g.id !== id);
    this._saveLocal(all);
    this.pushToServer();
  },

  clear() {
    this._cache = [];
    localStorage.removeItem(this.LOCAL_KEY);
    this.pushToServer();
  },

  count() { return this.getAll().length; },
  totalSamples() { return this.getAll().reduce((s,g) => s+(g.sampleCount||1), 0); },

  exportToFile() {
    // Export full version with images for backup
    const blob = new Blob([JSON.stringify(this.getAll(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'silentbridge-gestures.json';
    a.click();
  },

  // Export slim version (landmarks only) for committing to GitHub
  exportSlimForGithub() {
    const all = this.getAll();
    const slim = all.map(g => ({
      id: g.id, label: g.label,
      landmarks: g.landmarks,
      sampleCount: g.sampleCount || 1
    }));
    const blob = new Blob([JSON.stringify(slim, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gestures.json';
    a.click();
  },

  importFromFile(jsonText) {
    try {
      const imported = JSON.parse(jsonText);
      if (!Array.isArray(imported)) return false;
      const existing = this.getAll();
      let added = 0;
      for (const g of imported) {
        if (!existing.find(e => e.label.toLowerCase() === g.label.toLowerCase())) {
          existing.push(g); added++;
        }
      }
      this._saveLocal(existing);
      this.pushToServer();
      return added;
    } catch { return false; }
  }
};
