import { useEffect, type ReactNode } from "react";

declare global {
  interface Window {
    __potzTourGoToGame?: () => void;
  }
}

const TOUR_STEPS = [
  { id: "what" as const, label: "What is Tezos X?" },
  { id: "why" as const, label: "Why Tezos X?" },
  { id: "how" as const, label: "PotzLuck and Native Atomic Composability" },
  { id: "playing" as const, label: "How PotzLuck works" },
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

function TourIntro(props: { eyebrow?: string; title: string; body: ReactNode }) {
  return (
    <>
      {props.eyebrow ? <div className="tour-eyebrow">{props.eyebrow}</div> : null}
      <h2 className="tour-h">{props.title}</h2>
      <p className="tour-sub">{props.body}</p>
    </>
  );
}

function StepWhat() {
  return (
    <>
      <TourIntro
        title="One app. Two interfaces."
        body={
          <>
            Tezos X lets your dApps run on <b>Etherlink</b> (EVM Interface) and <b>Tezlink</b> (Michelson Interface)
            seamlessly without your users having to switch network or context. This is achieved through{" "}
            <b>Native Atomic Composability (NAC)</b>. The <b>NAC gateway</b> on the <b>EVM interface</b> is how calls
            reach Tezlink and update Michelson-interface storage while your users stay in an EVM-native flow.
          </>
        }
      />
      <div className="runtime-row runtime-row-bridge-layout">
        <div className="runtime-card">
          <div className="runtime-name runtime-name-etherlink">
            <img
              src="https://etherlink.com/logo-desktop.svg"
              alt="Etherlink"
              className="runtime-etherlink-logo"
            />
          </div>
          <div className="runtime-sub">EVM Interface</div>
        </div>
        <div className="runtime-bridge">
          <span className="bridge-line" />
          <span className="bridge-label nac-gateway-icon" aria-label="NAC Gateway">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <rect x="10" y="12" width="28" height="24" rx="6" />
              <rect x="17" y="19" width="14" height="10" rx="2" />
              <path d="M24 12v-4M16 12V8M32 12V8M24 40v-4M16 40v-4M32 40v-4M10 24H6M10 16H6M10 32H6M42 24h-4M42 16h-4M42 32h-4" />
            </svg>
            <span>NAC Gateway</span>
          </span>
          <span className="bridge-line" />
        </div>
        <div className="runtime-card">
          <div className="runtime-name">
            <span className="rt-dot tez" />
            Tezlink
          </div>
          <div className="runtime-sub">Michelson Interface</div>
        </div>
      </div>
    </>
  );
}

function StepWhy() {
  return (
    <>
      <TourIntro
        title="More users and liquidity without rewriting your app."
        body={
          <>
            Tezos X allows you to tap into liquidity and new user pools on EVM and Michelson without rewriting your
            dApp for different networks. You&apos;ll benefit from ultra-low latency provided by Etherlink and Tezlink
            while still secured by Tezos L1
          </>
        }
      />
      <div className="tour-points">
        <div className="tour-point">
          <span className="tour-point-k">Reach</span>
          <span className="tour-point-v">liquidity and new user pools on EVM and Michelson</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Keep</span>
          <span className="tour-point-v">the same dApp instead of rewriting for different networks</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Benefit</span>
          <span className="tour-point-v">from ultra-low latency while still secured by Tezos L1</span>
        </div>
      </div>
    </>
  );
}

function StepHow() {
  return (
    <>
      <TourIntro
        title="You play on EVM, while the game state lives on Tezlink."
        body={
          <>
            In this pay to play game, you&apos;ll deposit USDC tokens into an escrow contract on the EVM side,
            interact with a game connected to an EVM contract, and this will instantly update the game state in
            Tezlink.
          </>
        }
      />
      <div className="tour-points">
        <div className="tour-point">
          <span className="tour-point-k">Step 1</span>
          <span className="tour-point-v">Deposit USDC into the escrow contract on the EVM side</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Step 2</span>
          <span className="tour-point-v">Interact with the game through the connected EVM contract</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Step 3</span>
          <span className="tour-point-v">The game state is instantly updated in Tezlink</span>
        </div>
      </div>
    </>
  );
}

function StepPlaying() {
  return (
    <>
      <TourIntro
        title="Last deposit before the session ends wins."
        body={
          <>
            The game is simple. When you click <b>&quot;Play&quot;</b>, you deposit funds into the game&apos;s pot.
            The last player to deposit into the pot before the session ends, wins. That player can then claim all the
            tokens in the pot deposited by other players including their own deposit.
          </>
        }
      />
      <div className="tour-points">
        <div className="tour-point">
          <span className="tour-point-k">Networks</span>
          <span className="tour-point-v">
            Add the <b>Tezos X</b> test network to your <b>EVM wallet</b> (Etherlink) and, if you use a native Tezos
            wallet on Tezlink, add Tezos X there too—both need the chain to connect and play.
          </span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Play</span>
          <span className="tour-point-v">deposit funds into the game&apos;s pot</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Winner</span>
          <span className="tour-point-v">the last player to deposit before the session ends</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Claim</span>
          <span className="tour-point-v">all the tokens in the pot, including your own deposit</span>
        </div>
      </div>
    </>
  );
}

function StepBehind() {
  return (
    <>
      <TourIntro
        title="A relayer and the NAC gateway keep the state in sync."
        body={
          <>
            When you click the &quot;Play&quot; button, if there are no existing game sessions, a new game starts for
            a 5min session. 1 USDC is deposited into the game escrow contract. Once your deposit is detected, a small
            relayer service calls the NAC gateway from the EVM side telling it your wallet address. The NAC gateway
            calls the game storage contract in Michelson to update the game state.
          </>
        }
      />
      <div className="tour-points">
        <div className="tour-point">
          <span className="tour-point-k">No session?</span>
          <span className="tour-point-v">a new 5min game starts first</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Deposit</span>
          <span className="tour-point-v">1 USDC goes into the game escrow contract</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Sync</span>
          <span className="tour-point-v">the relayer calls the NAC gateway, which updates game state in Michelson</span>
        </div>
      </div>
    </>
  );
}

function StepOneness() {
  return (
    <>
      <TourIntro
        title="Same game experience across Tezos X interfaces."
        body={
          <>
            Connect with a wallet on either the EVM interface (Etherlink) or the Michelson interface (Tezlink)—your
            experience stays the same. That&apos;s the power of Tezos X.
            <br />
            <br />
            Use a <b>native Tezos wallet</b> and we&apos;ll create an <b>EVM alias</b> for you. You can use dApps on
            Etherlink without installing a separate EVM-only wallet.{" "}
            <button type="button" className="link-btn inline" onClick={window.__potzTourGoToGame}>
              Try it in the game →
            </button>
          </>
        }
      />
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

  useEffect(() => {
    window.__potzTourGoToGame = onEndGoToGame;
    return () => {
      delete window.__potzTourGoToGame;
    };
  }, [onEndGoToGame]);

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
              <button type="button" className="btn ghost tour-nav-btn" onClick={onBack}>
                Back
              </button>
            ) : null}
            <button type="button" className="btn primary tour-nav-btn" onClick={isLast ? onEndGoToGame : onNext}>
              {isLast ? "Play Game" : "Next"}
              <span className="kbd">↵</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
