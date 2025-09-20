import React, { useRef, useEffect, useState } from 'react';
import { getWsUrl, fetchIceServers } from './config';


export default function Viewer({ room }) {
  const videoRef = useRef();
  const wsRef = useRef();
  const pcRef = useRef();
  const [status, setStatus] = useState('Väntar på monitor…');
  const [muted, setMuted] = useState(true);
  const [wsState, setWsState] = useState('CONNECTING');
  const [pcState, setPcState] = useState('new');
  const [iceState, setIceState] = useState('new');
  const [candidates, setCandidates] = useState(0);
  const [audioInfo, setAudioInfo] = useState({ count: 0 });
  const [clips, setClips] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [sharingSupport, setSharingSupport] = useState({ url: false, files: false });
  const [talkbackOn, setTalkbackOn] = useState(false);
  const micStreamRef = useRef(null);

  useEffect(() => {
    let ws, pc;
    (async () => {
  ws = new WebSocket(getWsUrl());
      wsRef.current = ws;
  ws.onopen = () => setWsState('OPEN');
  ws.onclose = () => setWsState('CLOSED');
  ws.onerror = () => setWsState('ERROR');
      const iceServers = await fetchIceServers();
  pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
  pc.onconnectionstatechange = () => setPcState(pc.connectionState);
  pc.oniceconnectionstatechange = () => setIceState(pc.iceConnectionState);

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        videoRef.current.srcObject = stream;
        setAudioInfo({ count: stream.getAudioTracks().length });
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'monitor-ready') {
          setStatus('Monitor redo – väntar på offer…');
        } else if (msg.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: 'answer', room, payload: answer }));
          setStatus('Ansluten');
        } else if (msg.type === 'ice-candidate') {
          try {
            await pc.addIceCandidate(msg.payload);
          } catch (e) {}
        } else if (msg.type === 'monitor-left') {
          setStatus('Monitor lämnade – väntar på ny monitor…');
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          setCandidates(c => c + 1);
          ws.send(JSON.stringify({ type: 'ice-candidate', room, payload: event.candidate }));
        }
      };

      ws.onopen = () => {
        // Join as viewer
        ws.send(JSON.stringify({ type: 'join', role: 'viewer', room }));
      };
    })();

    return () => {
      wsRef.current?.close();
      pcRef.current?.close();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [room]);

  useEffect(() => {
    // Detect Web Share support
    const urlShare = !!navigator.share;
    const filesShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] });
    setSharingSupport({ url: urlShare, files: filesShare });
  }, []);

  const inferMimeFromUrl = (url) => {
    try {
      const u = new URL(url, window.location.href);
      const ext = (u.pathname.split('.').pop() || '').toLowerCase();
      if (ext === 'mp4') return 'video/mp4';
      if (ext === 'webm') return 'video/webm';
    } catch {}
    return 'application/octet-stream';
  };

  const downloadClip = async (clip) => {
    try {
      const res = await fetch(clip.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = clip.file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      console.error('Download failed', e);
      alert('Kunde inte ladda ner klipp. Prova att öppna länken och spara därifrån.');
    }
  };

  const shareClip = async (clip) => {
    try {
      if (!navigator.share) {
        // Fallback: try opening native share with URL (some browsers support this)
        alert('Delning stöds inte på denna enhet. Prova att ladda ner klippet istället.');
        return;
      }
      // Try share with file first if supported
      const res = await fetch(clip.url);
      const blob = await res.blob();
      const mime = inferMimeFromUrl(clip.url) || blob.type || 'application/octet-stream';
      const file = new File([blob], clip.file, { type: mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'RagnarCam klipp', text: clip.file });
      } else {
        // Fallback: share URL
        await navigator.share({ title: 'RagnarCam klipp', url: new URL(clip.url, window.location.href).toString() });
      }
    } catch (e) {
      // User cancel or not supported
    }
  };

  const toggleTalkback = async () => {
    try {
      const pc = pcRef.current;
      const ws = wsRef.current;
      if (!pc || !ws || ws.readyState !== WebSocket.OPEN) return;
      if (!talkbackOn) {
        // start mic
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micStreamRef.current = stream;
        const track = stream.getAudioTracks()[0];
        pc.addTrack(track, stream);
        // renegotiate
        ws.send(JSON.stringify({ type: 'renegotiate', room }));
        setTalkbackOn(true);
      } else {
        // stop mic
        const senders = pc.getSenders().filter(s => s.track && s.track.kind === 'audio');
        senders.forEach(s => pc.removeTrack(s));
        micStreamRef.current?.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
        // renegotiate
        ws.send(JSON.stringify({ type: 'renegotiate', room }));
        setTalkbackOn(false);
      }
    } catch (e) {
      alert('Kunde inte hantera mikrofon: ' + (e?.message || e));
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/clips/${encodeURIComponent(room)}`);
        const data = await res.json();
        if (!cancelled) setClips(data);
      } catch (e) {
        // ignore
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [room]);

  return (
    <div style={{ textAlign: 'center', marginTop: 40 }}>
      <h2>Viewer ({room})</h2>
      <video ref={videoRef} autoPlay playsInline muted={muted} style={{ width: '80%', maxWidth: 500 }} />
      <p>{status}</p>
      <div style={{ fontSize: 12, color: '#555' }}>
        WS: {wsState} | PC: {pcState} | ICE: {iceState} | ICE candidates: {candidates}
      </div>
      <div style={{ marginTop: 10 }}>
        <button onClick={async () => {
          setMuted(m => !m);
          try { await videoRef.current.play(); } catch {}
        }}>{muted ? 'Unmute' : 'Mute'}</button>
        <button onClick={toggleTalkback} style={{ marginLeft: 8 }}>{talkbackOn ? 'Stäng mic (till monitor)' : 'Starta mic (till monitor)'}</button>
      </div>
      <div style={{ fontSize: 12, color: '#555' }}>Remote audio tracks: {audioInfo.count}</div>
      <div style={{ marginTop: 24, textAlign: 'left', maxWidth: 600, marginInline: 'auto' }}>
        <h3>Klipp</h3>
        <div style={{ marginBottom: 8 }}>
          <button onClick={async () => {
            try {
              const res = await fetch(`/api/clips/${encodeURIComponent(room)}`);
              setClips(await res.json());
            } catch {}
          }}>Uppdatera lista</button>
        </div>
        {clips.length === 0 ? (
          <div style={{ fontSize: 14, color: '#666' }}>Inga klipp ännu.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {clips.map((c) => (
              <li key={c.file} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 220 }}>
                  {new Date(c.ts || Date.now()).toLocaleString()} – {c.file}
                </a>
                <span style={{ fontSize: 12, color: '#666' }}>{c.file.toLowerCase().endsWith('.mp4') ? 'MP4' : c.file.toLowerCase().endsWith('.webm') ? 'WEBM' : ''}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setSelectedClip(c)}>Spela här</button>
                  <button onClick={() => downloadClip(c)}>Ladda ner</button>
                  <button onClick={() => shareClip(c)} disabled={!sharingSupport.url}>Dela</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {selectedClip && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Spelar: {selectedClip.file}</strong>
              <button onClick={() => setSelectedClip(null)}>Stäng</button>
            </div>
            <video src={selectedClip.url} style={{ width: '100%', maxWidth: 600 }} controls playsInline />
          </div>
        )}
        {selectedClip && selectedClip.file.toLowerCase().endsWith('.webm') && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
            iOS kan ha svårt att spela WEBM efter nedladdning. Spela gärna här i appen, öppna i Safari, eller dela till VLC/Infuse.
          </div>
        )}
      </div>
    </div>
  );
}
