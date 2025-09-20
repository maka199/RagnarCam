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
        videoRef.current.srcObject = event.streams[0];
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

  return (
    <div style={{ textAlign: 'center', marginTop: 40 }}>
      <h2>Viewer ({room})</h2>
      <video ref={videoRef} autoPlay playsInline muted={muted} style={{ width: '80%', maxWidth: 500 }} />
      <p>{status}</p>
      <div style={{ fontSize: 12, color: '#555' }}>
        WS: {wsState} | PC: {pcState} | ICE: {iceState} | ICE candidates: {candidates}
      </div>
      <div style={{ marginTop: 10 }}>
        <button onClick={() => setMuted(m => !m)}>{muted ? 'Unmute' : 'Mute'}</button>
      </div>
    </div>
  );
}
