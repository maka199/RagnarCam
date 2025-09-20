
import React, { useRef, useEffect, useState } from 'react';
import { getWsUrl, fetchIceServers } from './config';

export default function Monitor({ room }) {
  const videoRef = useRef();
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
  const manualStartRef = useRef(null);
  const canvasRef = useRef();
  const lastFrameRef = useRef(null);
  const recRef = useRef(null);
  const recChunksRef = useRef([]);
  const recordingRef = useRef(false);
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
    ws.addEventListener('open', () => { setWsState('OPEN'); setStatus('Ansluter till signalserver…'); });
    ws.addEventListener('close', () => { setWsState('CLOSED'); setStatus('WS stängd'); });
    ws.addEventListener('error', () => { setWsState('ERROR'); setStatus('WS-fel'); });

        const iceServers = await fetchIceServers();
        pc = new RTCPeerConnection({ iceServers });
  pcRef.current = pc;
  pc.onconnectionstatechange = () => setPcState(pc.connectionState);
  pc.oniceconnectionstatechange = () => setIceState(pc.iceConnectionState);
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        ws.addEventListener('open', () => {
          // Join as monitor
          try { ws.send(JSON.stringify({ type: 'join', role: 'monitor', room })); } catch {}
        });

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

  // Start motion/sound triggers when enabled and expose manual start regardless of autoRec
  useTriggers(videoRef, canvasRef, lastFrameRef, setStatus, recRef, recChunksRef, recordingRef, roomRef, autoRec, undefined, manualStartRef);

  return (
    <div style={{ textAlign: 'center', marginTop: 40 }}>
      <h2>Monitor ({room})</h2>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '80%', maxWidth: 500 }} />
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
      <div style={{ marginTop: 10 }}>
        <button onClick={() => manualStartRef.current && manualStartRef.current()}>
          Spela in nu (test)
        </button>
      </div>
    </div>
  );
}

// Motion + audio trigger hook
function useTriggers(videoRef, canvasRef, lastFrameRef, setStatus, recRef, recChunksRef, recordingRef, roomRef, enabled, settings, manualStartRef) {
  useEffect(() => {
    let rafId, audioCtx, analyser, dataArray;
    let lastTrigger = 0;
    const motionThresh = 20; // avg diff threshold (default)
    const audioThresh = 0.08; // RMS threshold (default)
    const cooldownMs = 10000; // 10s between recordings (default)

    let arming = false;
    const startRecording = () => {
      if (recordingRef.current) return;
      if (arming) return;
      const stream = videoRef.current?.srcObject;
      if (!stream) return;
      try {
        // Pick a supported mime type
        const candidates = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
          'video/mp4' // iOS Safari sometimes supports this for MediaRecorder
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
          // start cooldown from clip end so nästa trigger kan ske efter paus
          try { /* ensure recorder is cleared */ recRef.current = null; } catch {}
          // mark senaste trigger som nu (slutet av klipp)
          try { lastTrigger = Date.now(); } catch {}
        };
        rec.start();
        recordingRef.current = true;
        arming = false;
  setStatus('Inspelning startad…');
        // Stop after 30 seconds
        setTimeout(() => { try { rec.stop(); } catch {} }, 30000);
      } catch (e) {
        console.error('MediaRecorder error', e);
        setStatus(`Kunde inte starta inspelning: ${e?.name || 'Error'} ${e?.message || ''}`.trim());
      }
    };

    // Always expose manual start
    if (manualStartRef) {
      manualStartRef.current = () => startRecording();
    }

    const tick = () => {
      if (!enabled) { rafId = requestAnimationFrame(tick); return; }
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
          if ((motionHit || audioHit) && now - lastTrigger > cooldownMs) {
            lastTrigger = now;
            arming = true;
            startRecording();
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

    if (enabled) {
      setupAudio();
    }
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      try { audioCtx?.close(); } catch {}
      if (manualStartRef) manualStartRef.current = null;
    };
  }, [videoRef, canvasRef, lastFrameRef, setStatus, recRef, recChunksRef, recordingRef, roomRef, enabled, manualStartRef]);
}
