// Small helper to compute signaling URLs and fetch ICE servers

export function getSignalingOrigin() {
  const envUrl = import.meta.env.VITE_SIGNALING_ORIGIN || import.meta.env.VITE_SIGNALING_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');

  const { protocol, hostname, host } = window.location;
  const isSecure = protocol === 'https:';
  // Dev: use localhost:4000 signaling
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${isSecure ? 'https' : 'http'}://localhost:4000`;
  }
  // Prod: same origin as the page
  return `${protocol}//${host}`;
}

export function getWsUrl() {
  const origin = getSignalingOrigin();
  const wsProto = origin.startsWith('https') ? 'wss' : 'ws';
  const withoutProto = origin.replace(/^https?:\/\//, '');
  return `${wsProto}://${withoutProto}`;
}

export async function fetchIceServers() {
  const origin = getSignalingOrigin();
  try {
    const res = await fetch(`${origin}/config`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.iceServers) && data.iceServers.length) return data.iceServers;
  } catch (e) {
    // fallback below
  }
  return [
    { urls: 'stun:stun.l.google.com:19302' }
  ];
}
