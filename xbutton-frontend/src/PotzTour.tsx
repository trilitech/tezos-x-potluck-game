import { useEffect, type ReactNode } from "react";

declare global {
  interface Window {
    __potzTourGoToGame?: () => void;
  }
}

const TOUR_STEPS = [
  { id: "what" as const, label: "What is Tezos X?" },
  { id: "why" as const, label: "Why Tezos X?" },
  { id: "how" as const, label: "Gameplay and Native Atomic Composability (NAC)" },
  { id: "playing" as const, label: "How to win" },
  { id: "behind" as const, label: "Behind the game" },
  { id: "oneness" as const, label: "EVM and Michelson as one" },
];

const TOUR_TLDR_LABEL = "TL;DR" as const;

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
            Tezos X lets your dApps run on Etherlink (EVM Interface) and the Michelson-interface seamlessly
            without your users having to switch network or context. This is achieved through{" "}
            <span className="tour-em">Native Atomic Composability (NAC)</span>. The{" "}
            <span className="tour-em">NAC gateway</span> on the EVM interface is how calls reach the Michelson-interface and update
            Michelson-interface storage while your users stay in an EVM-native flow.
          </>
        }
      />
      <div className="runtime-row runtime-row-bridge-layout">
        <div className="runtime-card">
          <div className="runtime-sub">EVM Interface</div>
          <div className="runtime-name runtime-name-etherlink">
            <img
              src="https://etherlink.com/logo-desktop.svg"
              alt="Etherlink"
              className="runtime-etherlink-logo"
            />
          </div>
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
          <div className="runtime-sub">Michelson Interface</div>
          <div className="runtime-name">
            <span className="rt-dot tez" />
            Michelson-interface
          </div>
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
            dApp for different networks. You&apos;ll benefit from ultra-low latency provided by the EVM interface and the
            Michelson-interface while still secured by Tezos L1
          </>
        }
      />
    </>
  );
}

function StepHow() {
  return (
    <>
      <TourIntro
        title="You play on EVM, while the game state lives on the Michelson-interface."
        body={
          <>
            In this pay to play game, you&apos;ll deposit USDC tokens into an escrow contract (game pot) on the EVM side.
            The deposit triggers an update of the game state on the Michelson interface via the{" "}
            <span className="tour-em">NAC gateway</span> on the EVM side.
          </>
        }
      />
      <div className="tour-summary-label">{TOUR_TLDR_LABEL}</div>
      <div className="tour-points">
        <div className="tour-point">
          <span className="tour-point-k">Step 1</span>
          <span className="tour-point-v">Deposit USDC into the escrow contract (game pot) on the EVM side</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Step 2</span>
          <span className="tour-point-v">
            Once a deposit is detected, the game state is updated on the Michelson interface via a call to the NAC Gateway
            on the EVM side.
          </span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Step 3</span>
          <span className="tour-point-v">Winning claims are validated from the Michelson-interface while payout happens on EVM</span>
        </div>
      </div>
    </>
  );
}

function StepPlaying() {
  return (
    <>
      <TourIntro
        title="Last deposit before the game ends wins."
        body={
          <>
            The game is simple. When you click <span className="tour-em">&quot;Play&quot;</span>, you deposit funds into
            the game&apos;s pot.
            The last player to deposit into the pot before the game ends, wins. That player can then claim all the
            tokens in the pot deposited by other players including their own deposit. If a new round starts before the
            winner claims, that finished game still stays claimable until payout is completed.
          </>
        }
      />
      <div className="tour-summary-label">{TOUR_TLDR_LABEL}</div>
      <div className="tour-points">
        <div className="tour-point">
          <span className="tour-point-k">Play</span>
          <span className="tour-point-v">Deposit funds into the game&apos;s pot</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Winner</span>
          <span className="tour-point-v">The last player to deposit before the game ends wins</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Claim</span>
          <span className="tour-point-v">Winner of the game can claim all the USDC in the pot/escrow.</span>
        </div>
      </div>
    </>
  );
}

function StepBehind() {
  return (
    <>
      <TourIntro
        title="The NAC Gateway keeps Michelson Game state in sync"
        body={
          <>
            When you click the &quot;Play&quot; button, if there are no existing games in progress, a new game starts for
            a 5-minute round. 1 USDC is deposited into the game escrow contract. Once your deposit is detected, a small
            relayer service calls the <span className="tour-em">NAC gateway</span> from the EVM side telling it your
            wallet address. The NAC gateway calls the game storage contract in Michelson to update the game state.
            Later, when the winner claims, that same cross-runtime flow is used again to validate the claim and
            complete the payout.
          </>
        }
      />
      <div className="tour-summary-label">{TOUR_TLDR_LABEL}</div>
      <div className="tour-points">
        <div className="tour-point">
          <span className="tour-point-k">Click Play</span>
          <span className="tour-point-v">A new 5min game starts first</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Deposit</span>
          <span className="tour-point-v">1 USDC goes into the game escrow contract</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Sync</span>
          <span className="tour-point-v">The relayer calls the NAC gateway, which updates game state in Michelson</span>
        </div>
        <div className="tour-point">
          <span className="tour-point-k">Claim</span>
          <span className="tour-point-v">The Michelson-interface validates the winning game, then the payout is sent on EVM</span>
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
            Connect with a wallet on either the EVM interface or the Michelson-interface of Tezos X and your experience
            stays the same.
            <br />
            <br />
            Behind the scenes, Tezos X provides an EVM alias (0x) for your Tezos (tz) address allowing you to interact
            with the EVM interface as you would with a native EVM wallet. You can use dApps on the EVM interface and
            vice versa without installing a separate EVM-only wallet.{" "}
            <button type="button" className="link-btn inline" onClick={window.__potzTourGoToGame}>
              Start Playing →
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
            <span style={{ color: "var(--fg-2)" }}>{step.label}</span>
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
