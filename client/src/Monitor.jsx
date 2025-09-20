
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

        ws.onopen = () => {
          // Join as monitor
          ws.send(JSON.stringify({ type: 'join', role: 'monitor', room }));
        };

        ws.onmessage = async (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === 'viewer-ready') {
            // Create offer when a viewer is present
            const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
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
    setMicOn(prev => !prev);
  };

  const toggleCam = () => {
    const stream = videoRef.current?.srcObject;
    if (!stream) return;
    stream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
    setCamOn(prev => !prev);
  };

  return (
    <div style={{ textAlign: 'center', marginTop: 40 }}>
      <h2>Monitor ({room})</h2>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '80%', maxWidth: 500 }} />
      <p>{status}</p>
      <div style={{ fontSize: 12, color: '#555' }}>
        WS: {wsState} | PC: {pcState} | ICE: {iceState} | ICE candidates: {candidates}
      </div>
      <div style={{ marginTop: 10 }}>
        <button onClick={toggleMic} style={{ marginRight: 8 }}>{micOn ? 'Mute mic' : 'Unmute mic'}</button>
        <button onClick={toggleCam} style={{ marginRight: 8 }}>{camOn ? 'Stäng kamera' : 'Starta kamera'}</button>
        <button onClick={switchCamera}>Byt kamera</button>
      </div>
    </div>
  );
}
