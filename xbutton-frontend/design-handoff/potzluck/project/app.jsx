// PotzLuck — App orchestrator
const { useState, useEffect, useCallback, useRef, useMemo } = React;

// Game state machine:
// 'wrong-net'   — wallet on wrong network
// 'connect'     — not connected, pot reads "Connect wallet to Play"
// 'idle'        — connected, no active session, "Click Play to start a new session"
// 'play'        — connected, active session, "Play"
// 'depositing'  — in-flight deposit (1.5s anim)
// 'won'         — won previous session, can claim
// 'claim-done'  — claim success

const SESSION_LEN = 300; // 5 minutes
const STAKE = 1;

let _id = 0;
const nextId = () => ++_id;
const mk = (msg) => ({ id: nextId(), msg, ts: Date.now() });

function App() {
  // Landing-vs-game flow
  const [view, setView] = useState('landing'); // 'landing' | 'game'

  // Tour state
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  // Wallet
  const [wallet, setWallet] = useState({
    connected: false,
    onTezosX: false,
    address: window.DEMO_ADDR_LONG,
    usdc: 0,
    xtz: 0,
  });

  // Game
  const [pot, setPot] = useState(20);
  const [lastPlayer, setLastPlayer] = useState('0x2929……2999');
  const [sessionActive, setSessionActive] = useState(true);
  const [timeLeft, setTimeLeft] = useState(SESSION_LEN);
  const [potState, setPotState] = useState('connect'); // 'connect' | 'wrong-net' | 'idle' | 'play' | 'depositing' | 'won'
  const [logs, setLogs] = useState([]);
  const [showAirdrop, setShowAirdrop] = useState(false);
  const [hasWon, setHasWon] = useState(false);

  const push = useCallback((msg) => {
    setLogs(prev => [...prev.slice(-19), mk(msg)]);
  }, []);

  // ─── Derived UI state ───
  const endTimeStr = useMemoEnd(timeLeft, sessionActive);

  // Countdown
  useEffect(() => {
    if (!sessionActive) return;
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          // Session ends
          setSessionActive(false);
          // If you're the last player, you won
          setLastPlayer(prev => {
            if (prev === window.shortAddr(wallet.address)) {
              setHasWon(true);
              setPotState('won');
              push('Session ended → <b>you won</b> the pot');
            } else {
              push('Session ended → winner: <code>' + prev + '</code>');
            }
            return prev;
          });
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [sessionActive, wallet.address, push]);

  // Update pot button state when wallet/session change
  useEffect(() => {
    if (!wallet.connected) { setPotState('connect'); return; }
    if (!wallet.onTezosX)  { setPotState('wrong-net'); return; }
    if (hasWon)            { setPotState('won'); return; }
    if (!sessionActive)    { setPotState('idle'); return; }
    setPotState('play');
  }, [wallet.connected, wallet.onTezosX, sessionActive, hasWon]);

  // ─── Actions ───
  const handleConnect = useCallback(() => {
    // Mock: connect, but wrong network briefly, then add network -> on Tezos X
    setWallet(w => ({ ...w, connected: true, onTezosX: false }));
    push('Wallet connected · awaiting network check…');
    setTimeout(() => {
      setWallet(w => ({ ...w, onTezosX: true }));
      push('Tezos X network detected');
      // Auto-airdrop if balance is 0
      setTimeout(() => {
        setWallet(w => {
          if (w.usdc === 0 && w.xtz === 0) {
            setShowAirdrop(true);
            push('Faucet · <b>+5.00 USDC</b> → wallet');
            setTimeout(() => push('Faucet · <b>+5.00 XTZ</b> → wallet'), 500);
            return { ...w, usdc: 5, xtz: 5 };
          }
          return w;
        });
      }, 600);
    }, 900);
  }, [push]);

  const handleDisconnect = useCallback(() => {
    setWallet({ connected: false, onTezosX: false, address: window.DEMO_ADDR_LONG, usdc: 0, xtz: 0 });
    setHasWon(false);
    push('Wallet disconnected');
  }, [push]);

  const handleAddNetwork = useCallback(() => {
    setWallet(w => ({ ...w, onTezosX: true }));
    push('Tezos X network added · ready to play');
  }, [push]);

  const handlePotClick = useCallback(() => {
    if (potState === 'connect') return handleConnect();
    if (potState === 'wrong-net') return handleAddNetwork();
    if (potState === 'won') {
      // Claim flow
      setPotState('depositing');
      push('Claim requested · session ended');
      setTimeout(() => push('Relayer executing payout on EVM · <b>' + pot.toFixed(0) + ' USDC</b>'), 400);
      setTimeout(() => push('Payout successful · <b>' + pot.toFixed(0) + ' USDC</b> sent to your wallet'), 900);
      setTimeout(() => push('Michelson-interface marked as paid'), 1300);
      setTimeout(() => {
        setWallet(w => ({ ...w, usdc: w.usdc + pot }));
        setHasWon(false);
        setPot(0);
        // Start new session
        setSessionActive(true);
        setTimeLeft(SESSION_LEN);
        setLastPlayer('—');
        push('New session opening · 5 min round');
      }, 1700);
      return;
    }
    if (potState === 'idle' || potState === 'play') {
      if (wallet.usdc < STAKE) { push('Insufficient USDC · need 1 USDC to play'); return; }
      // Start deposit anim
      setPotState('depositing');
      push('1 USDC deposit detected on EVM interface');
      setTimeout(() => push('The relayer is now calling the NAC Gateway'), 500);
      setTimeout(() => push('The Gateway is updating the game storage on the Michelson-interface'), 1000);
      setTimeout(() => {
        setPot(p => p + STAKE);
        setWallet(w => ({ ...w, usdc: w.usdc - STAKE }));
        setLastPlayer(window.shortAddr(window.DEMO_ADDR_LONG));
        if (!sessionActive) {
          setSessionActive(true);
          setTimeLeft(SESSION_LEN);
        } else {
          // Don't reset timer — last-in-wins, but timer continues. (matches sketch)
        }
        push('Game state updated · last player = <code>' + window.shortAddr(window.DEMO_ADDR_LONG) + '</code>');
        setPotState('play');
      }, 1500);
    }
  }, [potState, wallet.usdc, pot, sessionActive, push, handleConnect, handleAddNetwork]);

  // Tour handlers
  const tourNext = useCallback(() => setTourStep(s => Math.min(window.TOUR_STEPS.length - 1, s + 1)), []);
  const tourBack = useCallback(() => setTourStep(s => Math.max(0, s - 1)), []);
  const tourClose = useCallback(() => setTourOpen(false), []);
  const tourEnd = useCallback(() => {
    setTourOpen(false);
    setView('game');
  }, []);
  const openTourFromGame = useCallback(() => {
    setTourStep(0);
    setTourOpen(true);
  }, []);

  // From landing
  const startTour = useCallback(() => {
    setView('game'); // tour overlays game
    setTourStep(0);
    setTourOpen(true);
  }, []);
  const skipToGame = useCallback(() => setView('game'), []);

  // ─── Render ───
  // Landing
  if (view === 'landing') {
    return (
      <>
        <div className="bg-grid"></div>
        <div className="bg-glow"></div>
        <div className="pl-shell">
          <header className="pl-topbar">
            <div className="brand">
              <div className="brand-mark">P</div>
              <span className="brand-name">PotzLuck</span>
            </div>
            <div className="topbar-right">
              <a className="btn ghost sm" href="#" onClick={(e)=>e.preventDefault()}>Explore Tezos X ↗</a>
            </div>
          </header>
          <main className="pl-landing">
            <h1 className="landing-h">
              Discover <span className="hl">Native Atomic Composability</span> on Tezos X
              <span className="landing-sub-h"> by playing PotzLuck.</span>
            </h1>
            <div className="landing-cta">
              <div className="cta-col">
                <div className="cta-eyebrow">Already know NAC on Tezos X?</div>
                <button className="btn primary lg" onClick={skipToGame}>Play Game</button>
              </div>
              <div className="cta-divider"><span>or</span></div>
              <div className="cta-col">
                <div className="cta-eyebrow">Learn about NAC on Tezos X before you play</div>
                <button className="btn ghost lg" onClick={startTour}>Take the Tour</button>
              </div>
            </div>
          </main>
          <Footer />
        </div>
      </>
    );
  }

  // Game view
  const potProgress = sessionActive ? timeLeft / SESSION_LEN : 0;
  let potLabel = 'Play', potSub = null, potStateClass = potState;
  if (potState === 'connect') { potLabel = 'Connect'; potSub = 'wallet to Play'; }
  else if (potState === 'wrong-net') { potLabel = 'Add Tezos X'; potSub = 'network'; }
  else if (potState === 'idle') { potLabel = 'Play'; potSub = 'start a new session'; }
  else if (potState === 'play') { potLabel = 'Play'; potSub = '1 USDC'; }
  else if (potState === 'depositing') { potLabel = '...'; potSub = 'depositing'; }
  else if (potState === 'won') { potLabel = 'Withdraw'; potSub = 'you won the pot'; }

  return (
    <>
      <div className="bg-grid"></div>
      <div className="bg-glow"></div>
      <div className="pl-shell">
        <TopBar wallet={wallet} onTakeTour={openTourFromGame} onConnect={handleConnect} onDisconnect={handleDisconnect} />

        <main className="pl-game">
          <GameStats pot={pot} lastPlayer={lastPlayer} endTime={endTimeStr} sessionActive={sessionActive} />

          <div className="pot-stage">
            <PotButton
              state={potState}
              label={potLabel}
              sublabel={potSub}
              progress={potState === 'play' || potState === 'depositing' ? potProgress : null}
              onClick={handlePotClick}
              disabled={potState === 'depositing'}
            />
            {wallet.connected && !wallet.onTezosX && (
              <NetworkHelp onAdd={handleAddNetwork} />
            )}
            {hasWon && potState === 'won' && (
              <div className="won-banner">No active game session. <b>You won the last session!</b> Click to withdraw your prize.</div>
            )}
            {!sessionActive && !hasWon && wallet.onTezosX && potState !== 'depositing' && (
              <div className="state-msg">No active game session. Click Play to start a new session</div>
            )}
            <EventLog entries={logs} />
          </div>

          <aside className="game-side">
            {hasWon && potState === 'won' && (
              <div className="side-note good">You won the last session. Click the pot to withdraw.</div>
            )}
          </aside>
        </main>

        <Footer />
      </div>

      <Tour
        open={tourOpen}
        stepIdx={tourStep}
        onNext={tourNext}
        onBack={tourBack}
        onClose={tourClose}
        onEndGoToGame={tourEnd}
      />

      <AirdropModal open={showAirdrop} onDismiss={() => setShowAirdrop(false)} />
    </>
  );
}

// Helper hook: format end time as wall clock
function useMemoEnd(timeLeft, active) {
  const [str, setStr] = React.useState('—');
  React.useEffect(() => {
    if (!active) { setStr('—'); return; }
    const d = new Date(Date.now() + timeLeft * 1000);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    setStr(`${h}:${m} ${Intl.DateTimeFormat().resolvedOptions().timeZone.includes('UTC') ? 'UTC' : 'local'}`);
  }, [timeLeft, active]);
  return str;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
