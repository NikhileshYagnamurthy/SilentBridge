// server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];

  // Always serve index.html for root
  if (urlPath === '/' || urlPath === '') {
    urlPath = '/index.html';
  }

  // Build full file path — __dirname is the folder where server.js lives
  const filePath = path.join(__dirname, urlPath);

  console.log('Request:', urlPath, '→', filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.log('File not found:', filePath, '— serving index.html');
      // Serve index.html as fallback
      const indexPath = path.join(__dirname, 'index.html');
      fs.readFile(indexPath, (err2, indexData) => {
        if (err2) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Server error — index.html not found. Check your files are uploaded.');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Permissions-Policy': 'camera=*, microphone=*',
        });
        res.end(indexData);
      });
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'text/plain';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Permissions-Policy': 'camera=*, microphone=*',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ SilentBridge running on port ${PORT}`);
  console.log(`📁 Serving files from: ${__dirname}`);
  // List all files in directory so we can debug
  fs.readdirSync(__dirname).forEach(f => console.log(' -', f));
});
