import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import fsp from 'fs/promises';

const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const FIXED_ROOM = process.env.ROOM_ID || process.env.ROOM || null;

// Room state: one monitor + one viewer per room (simple 1:1)
// rooms[roomId] = { monitor: WebSocket|null, viewer: WebSocket|null }
const rooms = {};

function getRoom(room) {
  if (!rooms[room]) rooms[room] = { monitor: null, viewer: null };
  return rooms[room];
}

function safeSend(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return; // ignore invalid json
    }

    const { type, room, payload, role } = data || {};
    // Enforce fixed room if configured
    const effectiveRoom = FIXED_ROOM || room;
    if (!effectiveRoom) return;
    if (FIXED_ROOM && room && room !== FIXED_ROOM) {
      // Optionally inform client of enforced room
      safeSend(ws, { type: 'room-overridden', payload: { room: FIXED_ROOM } });
    }
    const r = getRoom(effectiveRoom);

    // First, handle join and role assignment
    if (type === 'join' && (role === 'monitor' || role === 'viewer')) {
      ws.room = effectiveRoom;
      ws.role = role;
      if (role === 'monitor') {
        // Replace any existing monitor
        r.monitor = ws;
        // Notify both sides of readiness
        if (r.viewer) {
          safeSend(r.monitor, { type: 'viewer-ready' });
          safeSend(r.viewer, { type: 'monitor-ready' });
        }
      } else if (role === 'viewer') {
        r.viewer = ws;
        if (r.monitor) {
          safeSend(r.monitor, { type: 'viewer-ready' });
          safeSend(r.viewer, { type: 'monitor-ready' });
        }
      }
      return;
    }

    // Route signaling between roles 1:1
    if (type === 'offer' || type === 'answer' || type === 'ice-candidate') {
      if (ws.role === 'monitor') {
        // Forward to viewer
        safeSend(r.viewer, { type, payload });
      } else if (ws.role === 'viewer') {
        // Forward to monitor
        safeSend(r.monitor, { type, payload });
      }
      return;
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room || !rooms[room]) return;
    const r = rooms[room];
    if (r.monitor === ws) r.monitor = null;
    if (r.viewer === ws) r.viewer = null;
    if (!r.monitor && !r.viewer) delete rooms[room];
    else {
      // Notify the other peer that counterpart left
      if (ws.role === 'monitor' && r.viewer) safeSend(r.viewer, { type: 'monitor-left' });
      if (ws.role === 'viewer' && r.monitor) safeSend(r.monitor, { type: 'viewer-left' });
    }
  });
});

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

// Provide ICE server config to clients
app.get('/config', (req, res) => {
  // Read from env when deployed on Render or similar
  // Expect JSON in ICE_SERVERS or separate TURN creds
  try {
    if (process.env.ICE_SERVERS) {
      const parsed = JSON.parse(process.env.ICE_SERVERS);
      return res.json({ iceServers: parsed, fixedRoom: FIXED_ROOM || null });
    }
  } catch (e) {}

  const turnUrl = process.env.TURN_URL;
  const turnUser = process.env.TURN_USERNAME;
  const turnPass = process.env.TURN_PASSWORD;
  const iceServers = [];
  if (turnUrl && turnUser && turnPass) {
    iceServers.push({ urls: turnUrl, username: turnUser, credential: turnPass });
  }
  // Always include a public STUN as fallback
  iceServers.push({ urls: 'stun:stun.l.google.com:19302' });
  res.json({ iceServers, fixedRoom: FIXED_ROOM || null });
});

// Optional: serve static client if built (for Render single-service deploy)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticDir = path.join(__dirname, './client-dist');
app.get('/favicon.ico', (_req, res) => res.sendStatus(204));
app.use(express.static(staticDir));

// ---- Clips storage (simple local filesystem) ----
const clipsRoot = path.join(__dirname, './clips');
if (!fs.existsSync(clipsRoot)) fs.mkdirSync(clipsRoot, { recursive: true });

// Serve clips statically
app.use('/clips', express.static(clipsRoot));

// List clips for a room
app.get('/api/clips/:room', async (req, res) => {
  const room = (req.params.room || '').trim();
  if (!room) return res.json([]);
  try {
    const dir = path.join(clipsRoot, room);
    const files = await fsp.readdir(dir).catch(() => []);
    const items = files
      .filter(f => f.endsWith('.webm') || f.endsWith('.mp4'))
      .map(f => ({
        file: f,
        url: `/clips/${encodeURIComponent(room)}/${encodeURIComponent(f)}`,
        ts: Number(f.split('_')[0]) || null
      }))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload clip: POST /api/upload-clip?room=XYZ&ts=1690000000000&ext=webm
// Body: raw binary (video/webm or application/octet-stream)
app.post('/api/upload-clip', express.raw({ type: '*/*', limit: process.env.MAX_CLIP_SIZE || '100mb' }), async (req, res) => {
  try {
    const room = (req.query.room || FIXED_ROOM || '').toString().trim();
    if (!room) return res.status(400).json({ error: 'room required' });
    const ts = Number(req.query.ts) || Date.now();
    const ext = ((req.query.ext || '').toString().toLowerCase()) || (req.headers['content-type']?.includes('mp4') ? 'mp4' : 'webm');
    const dir = path.join(clipsRoot, room);
    await fsp.mkdir(dir, { recursive: true });
    const filename = `${ts}_clip.${ext}`;
    const filepath = path.join(dir, filename);
    if (!req.body || !req.body.length) return res.status(400).json({ error: 'empty body' });
    await fsp.writeFile(filepath, req.body);
    res.json({ ok: true, url: `/clips/${encodeURIComponent(room)}/${encodeURIComponent(filename)}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SPA fallback (must be after APIs). Exclude known API/static paths.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/config') || req.path.startsWith('/healthz') || req.path.startsWith('/api') || req.path.startsWith('/clips')) return next();
  const indexPath = path.join(staticDir, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
