import React, { useState, useEffect } from 'react';
import Monitor from './Monitor';
import Viewer from './Viewer';
import Flashcards from './Flashcards';
import { fetchServerConfig } from './config';

export default function App() {
  const [role, setRole] = useState(null);
  const [room, setRoom] = useState('');
  const [isFixedRoom, setIsFixedRoom] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room') || params.get('r');
    const envRoom = import.meta.env.VITE_DEFAULT_ROOM;
    const initial = urlRoom || envRoom || '';
    if (initial) setRoom(initial);
    (async () => {
      try {
        const cfg = await fetchServerConfig();
        if (cfg?.fixedRoom) {
          setRoom(cfg.fixedRoom);
          setIsFixedRoom(true);
        }
      } catch {}
    })();
  }, []);

  if (role === 'flashcards') return <Flashcards onBack={() => setRole(null)} />;

  if (!role) {
    return (
      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <h1>RagnarCam</h1>
        <input
          placeholder="Ange rum/namn på stream"
          value={room}
          onChange={e => setRoom(e.target.value)}
          style={{ padding: 8, fontSize: 16 }}
          disabled={isFixedRoom}
        />
        <div style={{ marginTop: 20 }}>
          <button disabled={!room} onClick={() => setRole('monitor')} style={{ marginRight: 10 }}>
            Starta som Monitor
          </button>
          <button disabled={!room} onClick={() => setRole('viewer')}>
            Anslut som Viewer
          </button>
        </div>
        <div style={{ marginTop: 32, borderTop: '1px solid #ccc', paddingTop: 24 }}>
          <button onClick={() => setRole('flashcards')} style={{ padding: '10px 24px', fontSize: 16 }}>
            🃏 Flashcards
          </button>
        </div>
      </div>
    );
  }

  if (role === 'monitor') return <Monitor room={room} />;
  if (role === 'viewer') return <Viewer room={room} />;
  return null;
}
