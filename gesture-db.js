// gesture-db.js
// Stores gestures in localStorage
// Each gesture: { id, label, landmarks: [[sample1],[sample2],...], imageData:[img1,img2,...] }
// Multiple images per label = much better accuracy

const GestureDB = {
  KEY: 'silentbridge_gestures_v2',

  getAll() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
    catch { return []; }
  },

  // Add a sample to existing label OR create new gesture
  addSample(label, landmarkArray, imageDataUrl) {
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
    localStorage.setItem(this.KEY, JSON.stringify(all));
  },

  delete(id) {
    localStorage.setItem(this.KEY, JSON.stringify(this.getAll().filter(g => g.id !== id)));
  },

  clear() { localStorage.removeItem(this.KEY); },
  count() { return this.getAll().length; },
  totalSamples() { return this.getAll().reduce((s,g) => s+(g.sampleCount||1), 0); },

  exportToFile() {
    const blob = new Blob([JSON.stringify(this.getAll(),null,2)], {type:'application/json'});
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
      localStorage.setItem(this.KEY, JSON.stringify(existing));
      return added;
    } catch { return false; }
  }
};
