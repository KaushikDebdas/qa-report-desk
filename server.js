// QA Report Desk server. No framework: Node's built-in http only.
// Documents and screenshots are stored as plain files under ./data
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';          // set HOST=0.0.0.0 to share on your network
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUB = path.join(__dirname, 'public');
const DOCS = path.join(DATA, 'docs'), SHOTS = path.join(DATA, 'shots');
fs.mkdirSync(DOCS, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });

const VENDOR = {
  '/vendor/docx.js': 'node_modules/docx/build/index.umd.js',
  '/vendor/exceljs.js': 'node_modules/exceljs/dist/exceljs.min.js'
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}
function writeAtomic(file, text) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, text); fs.renameSync(tmp, file);
}
function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = decodeURIComponent(url.pathname);
    if (p.startsWith('/api/')) {
      const [, , kind, id] = p.split('/');
      const dir = kind === 'docs' ? DOCS : kind === 'shots' ? SHOTS : null;
      if (!dir) return send(res, 404, '{"error":"unknown"}');
      fs.mkdirSync(dir, { recursive: true });   // survives someone deleting the data folder while running
      if (!id) {
        if (kind !== 'docs' || req.method !== 'GET') return send(res, 405, '{"error":"method"}');
        const list = [];
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith('.json')) continue;
          try { list.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch (e) { /* skip unreadable file */ }
        }
        return send(res, 200, JSON.stringify(list));
      }
      if (!ID.test(id)) return send(res, 400, '{"error":"bad id"}');
      const file = path.join(dir, id + (kind === 'docs' ? '.json' : '.txt'));
      if (req.method === 'GET') {
        if (!fs.existsSync(file)) return send(res, 404, '{"error":"missing"}');
        return send(res, 200, fs.readFileSync(file), kind === 'docs' ? undefined : 'text/plain; charset=utf-8');
      }
      if (req.method === 'PUT') {
        const body = await readBody(req, 60 * 1024 * 1024);
        if (kind === 'docs') JSON.parse(body);   // reject malformed JSON
        writeAtomic(file, body);
        return send(res, 200, '{"ok":true}');
      }
      if (req.method === 'DELETE') { try { fs.unlinkSync(file); } catch (e) { /* already gone */ } return send(res, 200, '{"ok":true}'); }
      return send(res, 405, '{"error":"method"}');
    }
    if (VENDOR[p]) return serveFile(res, path.join(__dirname, VENDOR[p]));
    const rel = p === '/' ? '/index.html' : p;
    const file = path.normalize(path.join(PUB, rel));
    if (!file.startsWith(PUB + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
    serveFile(res, file);
  } catch (e) {
    send(res, 500, JSON.stringify({ error: String(e.message || e) }));
  }
}).listen(PORT, HOST, () => console.log('QA Report Desk running at http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT + '  (data in ' + DATA + ')'));
