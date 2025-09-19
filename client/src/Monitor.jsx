
import React, { useRef, useEffect } from 'react';

export default function Monitor({ room }) {
  const videoRef = useRef();
  const wsRef = useRef();
  const pcRef = useRef();

  useEffect(() => {
    let ws, pc, localStream;
    (async () => {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      videoRef.current.srcObject = localStream;

      ws = new WebSocket('ws://localhost:4000');
      wsRef.current = ws;

      pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });
      pcRef.current = pc;
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      ws.onopen = () => {
        // ready to signal
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
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

      // Skapa offer och skicka till signaling server
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'offer', room, payload: offer }));
      };
    })();

    return () => {
      wsRef.current?.close();
      pcRef.current?.close();
      if (videoRef.current) videoRef.current.srcObject = null;
      if (localStream) localStream.getTracks().forEach(track => track.stop());
    };
  }, [room]);

  return (
    <div style={{ textAlign: 'center', marginTop: 40 }}>
      <h2>Monitor ({room})</h2>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '80%', maxWidth: 500 }} />
      <p>Din kamera streamas till rummet.</p>
    </div>
  );
}
