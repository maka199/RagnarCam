
import React, { useRef, useEffect, useState } from 'react';
import { getWsUrl, fetchIceServers } from './config';

export default function Monitor({ room }) {
  const videoRef = useRef();
  const remoteAudioRef = useRef();
  const wsRef = useRef();
  const pcRef = useRef();
  const [status, setStatus] = useState('Initierar kamera…');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [facingMode, setFacingMode] = useState('environment');
  const [wsState, setWsState] = useState('CONNECTING');
  const [pcState, setPcState] = useState('new');
  const [iceState, setIceState] = useState('new');
  const [candidates, setCandidates] = useState(0);
  const [audioInfo, setAudioInfo] = useState({ count: 0, enabled: false });
  const [autoRec, setAutoRec] = useState(true);
  const [settings, setSettings] = useState({
    motionThresh: 20,     // pixel diff avg
    audioThresh: 0.08,    // RMS
    calmMs: 2000,         // stop N ms efter att aktivitet upphört
    maxMs: 60000,         // max klipplängd (1 min)
    cooldownMs: 10000,    // min tid mellan klipp
    extendOnActivity: false, // förläng klipp så länge aktivitet pågår
    preferMp4: true        // försök spela in som MP4 när möjligt (för iOS-kompatibilitet)
  });
  const canvasRef = useRef();
  const lastFrameRef = useRef(null);
  const recRef = useRef(null);
  const recChunksRef = useRef([]);
  const recordingRef = useRef(false);
  const stopTimerRef = useRef(null);
  const roomRef = useRef(room);
  useEffect(() => { roomRef.current = room; }, [room]);

  useEffect(() => {
    let ws, pc, localStream;
    (async () => {
      try {
        // Prefer rear camera on mobile and echo-cancel audio
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
          audio: { echoCancellation: true, noiseSuppression: true }
        });
  if (videoRef.current) videoRef.current.srcObject = localStream;
  const aTracks = localStream.getAudioTracks();
  setAudioInfo({ count: aTracks.length, enabled: aTracks[0]?.enabled ?? false });
  setStatus('Kamera igång – väntar på viewer…');
      } catch (err) {
        alert('Kunde inte starta kamera: ' + err.message);
        console.error('getUserMedia error:', err);
        return;
      }

      try {
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
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        pc.ontrack = (event) => {
          // Receive viewer's audio (talkback)
          const stream = event.streams[0];
          if (event.track.kind === 'audio' && remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
            // Try autoplay silently; may require user gesture to start
            remoteAudioRef.current.play().catch(() => {});
          }
        };

        ws.onopen = () => {
          // Join as monitor
          ws.send(JSON.stringify({ type: 'join', role: 'monitor', room }));
        };

        ws.onmessage = async (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === 'viewer-ready') {
            // Create offer when a viewer is present
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'offer', room, payload: offer }));
            setStatus('Viewer ansluten – skickar offer…');
          } else if (msg.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
            setStatus('Ansluten');
          } else if (msg.type === 'renegotiate') {
            // Viewer requests a fresh offer (e.g., to add/remove mic)
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'offer', room, payload: offer }));
            setStatus('Renegotierar…');
          } else if (msg.type === 'ice-candidate') {
            try {
              await pc.addIceCandidate(msg.payload);
            } catch (e) { console.error('ICE error:', e); }
          } else if (msg.type === 'viewer-left') {
            setStatus('Viewer lämnade – väntar på ny viewer…');
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            setCandidates(c => c + 1);
            ws.send(JSON.stringify({ type: 'ice-candidate', room, payload: event.candidate }));
          }
        };
      } catch (err) {
        alert('WebRTC/WebSocket-fel: ' + err.message);
        console.error('WebRTC/WebSocket error:', err);
      }
    })();

    return () => {
      wsRef.current?.close();
      pcRef.current?.close();
      if (videoRef.current) videoRef.current.srcObject = null;
      try { if (localStream) localStream.getTracks().forEach(track => track.stop()); } catch {}
    };
  }, [room]);

  const switchCamera = async () => {
    try {
      const newMode = facingMode === 'environment' ? 'user' : 'environment';
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: newMode } },
        audio: false
      });
      const newTrack = newStream.getVideoTracks()[0];
      const video = videoRef.current;
      if (!video) return;
      const oldStream = video.srcObject;
      const sender = pcRef.current?.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender && newTrack) {
        await sender.replaceTrack(newTrack);
      }
      // Update local preview
      const tracks = oldStream ? oldStream.getAudioTracks() : [];
      const combined = new MediaStream([newTrack, ...tracks]);
      video.srcObject = combined;
      // Stop old video tracks
      if (oldStream) oldStream.getVideoTracks().forEach(t => t.stop());
      setFacingMode(newMode);
    } catch (e) {
      alert('Kunde inte byta kamera: ' + e.message);
    }
  };

  const toggleMic = () => {
    const stream = videoRef.current?.srcObject;
    if (!stream) return;
    stream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
    const a = stream.getAudioTracks();
    setAudioInfo({ count: a.length, enabled: a[0]?.enabled ?? false });
    setMicOn(prev => !prev);
  };

  const toggleCam = () => {
    const stream = videoRef.current?.srcObject;
    if (!stream) return;
    stream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
    setCamOn(prev => !prev);
  };

  // Start motion/sound triggers when enabled
  useTriggers(videoRef, canvasRef, lastFrameRef, setStatus, recRef, recChunksRef, recordingRef, roomRef, autoRec, settings);

  return (
    <div style={{ textAlign: 'center', marginTop: 40 }}>
      <h2>Monitor ({room})</h2>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '80%', maxWidth: 500 }} />
  <audio ref={remoteAudioRef} controls style={{ display: 'block', margin: '8px auto' }} />
      <canvas ref={canvasRef} width={320} height={180} style={{ display: 'none' }} />
      <p>{status}</p>
      <div style={{ fontSize: 12, color: '#555' }}>
        WS: {wsState} | PC: {pcState} | ICE: {iceState} | ICE candidates: {candidates}
      </div>
      <div style={{ marginTop: 10 }}>
        <button onClick={toggleMic} style={{ marginRight: 8 }}>{micOn ? 'Mute mic' : 'Unmute mic'}</button>
        <button onClick={toggleCam} style={{ marginRight: 8 }}>{camOn ? 'Stäng kamera' : 'Starta kamera'}</button>
        <button onClick={switchCamera}>Byt kamera</button>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={{ fontSize: 14 }}>
          <input type="checkbox" checked={autoRec} onChange={e => setAutoRec(e.target.checked)} style={{ marginRight: 6 }} />
          Autoinspelning (rörelse/ljud)
        </label>
      </div>
      {autoRec && (
        <div style={{ marginTop: 16, fontSize: 14, textAlign: 'left', maxWidth: 520, marginInline: 'auto' }}>
          <details>
            <summary>Inspelningsinställningar</summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <label>Rörelsetröskel
                <input type="number" min={1} max={150} step={1} value={settings.motionThresh}
                  onChange={e => setSettings(s => ({ ...s, motionThresh: Number(e.target.value) }))}
                  style={{ width: '100%' }} />
              </label>
              <label>Ljudtröskel (RMS)
                <input type="number" min={0} max={0.5} step={0.01} value={settings.audioThresh}
                  onChange={e => setSettings(s => ({ ...s, audioThresh: Number(e.target.value) }))}
                  style={{ width: '100%' }} />
              </label>
              <label>Maxlängd (sek)
                <input type="number" min={10} max={120} step={5} value={Math.round(settings.maxMs/1000)}
                  onChange={e => setSettings(s => ({ ...s, maxMs: Number(e.target.value) * 1000 }))}
                  style={{ width: '100%' }} />
              </label>
              <label>Cooldown (sek)
                <input type="number" min={5} max={60} step={1} value={Math.round(settings.cooldownMs/1000)}
                  onChange={e => setSettings(s => ({ ...s, cooldownMs: Number(e.target.value) * 1000 }))}
                  style={{ width: '100%' }} />
              </label>
              <label style={{ gridColumn: '1 / span 2' }}>
                <input type="checkbox" checked={settings.extendOnActivity}
                  onChange={e => setSettings(s => ({ ...s, extendOnActivity: e.target.checked }))}
                  style={{ marginRight: 6 }} />
                Förläng medan det är aktivitet
              </label>
              <label style={{ gridColumn: '1 / span 2' }}>
                <input type="checkbox" checked={settings.preferMp4}
                  onChange={e => setSettings(s => ({ ...s, preferMp4: e.target.checked }))}
                  style={{ marginRight: 6 }} />
                Föredra MP4 (när möjligt)
              </label>
              <label style={{ opacity: settings.extendOnActivity ? 1 : 0.5 }}>
                Calm timeout (ms)
                <input type="number" min={500} max={10000} step={100} value={settings.calmMs}
                  onChange={e => setSettings(s => ({ ...s, calmMs: Number(e.target.value) }))}
                  style={{ width: '100%' }} disabled={!settings.extendOnActivity} />
              </label>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// Motion + audio trigger hook
function useTriggers(videoRef, canvasRef, lastFrameRef, setStatus, recRef, recChunksRef, recordingRef, roomRef, enabled, settings) {
  useEffect(() => {
    if (!enabled) return;
    let rafId, audioCtx, analyser, dataArray;
    let lastTrigger = 0;
  const { motionThresh, audioThresh, calmMs, maxMs, cooldownMs, extendOnActivity, preferMp4 } = settings || {};
    const recStartTsRef = { current: 0 };
    const lastActiveTsRef = { current: 0 };

    const startRecording = () => {
      if (recordingRef.current) return;
      const stream = videoRef.current?.srcObject;
      if (!stream) return;
      try {
        // Pick a supported mime type (prefer MP4 when requested)
        const candidates = preferMp4
          ? [
              'video/mp4',
              'video/webm;codecs=vp9,opus',
              'video/webm;codecs=vp8,opus',
              'video/webm'
            ]
          : [
              'video/webm;codecs=vp9,opus',
              'video/webm;codecs=vp8,opus',
              'video/webm',
              'video/mp4'
            ];
        let chosen;
        for (const m of candidates) {
          if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) { chosen = m; break; }
        }
        const options = chosen ? { mimeType: chosen } : undefined;
        const rec = new MediaRecorder(stream, options);
        recRef.current = rec;
        recChunksRef.current = [];
        rec.ondataavailable = e => { if (e.data && e.data.size) recChunksRef.current.push(e.data); };
        rec.onstop = async () => {
          if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
          const outType = chosen && chosen.includes('mp4') ? 'video/mp4' : 'video/webm';
          const blob = new Blob(recChunksRef.current, { type: outType });
          recChunksRef.current = [];
          const ts = Date.now();
          try {
            const ext = outType === 'video/mp4' ? 'mp4' : 'webm';
            await fetch(`/api/upload-clip?room=${encodeURIComponent(roomRef.current)}&ts=${ts}&ext=${ext}`, {
              method: 'POST',
              headers: { 'Content-Type': outType },
              body: blob
            });
            setStatus(prev => `Klipp sparat: ${new Date(ts).toLocaleTimeString()}`);
          } catch (e) {
            console.error('Upload failed', e);
            setStatus('Kunde inte ladda upp klipp');
          }
          recordingRef.current = false;
          lastTrigger = Date.now();
        };
        rec.start(1000); // gather data every second
        recordingRef.current = true;
        recStartTsRef.current = Date.now();
        lastActiveTsRef.current = recStartTsRef.current;
        setStatus('Inspelning startad…');
        // Explicit stop at max length to guarantee fixed length when extendOnActivity=false
        const maxMsEff = (maxMs || 60000);
        stopTimerRef.current = setTimeout(() => { try { rec.stop(); } catch {} }, maxMsEff + 50);
      } catch (e) {
        console.error('MediaRecorder error', e);
      }
    };

    const tick = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v && c) {
        const ctx = c.getContext('2d');
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const frame = ctx.getImageData(0, 0, c.width, c.height);
        if (lastFrameRef.current) {
          // compute average absolute diff
          let diff = 0;
          const a = frame.data, b = lastFrameRef.current.data;
          for (let i = 0; i < a.length; i += 4) {
            diff += Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]);
          }
          diff = diff / (c.width * c.height * 3);
          const now = Date.now();
          let rms = 0;
          if (analyser && dataArray) {
            analyser.getByteTimeDomainData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const val = (dataArray[i] - 128) / 128;
              sum += val * val;
            }
            rms = Math.sqrt(sum / dataArray.length);
          }
          const motionHit = diff > motionThresh;
          const audioHit = rms > audioThresh;
          const activeHit = motionHit || audioHit;
          if (recordingRef.current) {
            // Always stop at max length
            const recTooLong = now - recStartTsRef.current > (maxMs || 60000);
            if (extendOnActivity) {
              if (activeHit) lastActiveTsRef.current = now;
              const calmEnough = now - lastActiveTsRef.current > (calmMs || 2000);
              if (recTooLong || calmEnough) {
                try { recRef.current?.stop(); } catch {}
              }
            } else {
              if (recTooLong) {
                try { recRef.current?.stop(); } catch {}
              }
            }
          } else {
            if (activeHit && now - lastTrigger > (cooldownMs || 10000)) {
              startRecording();
            }
          }
        }
        lastFrameRef.current = frame;
      }
      rafId = requestAnimationFrame(tick);
    };

    const setupAudio = () => {
      try {
        const stream = videoRef.current?.srcObject;
        if (!stream) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        dataArray = new Uint8Array(analyser.fftSize);
        src.connect(analyser);
      } catch {}
    };

    setupAudio();
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      try { audioCtx?.close(); } catch {}
    };
  }, [videoRef, canvasRef, lastFrameRef, setStatus, recRef, recChunksRef, recordingRef, roomRef, enabled, settings]);
}
