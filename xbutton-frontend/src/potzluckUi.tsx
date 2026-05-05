import { useEffect, useId, useLayoutEffect, useRef, useState, type AnimationEvent } from "react";
import { messageWithExplorerTx, type EventLogEntry } from "./potzluckLog";

/** Small gold pot icon for the Pot(z)Luck topbar / brand mark. */
export function PotzLuckPotIcon() {
  const gid = useId().replace(/:/g, "");
  return (
    <svg className="potzluck-pot-icon" viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={`${gid}-body`} x1="5" y1="5" x2="19" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff6d4" />
          <stop offset="35%" stopColor="#f0cd56" />
          <stop offset="100%" stopColor="#a9720a" />
        </linearGradient>
        <linearGradient id={`${gid}-rim`} x1="5" y1="7" x2="19" y2="9" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff0b0" />
          <stop offset="100%" stopColor="#d9a41e" />
        </linearGradient>
        <linearGradient id={`${gid}-shine`} x1="8" y1="9" x2="11" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <ellipse cx="12" cy="7.75" rx="7.75" ry="2.35" fill={`url(#${gid}-rim)`} stroke="#8a6510" strokeWidth="0.35" />
      <path
        fill={`url(#${gid}-body)`}
        stroke="#7a5a0c"
        strokeWidth="0.4"
        strokeLinejoin="round"
        d="M4.35 8.35c-.15 5.2 2.35 10.2 7.65 11.15 5.3-.95 7.8-5.95 7.65-11.15l-1.35-.15H5.7l-1.35.15z"
      />
      <path
        fill={`url(#${gid}-shine)`}
        d="M6.2 9.5c.35 3.8 2.1 7.2 4.9 8.35.45-1.1.35-5.5-.35-8.35H6.2z"
        opacity="0.9"
      />
      <path
        fill="#fff8dc"
        stroke="#c9a227"
        strokeWidth="0.2"
        d="M12 2.6l.55 1.35h1.45l-1.15.85.45 1.45L12 5.5l-1.3.95.45-1.45-1.15-.85h1.45L12 2.6z"
      />
    </svg>
  );
}

type PotState = "connect" | "wrong-net" | "idle" | "play" | "depositing" | "won";

/** Full-screen-of-pot overlay: USDC coin drops into a pot, then the scene falls away. */
export function DepositPotCelebration({ onComplete }: { onComplete: () => void }) {
  const gid = useId().replace(/:/g, "");
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onComplete();
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      queueMicrotask(finish);
      return;
    }
    const t = window.setTimeout(finish, 2800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot safety timeout; onComplete is stable from parent
  }, []);

  const handleSceneAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.animationName === "depositPotSceneExit") {
      finish();
    }
  };

  return (
    <div className="deposit-pot-fx" aria-hidden>
      <div className="deposit-pot-fx__scene" onAnimationEnd={handleSceneAnimationEnd}>
        <div className="deposit-pot-fx__glow" />
        <svg className="deposit-pot-fx__pot" viewBox="0 0 64 56" aria-hidden>
          <defs>
            <linearGradient id={`${gid}-potfx`} x1="10" y1="6" x2="54" y2="52" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#fff6d4" />
              <stop offset="38%" stopColor="#f0cd56" />
              <stop offset="100%" stopColor="#8f6a12" />
            </linearGradient>
          </defs>
          <ellipse cx="32" cy="13" rx="23" ry="6.5" fill={`url(#${gid}-potfx)`} stroke="#6a4f0c" strokeWidth="0.45" />
          <path
            fill={`url(#${gid}-potfx)`}
            stroke="#5a4208"
            strokeWidth="0.5"
            strokeLinejoin="round"
            d="M9 14.5Q9 40 32 51Q55 40 55 14.5L52.5 14H11.5L9 14.5z"
          />
        </svg>
        <div className="deposit-pot-fx__coin" />
      </div>
    </div>
  );
}

