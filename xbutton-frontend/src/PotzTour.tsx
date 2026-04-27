import { useEffect } from "react";

const TOUR_STEPS = [
  { id: "what" as const, label: "What is Tezos X?" },
  { id: "why" as const, label: "Why Tezos X?" },
  { id: "how" as const, label: "How the demo works" },
  { id: "playing" as const, label: "Playing the game" },
  { id: "behind" as const, label: "Behind the game" },
  { id: "oneness" as const, label: "EVM and Michelson as one" },
];

function Progress({ idx, total }: { idx: number; total: number }) {
  return (
    <div className="tour-progress">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={i < idx ? "done" : i === idx ? "active" : ""} />
      ))}
    </div>
  );
}

function StepWhat() {
  return (
    <>
      <p className="tour-sub">
        Tezos X lets your dApps run on <b>Etherlink</b> (EVM Interface) and <b>Tezlink</b> (Michelson Interface)
        seamlessly without your users having to switch network or context. This is achieved through{" "}
        <b>Native Atomic Composability</b>.
      </p>
      <div className="runtime-row">
        <div className="runtime-card">
          <div className="runtime-name">
            <span className="rt-dot evm" />
            Etherlink
          </div>
          <div className="runtime-sub">EVM Interface</div>
          <div className="runtime-desc">Solidity contracts, MetaMask, USDC.</div>
        </div>
        <div className="runtime-bridge">
          <span className="bridge-line" />
          <span className="bridge-label">NAC</span>
          <span className="bridge-line" />
        </div>
        <div className="runtime-card">
          <div className="runtime-name">
            <span className="rt-dot tez" />
            Tezlink
          </div>
          <div className="runtime-sub">Michelson Interface</div>
          <div className="runtime-desc">Game logic, state, settlement.</div>
        </div>
      </div>
    </>
  );
}

function StepWhy() {
  return (
    <>
      <p className="tour-sub">
        Tezos X allows you to tap into liquidity and new user pools on EVM and Michelson without rewriting your dApp
        for different networks. You&apos;ll benefit from ultra-low latency provided by Etherlink and Tezlink while
        still secured by Tezos L1
      </p>
    </>
  );
}

function StepHow() {
  return (
    <>
      <p className="tour-sub">
        In this pay to play game, you&apos;ll deposit USDC tokens into an escrow contract on the EVM side, interact
        with a game connected to an EVM contract, and this will instantly update the game state in Tezlink - where the
        game state is being stored.
      </p>
    </>
  );
}

function StepPlaying() {
  return (
    <>
      <p className="tour-sub">
        The game is simple. When you click &quot;Play&quot;, you deposit funds into the game&apos;s pot. The last
        player to deposit into the pot before the session ends, wins. That player can then claim all the tokens in the
        pot deposited by other players including their own deposit.
      </p>
    </>
  );
}

function StepBehind() {
  return (
    <>
      <p className="tour-sub">
        When you click the &quot;Play&quot; button, if there are no existing game sessions, a new game starts for a
        5min session. 1 USDC is deposited into the game escrow contract. Once your deposit is detected, a small
        relayer service calls the NAC gateway from the EVM side telling it your wallet address. The NAC gateway calls
        the game storage contract in Michelson to update the game state.
      </p>
    </>
  );
}

function StepOneness() {
  return (
    <>
      <p className="tour-sub">
        Connect any of your wallets on the EVM interface of Tezos X and on the Tezlink interface of Tezos X and your
        experience should be exactly the same. That&apos;s the power of Tezos X. Try it now in the game.
      </p>
    </>
  );
}

export type PotzTourProps = {
  open: boolean;
  stepIdx: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
  onEndGoToGame: () => void;
};

export function PotzTour({ open, stepIdx, onNext, onBack, onClose, onEndGoToGame }: PotzTourProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onBack();
      if (e.key === "Enter") onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onNext, onBack, onClose]);

  if (!open) return null;
  const step = TOUR_STEPS[stepIdx];
  const isLast = stepIdx === TOUR_STEPS.length - 1;
  const isFirst = stepIdx === 0;

  return (
    <div
      className="tour-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tour-card">
        <div className="tour-head">
          <div className="tour-step-pill">
            <span>
              Step <b>{stepIdx + 1}</b> of {TOUR_STEPS.length}
            </span>
            <span style={{ color: "var(--fg-4)" }}>·</span>
            <span style={{ color: "var(--fg-1)" }}>{step.label}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Progress idx={stepIdx} total={TOUR_STEPS.length} />
            <button type="button" className="tour-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="tour-body">
          {step.id === "what" ? <StepWhat /> : null}
          {step.id === "why" ? <StepWhy /> : null}
          {step.id === "how" ? <StepHow /> : null}
          {step.id === "playing" ? <StepPlaying /> : null}
          {step.id === "behind" ? <StepBehind /> : null}
          {step.id === "oneness" ? <StepOneness /> : null}
        </div>

        <div className="tour-foot">
          <button type="button" className="link-btn" onClick={onEndGoToGame}>
            End tour, go to game →
          </button>
          <div className="actions" style={{ display: "flex", gap: 8 }}>
            {!isFirst ? (
              <button type="button" className="btn ghost" onClick={onBack}>
                Back
              </button>
            ) : null}
            <button type="button" className="btn primary" onClick={isLast ? onEndGoToGame : onNext}>
              {isLast ? "Play Game" : "Next"}
              <span className="kbd">↵</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
