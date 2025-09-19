import React, { useRef, useEffect } from 'react';


export default function Viewer({ room }) {
  const videoRef = useRef();
  const wsRef = useRef();
  const pcRef = useRef();

  useEffect(() => {
    let ws, pc;
    ws = new WebSocket('ws://localhost:4000');
    wsRef.current = ws;
    pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });
    pcRef.current = pc;

    pc.ontrack = (event) => {
      videoRef.current.srcObject = event.streams[0];
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', room, payload: answer }));
      } else if (msg.type === 'ice-candidate') {
        try {
          await pc.addIceCandidate(msg.payload);
        } catch (e) {}
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        ws.send(JSON.stringify({ type: 'ice-candidate', room, payload: event.candidate }));
      }
    };

    ws.onopen = () => {
      // ready to receive offer
    };

    return () => {
      wsRef.current?.close();
      pcRef.current?.close();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [room]);

  return (
    <div style={{ textAlign: 'center', marginTop: 40 }}>
      <h2>Viewer ({room})</h2>
      <video ref={videoRef} autoPlay playsInline style={{ width: '80%', maxWidth: 500 }} />
      <p>Du tittar på streamen.</p>
    </div>
  );
}
