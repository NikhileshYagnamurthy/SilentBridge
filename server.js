// server.js
// 1. Serves all HTML/CSS/JS files
// 2. API to save/load gestures — stored in gestures.json on server
//    So ALL visitors get the same gestures automatically!

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT          = process.env.PORT || 3000;
const GESTURES_FILE = path.join(__dirname, 'gestures.json');

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

// ── Read body helper ──
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 50e6) reject(new Error('Too large')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ── Ensure gestures.json exists ──
if (!fs.existsSync(GESTURES_FILE)) {
  fs.writeFileSync(GESTURES_FILE, '[]');
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // ── CORS headers ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ════════════════════════════════════
  // API: GET /api/gestures
  // Returns all saved gestures as JSON
  // ════════════════════════════════════
  if (url === '/api/gestures' && req.method === 'GET') {
    try {
      const data = fs.readFileSync(GESTURES_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch(e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }

  // ════════════════════════════════════
  // API: POST /api/gestures
  // Saves gestures sent from admin
  // Body: JSON array of gesture objects
  // ════════════════════════════════════
  if (url === '/api/gestures' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const gestures = JSON.parse(body);
      if (!Array.isArray(gestures)) throw new Error('Expected array');
      fs.writeFileSync(GESTURES_FILE, JSON.stringify(gestures));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, count: gestures.length }));
      console.log(`✅ Gestures saved: ${gestures.length} entries`);
    } catch(e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // ════════════════════════════════════
  // Serve static files
  // ════════════════════════════════════
  let filePath = path.join(__dirname, url === '/' ? 'index.html' : url);
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback to index.html for any unknown route
      fs.readFile(path.join(__dirname, 'index.html'), (err2, html) => {
        if (err2) { res.writeHead(500); res.end('Server error'); return; }
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Permissions-Policy': 'camera=*, microphone=*',
        });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Permissions-Policy': 'camera=*, microphone=*',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ SilentBridge running on port ${PORT}`);
  console.log(`📁 Files: ${__dirname}`);
  console.log(`🤚 Gestures file: ${GESTURES_FILE}`);
});
