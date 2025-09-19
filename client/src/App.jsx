import React, { useState } from 'react';
import Monitor from './Monitor';
import Viewer from './Viewer';

export default function App() {
  const [role, setRole] = useState(null);
  const [room, setRoom] = useState('');

  if (!role) {
    return (
      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <h1>RagnarCam</h1>
        <input
          placeholder="Ange rum/namn på stream"
          value={room}
          onChange={e => setRoom(e.target.value)}
          style={{ padding: 8, fontSize: 16 }}
        />
        <div style={{ marginTop: 20 }}>
          <button disabled={!room} onClick={() => setRole('monitor')} style={{ marginRight: 10 }}>
            Starta som Monitor
          </button>
          <button disabled={!room} onClick={() => setRole('viewer')}>
            Anslut som Viewer
          </button>
        </div>
      </div>
    );
  }

  if (role === 'monitor') return <Monitor room={room} />;
  if (role === 'viewer') return <Viewer room={room} />;
  return null;
}
