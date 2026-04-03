// gesture-db.js
// HOW IT WORKS:
//   - On page load: fetches gestures from server (/api/gestures) → everyone gets same gestures
//   - When you save a gesture: saves locally AND pushes to server
//   - Other visitors: automatically get your gestures when they open the site

const GestureDB = {
  LOCAL_KEY: 'silentbridge_gestures_v2',
  _cache: null,

  // ── Load gestures (server first, localStorage fallback) ──
  async loadFromServer() {
    try {
      const res = await fetch('/api/gestures');
      if (!res.ok) throw new Error('Server error');
      const serverGestures = await res.json();
      if (Array.isArray(serverGestures) && serverGestures.length > 0) {
        // Save to localStorage as cache
        localStorage.setItem(this.LOCAL_KEY, JSON.stringify(serverGestures));
        this._cache = serverGestures;
        console.log(`✅ Loaded ${serverGestures.length} gestures from server`);
        return serverGestures.length;
      }
    } catch(e) {
      console.warn('Could not reach server, using localStorage:', e.message);
    }
    // Fallback: localStorage
    this._cache = this._readLocal();
    return this._cache.length;
  },

  // ── Push all local gestures to server ──
  async pushToServer() {
    const all = this.getAll();
    try {
      const res = await fetch('/api/gestures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(all)
      });
      const result = await res.json();
      if (result.ok) {
        console.log(`✅ Pushed ${result.count} gestures to server`);
        return true;
      }
    } catch(e) {
      console.error('Could not push to server:', e.message);
    }
    return false;
  },

  // ── Get all gestures (from cache) ──
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

  // ── Add a sample to existing label OR create new gesture ──
  async addSample(label, landmarkArray, imageDataUrl) {
    const all = this.getAll();
    const existing = all.find(g => g.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      if (!Array.isArray(existing.landmarks[0]) || typeof existing.landmarks[0][0] !== 'object') {
        existing.landmarks = [existing.landmarks];
        existing.imageData = [existing.imageData];
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
    // Auto-push to server so everyone gets it
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
    const blob = new Blob([JSON.stringify(this.getAll(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'silentbridge-gestures.json';
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
