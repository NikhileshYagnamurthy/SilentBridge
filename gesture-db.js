// gesture-db.js
// Saves and loads gestures from the browser's localStorage
// Each gesture = { id, label, landmarks: [[x,y,z], ...], imageData }

const GestureDB = {
  KEY: 'handspeak_gestures',

  getAll() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || '[]');
    } catch { return []; }
  },

  save(gesture) {
    const all = this.getAll();
    gesture.id = Date.now().toString();
    all.push(gesture);
    localStorage.setItem(this.KEY, JSON.stringify(all));
    return gesture;
  },

  delete(id) {
    const all = this.getAll().filter(g => g.id !== id);
    localStorage.setItem(this.KEY, JSON.stringify(all));
  },

  clear() {
    localStorage.removeItem(this.KEY);
  },

  count() {
    return this.getAll().length;
  }
};
