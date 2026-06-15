const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const host = process.env.SITE_HOST || '127.0.0.1';
const port = Number(process.env.SITE_PORT || 5174);
const root = path.resolve(__dirname, '..', 'dist');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.whatsapp.net https://*.fbcdn.net",
  "connect-src 'self' http://127.0.0.1:3334 http://localhost:3334",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

function securityHeaders() {
  return {
    'Content-Security-Policy': contentSecurityPolicy,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Origin-Agent-Cluster': '?1',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'X-XSS-Protection': '0',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), xr-spatial-tracking=()',
  };
}

function safeFilePath(urlPath) {
  const pathname = new URL(urlPath || '/', `http://${host}:${port}`).pathname;
  const decodedPathname = decodeURIComponent(pathname);
  const assetIndex = decodedPathname.lastIndexOf('/assets/');
  const normalizedPathname = assetIndex >= 0 ? decodedPathname.slice(assetIndex + 1) : decodedPathname;
  const relativePath = normalizedPathname.replace(/^[/\\]+/, '');
  const candidate = path.resolve(root, relativePath || 'index.html');
  const relative = path.relative(root, candidate);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return path.join(root, 'index.html');
  }

  return candidate;
}

const server = http.createServer((req, res) => {
  if (!fs.existsSync(root)) {
    res.writeHead(500, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Pasta dist não encontrada. Rode npm run build antes.');
    return;
  }

  let filePath = safeFilePath(req.url || '/');
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(root, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = contentTypes[ext] || 'application/octet-stream';

  res.writeHead(200, {
    ...securityHeaders(),
    'Content-Type': type,
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Syntra Food site em http://${host}:${port}/`);
});
