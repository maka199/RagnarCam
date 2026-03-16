import React, { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'ragnarcam_flashcards';

function loadCards() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCards(cards) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

// ── Card flip component ────────────────────────────────────────────────────
function FlashCard({ card, flipped, onFlip }) {
  return (
    <div
      onClick={onFlip}
      style={{
        perspective: 1000,
        width: '100%',
        maxWidth: 380,
        height: 220,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.45s ease',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front – Question */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            background: '#1e40af',
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px 24px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}
        >
          <span style={{ color: '#93c5fd', fontSize: 11, letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>Fråga</span>
          <p style={{ color: '#fff', fontSize: 20, fontWeight: 600, textAlign: 'center', margin: 0, lineHeight: 1.4 }}>
            {card.question}
          </p>
          <span style={{ color: '#93c5fd', fontSize: 12, marginTop: 16 }}>Tryck för att vända</span>
        </div>

        {/* Back – Answer */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            background: '#065f46',
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px 24px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}
        >
          <span style={{ color: '#6ee7b7', fontSize: 11, letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>Svar</span>
          <p style={{ color: '#fff', fontSize: 20, fontWeight: 600, textAlign: 'center', margin: 0, lineHeight: 1.4 }}>
            {card.answer}
          </p>
          <span style={{ color: '#6ee7b7', fontSize: 12, marginTop: 16 }}>Tryck för att vända tillbaka</span>
        </div>
      </div>
    </div>
  );
}

// ── Add card form ──────────────────────────────────────────────────────────
function AddCardForm({ onAdd, onCancel }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a) return;
    onAdd({ id: crypto.randomUUID(), question: q, answer: a });
    setQuestion('');
    setAnswer('');
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 16,
    borderRadius: 10,
    border: '1.5px solid #334155',
    background: '#1e293b',
    color: '#f1f5f9',
    outline: 'none',
    boxSizing: 'border-box',
    resize: 'vertical',
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ color: '#f1f5f9', margin: 0, fontSize: 18 }}>Lägg till nytt kort</h3>
      <div>
        <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Fråga</label>
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Skriv frågan här…"
          rows={3}
          style={inputStyle}
          required
        />
      </div>
      <div>
        <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Svar</label>
        <textarea
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          placeholder="Skriv svaret här…"
          rows={3}
          style={inputStyle}
          required
        />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: '12px 0',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Spara kort
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '12px 0',
            background: '#334155',
            color: '#cbd5e1',
            border: 'none',
            borderRadius: 10,
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          Avbryt
        </button>
      </div>
    </form>
  );
}

// ── Main Flashcards component ──────────────────────────────────────────────
export default function Flashcards({ onBack }) {
  const [cards, setCards] = useState(loadCards);
  const [mode, setMode] = useState('list'); // 'list' | 'study' | 'add'
  const [studyIndex, setStudyIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [studyOrder, setStudyOrder] = useState([]);

  useEffect(() => {
    saveCards(cards);
  }, [cards]);

  function startStudy() {
    if (cards.length === 0) return;
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setStudyOrder(shuffled);
    setStudyIndex(0);
    setFlipped(false);
    setMode('study');
  }

  function addCard(card) {
    setCards(prev => [...prev, card]);
    setMode('list');
  }

  function deleteCard(id) {
    setCards(prev => prev.filter(c => c.id !== id));
  }

  const nextCard = useCallback(() => {
    setFlipped(false);
    setTimeout(() => setStudyIndex(i => Math.min(i + 1, studyOrder.length - 1)), 50);
  }, [studyOrder.length]);

  const prevCard = useCallback(() => {
    setFlipped(false);
    setTimeout(() => setStudyIndex(i => Math.max(i - 1, 0)), 50);
  }, []);

  const containerStyle = {
    minHeight: '100dvh',
    background: '#0f172a',
    color: '#f1f5f9',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    flexDirection: 'column',
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 20px',
    borderBottom: '1px solid #1e293b',
    background: '#0f172a',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  };

  const backBtnStyle = {
    background: 'none',
    border: 'none',
    color: '#60a5fa',
    fontSize: 22,
    cursor: 'pointer',
    padding: '4px 8px',
    lineHeight: 1,
  };

  // ── Study mode ──────────────────────────────────────────────────────
  if (mode === 'study') {
    const current = studyOrder[studyIndex];
    const isLast = studyIndex === studyOrder.length - 1;
    const isFirst = studyIndex === 0;

    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <button style={backBtnStyle} onClick={() => setMode('list')}>←</button>
          <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>Studera</h2>
          <span style={{ color: '#64748b', fontSize: 14 }}>{studyIndex + 1} / {studyOrder.length}</span>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 28 }}>
          <FlashCard card={current} flipped={flipped} onFlip={() => setFlipped(f => !f)} />

          <div style={{ display: 'flex', gap: 16, width: '100%', maxWidth: 380 }}>
            <button
              onClick={prevCard}
              disabled={isFirst}
              style={{
                flex: 1,
                padding: '14px 0',
                background: isFirst ? '#1e293b' : '#334155',
                color: isFirst ? '#475569' : '#f1f5f9',
                border: 'none',
                borderRadius: 12,
                fontSize: 22,
                cursor: isFirst ? 'default' : 'pointer',
              }}
            >
              ←
            </button>
            <button
              onClick={nextCard}
              disabled={isLast}
              style={{
                flex: 1,
                padding: '14px 0',
                background: isLast ? '#1e293b' : '#334155',
                color: isLast ? '#475569' : '#f1f5f9',
                border: 'none',
                borderRadius: 12,
                fontSize: 22,
                cursor: isLast ? 'default' : 'pointer',
              }}
            >
              →
            </button>
          </div>

          {isLast && (
            <button
              onClick={startStudy}
              style={{
                padding: '12px 32px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Blanda &amp; börja om
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Add card mode ───────────────────────────────────────────────────
  if (mode === 'add') {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <button style={backBtnStyle} onClick={() => setMode('list')}>←</button>
          <h2 style={{ margin: 0, fontSize: 18 }}>Nytt kort</h2>
        </div>
        <div style={{ padding: 24 }}>
          <AddCardForm onAdd={addCard} onCancel={() => setMode('list')} />
        </div>
      </div>
    );
  }

  // ── List mode (default) ─────────────────────────────────────────────
  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <button style={backBtnStyle} onClick={onBack}>←</button>
        <h2 style={{ margin: 0, fontSize: 20, flex: 1 }}>Flashcards</h2>
        <button
          onClick={() => setMode('add')}
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Nytt kort
        </button>
      </div>

      <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        {cards.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: 60, color: '#64748b' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🃏</div>
            <p style={{ fontSize: 16, margin: 0 }}>Inga kort ännu.</p>
            <p style={{ fontSize: 14, marginTop: 8 }}>Tryck på <strong>+ Nytt kort</strong> för att börja.</p>
          </div>
        ) : (
          cards.map((card, idx) => (
            <div
              key={card.id}
              style={{
                background: '#1e293b',
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            >
              <span style={{ color: '#475569', fontSize: 13, minWidth: 24, paddingTop: 2 }}>{idx + 1}.</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: 15, color: '#f1f5f9' }}>{card.question}</p>
                <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>{card.answer}</p>
              </div>
              <button
                onClick={() => deleteCard(card.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: 18,
                  cursor: 'pointer',
                  padding: '2px 6px',
                  flexShrink: 0,
                }}
                title="Ta bort"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {cards.length > 0 && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid #1e293b' }}>
          <button
            onClick={startStudy}
            style={{
              width: '100%',
              padding: '16px 0',
              background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
              color: '#fff',
              border: 'none',
              borderRadius: 14,
              fontSize: 18,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}
          >
            🎓 Starta studie ({cards.length} kort)
          </button>
        </div>
      )}
    </div>
  );
}