/** Info control beside “Recent games”: explains winner-only claims (hover title + click popover for touch). */
export function RecentSessionsClaimInfo({ walletConnected }: { walletConnected: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const hoverTitle = walletConnected
    ? "Only the wallet shown as Winner can claim that game."
    : "Connect your wallet on Tezos X. Only the winner can claim.";

  const body = walletConnected
    ? "Only the wallet listed as Winner for a game can claim that game. If your connected wallet is not the winner, you will not see the claim button."
    : "Connect your wallet on Tezos X first. The claim button only appears when the connected wallet matches the winner.";

  return (
    <div className="recent-sessions-info-wrap" ref={wrapRef}>
      <button
        type="button"
        className="recent-sessions-info-btn"
        aria-label="How claiming works"
        title={hoverTitle}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg className="recent-sessions-info-icon" viewBox="0 0 24 24" aria-hidden>
        <path
            fill="currentColor"
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
          />
        </svg>
      </button>
      {open ? (
        <div className="recent-sessions-info-popover" role="tooltip">
          {body}
        </div>
      ) : null}
    </div>
  );
}

export function PotButton(props: {
  state: PotState;
  label: string;
  sublabel: string | null;
  progress: number | null;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { state, label, sublabel, progress, onClick, disabled } = props;
  const r = 140;
  const c = 2 * Math.PI * r;
  const offset = progress != null ? c * (1 - progress) : c;

  return (
    <button
      type="button"
      className={`pot-btn pot-${state}`}
      onClick={onClick}
      disabled={disabled}
    >
      <svg className="pot-svg" viewBox="0 0 320 320" aria-hidden>
        <circle
          cx="160"
          cy="160"
          r={r}
          fill="none"
          stroke={state === "play" || state === "depositing" ? "var(--ring-base)" : "var(--green)"}
          strokeWidth="2.5"
          strokeOpacity={state === "play" || state === "depositing" ? 1 : 0.85}
        />
        {progress != null ? (
          <circle
            cx="160"
            cy="160"
            r={r}
            fill="none"
            stroke="var(--ring-active)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform="rotate(-90 160 160)"
            style={{
              transition: "stroke-dashoffset 1s linear",
              filter: "drop-shadow(0 0 14px rgba(179,159,251,0.55))",
            }}
          />
        ) : null}
        <circle
          cx="160"
          cy="160"
          r={r + 18}
          fill="none"
          stroke="var(--ring-pulse)"
          strokeWidth="1.5"
          className="pot-pulse"
        />
      </svg>
      <span className="pot-content">
        <span className="pot-label">{label}</span>
        {sublabel ? <span className="pot-sublabel">{sublabel}</span> : null}
      </span>
    </button>
  );
}

export function EventLogStrip(props: { entries: EventLogEntry[]; evmTxUrl: (hash: string) => string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastId = props.entries.length ? props.entries[props.entries.length - 1].id : "";

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [props.entries.length, lastId]);

  const shown = props.entries;
  return (
    <div className="event-log-strip" ref={scrollRef}>
      {shown.length === 0 ? (
        <div className="el-empty">[EVENT LOG] waiting for activity…</div>
      ) : (
        shown.map((e, i) => {
          const ageFromBottom = shown.length - 1 - i;
          const cls = ageFromBottom === 0 ? "fresh" : ageFromBottom === 1 ? "recent" : "older";
          return (
            <div key={e.id} className={`el-line ${cls} el-${e.tone}`}>
              <span className="el-tag">[EVENT LOG]</span>
              <span className="el-msg">
                {messageWithExplorerTx(e.msg, e.txHash, props.evmTxUrl, e.tezosOpsUrl)}
                {e.relatedUrl ? (
                  <>
                    {" "}
                    <a
                      href={e.relatedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="explorer-link"
                    >
                      {e.relatedLabel ?? "Escrow contract ↗"}
                    </a>
                  </>
                ) : null}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

export function PotFooter(props: {
  faucetUrl: string;
  docsUrl: string;
  tezlinkUrl: string;
  onOpenNetworkInfo: () => void;
}) {
  const { faucetUrl, docsUrl, tezlinkUrl, onOpenNetworkInfo } = props;
  return (
    <footer className="pl-footer">
      <div className="foot-left">
        <a href="https://x.com/tezos" target="_blank" rel="noopener noreferrer">
          Twitter
        </a>
        <a href="https://discord.gg/tezos" target="_blank" rel="noopener noreferrer">
          Discord
        </a>
      </div>
      <div className="foot-right">
        <a href={tezlinkUrl} target="_blank" rel="noopener noreferrer">
          Michelson explorer
        </a>
        <a href={docsUrl} target="_blank" rel="noopener noreferrer">
          Docs
        </a>
        <button type="button" className="footer-link-btn" onClick={onOpenNetworkInfo}>
          Network information
        </button>
        <a href={faucetUrl} target="_blank" rel="noopener noreferrer">
          Faucet
        </a>
      </div>
    </footer>
  );
}

export function NetworkHelpPotz(props: { onAdd: () => void; evmNetworkDisplayName: string }) {
  return (
    <div className="net-help">
      You&apos;re not on {props.evmNetworkDisplayName}.{" "}
      <button type="button" className="link-btn inline" onClick={props.onAdd}>
        Add it to your wallet
      </button>{" "}
      to play.
    </div>
  );
}
