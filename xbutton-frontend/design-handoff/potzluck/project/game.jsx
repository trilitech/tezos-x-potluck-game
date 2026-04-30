// PotzLuck — Game UI primitives
const { useState, useEffect, useRef, useMemo } = React;

const DEMO_ADDR_LONG = '0x1233767aA9bC4eF12345D87654321ABCdef983839';
function shortAddr(a) { return a.slice(0, 8) + '……' + a.slice(-6); }

// ─── Topbar ───
function TopBar({ wallet, onTakeTour, onConnect, onDisconnect }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);
  return (
    <header className="pl-topbar">
      <div className="brand">
        <div className="brand-mark">P</div>
        <span className="brand-name">PotzLuck</span>
      </div>
      <div className="topbar-right">
        {wallet.connected ? (
          <div className="wallet-menu" ref={ref}>
            <button className="wallet-pill" onClick={() => setMenuOpen(o => !o)}>
              <span className="wallet-avatar"></span>
              <span className="addr">{shortAddr(wallet.address)}</span>
              <span className="caret">▾</span>
            </button>
            {menuOpen && (
              <div className="wallet-dropdown">
                <button onClick={() => { setMenuOpen(false); onTakeTour(); }}>Take the tour</button>
                <button onClick={() => { setMenuOpen(false); onDisconnect(); }}>Disconnect wallet</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <button className="btn ghost sm" onClick={onTakeTour}>Take the tour</button>
            <a className="btn ghost sm" href="#" onClick={(e)=>e.preventDefault()}>Explore Tezos X ↗</a>
          </>
        )}
      </div>
    </header>
  );
}

// ─── Footer ───
function Footer() {
  return (
    <footer className="pl-footer">
      <div className="foot-left">
        <a href="#" onClick={(e)=>e.preventDefault()}>Twitter</a>
        <a href="#" onClick={(e)=>e.preventDefault()}>Discord</a>
      </div>
      <div className="foot-right">
        <a href="#" onClick={(e)=>e.preventDefault()}>Michelson-interface</a>
        <a href="#" onClick={(e)=>e.preventDefault()}>Docs</a>
        <a href="#" onClick={(e)=>e.preventDefault()}>Network information</a>
        <a href="#" onClick={(e)=>e.preventDefault()}>Faucet</a>
      </div>
    </footer>
  );
}

// ─── The big circular Play button (the pot itself) ───
function PotButton({ state, label, sublabel, progress, onClick, disabled }) {
  const r = 140;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - (progress ?? 0));
  return (
    <button className={`pot-btn pot-${state}`} onClick={onClick} disabled={disabled}>
      <svg className="pot-svg" viewBox="0 0 320 320">
        <circle cx="160" cy="160" r={r} fill="none" stroke={state === 'play' || state === 'depositing' ? 'var(--ring-base)' : 'var(--green)'} strokeWidth="2.5" strokeOpacity={state === 'play' || state === 'depositing' ? 1 : 0.85} />
        {progress != null && (
          <circle
            cx="160" cy="160" r={r}
            fill="none"
            stroke="var(--ring-active)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform="rotate(-90 160 160)"
            style={{ transition: 'stroke-dashoffset 1s linear', filter: 'drop-shadow(0 0 14px rgba(179,159,251,0.55))' }}
          />
        )}
        <circle cx="160" cy="160" r={r + 18} fill="none" stroke="var(--ring-pulse)" strokeWidth="1.5" className="pot-pulse" />
      </svg>
      <span className="pot-content">
        <span className="pot-label">{label}</span>
        {sublabel && <span className="pot-sublabel">{sublabel}</span>}
      </span>
    </button>
  );
}

// ─── Stats column (left) ───
function GameStats({ pot, lastPlayer, endTime, sessionActive }) {
  return (
    <aside className="game-stats">
      <div className="stat-row hero">
        <div className="stat-l">Pot size</div>
        <div className="stat-v hero-v"><b>{pot.toFixed(0)}</b> <span>USDC</span></div>
      </div>
      <div className="stat-row">
        <div className="stat-l">Last player</div>
        <div className="stat-v">{lastPlayer || '—'}</div>
      </div>
      <div className="stat-row">
        <div className="stat-l">Game ends</div>
        <div className="stat-v">{endTime}</div>
      </div>
      <div className={`session-state ${sessionActive ? 'active' : 'idle'}`}>
        <span className="dot"></span>
        {sessionActive ? 'Session active' : 'No active session'}
      </div>
    </aside>
  );
}

// ─── Event log strip below pot ───
function EventLog({ entries }) {
  const shown = entries.slice(-4);
  return (
    <div className="event-log-strip">
      {shown.length === 0 ? (
        <div className="el-empty">[EVENT LOG] waiting for activity…</div>
      ) : shown.map((e, i) => {
        const ageFromBottom = shown.length - 1 - i;
        const cls = ageFromBottom === 0 ? 'fresh' : ageFromBottom === 1 ? 'recent' : 'older';
        return (
          <div key={e.id} className={`el-line ${cls}`}>
            <span className="el-tag">[EVENT LOG]</span>
            <span className="el-msg" dangerouslySetInnerHTML={{ __html: e.msg }} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Airdrop modal ───
function AirdropModal({ open, onDismiss }) {
  if (!open) return null;
  return (
    <div className="tour-backdrop">
      <div className="tour-card sm">
        <div className="tour-head">
          <div className="tour-step-pill">
            <span style={{ color: 'var(--fg-1)' }}>Welcome aboard</span>
          </div>
          <button className="tour-close" onClick={onDismiss}>✕</button>
        </div>
        <div className="tour-body">
          <h2 className="tour-h">You've got 5 USDC and 5 XTZ. On us.</h2>
          <p className="tour-sub">
            We airdropped <b>5 USDC</b> to play with and <b>5 XTZ</b> for gas into your wallet on the EVM interface of Tezos X.
            You're ready to play.
          </p>
          <div className="airdrop-grid">
            <div className="airdrop-card">
              <div className="token"><span className="ic usdc">$</span> USDC</div>
              <div className="amt">5.00<span className="delta">+5.00</span></div>
              <div className="src">stake currency</div>
            </div>
            <div className="airdrop-card">
              <div className="token"><span className="ic xtz">ꜩ</span> XTZ</div>
              <div className="amt">5.00<span className="delta">+5.00</span></div>
              <div className="src">gas</div>
            </div>
          </div>
        </div>
        <div className="tour-foot">
          <span className="hint">You'll need 1 USDC per Play.</span>
          <button className="btn primary" onClick={onDismiss}>Let's play <span className="kbd">↵</span></button>
        </div>
      </div>
    </div>
  );
}

// ─── Wrong-network helper text ───
function NetworkHelp({ onAdd }) {
  return (
    <div className="net-help">
      You're not on the Tezos X network. <button className="link-btn inline" onClick={onAdd}>Add the Tezos X network</button> to your EVM or Tezos-compatible wallet to play.
    </div>
  );
}

window.TopBar = TopBar;
window.Footer = Footer;
window.PotButton = PotButton;
window.GameStats = GameStats;
window.EventLog = EventLog;
window.AirdropModal = AirdropModal;
window.NetworkHelp = NetworkHelp;
window.shortAddr = shortAddr;
window.DEMO_ADDR_LONG = DEMO_ADDR_LONG;
