/* eslint-disable react-refresh/only-export-components */
import { Fragment, useId, useLayoutEffect, useRef, type ReactNode } from "react";

export function shortAddr(addr: string | null): string {
  if (!addr || addr.length < 12) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function NacCounterBrandIcon() {
  const gid = useId().replace(/:/g, "");
  return (
    <svg className="nac-counter-brand-icon" viewBox="0 0 24 24" aria-hidden>
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

export type EventLogTone = "info" | "success" | "error";
export type EventLogPhraseLink = { phrase: string; href: string };
export type EventLogEntry = {
  id: string;
  msg: string;
  tone: EventLogTone;
  txHash?: string;
  tezosOpsUrl?: string;
  phraseLinks?: EventLogPhraseLink[];
};

export function createEventLogEntryId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

const TX_LINK_PHRASES = [
  "increment succeeded",
  "decrement succeeded",
  "reset succeeded",
  "evm transaction submitted",
  "transaction submitted",
] as const;

const TEZOS_EXPLORER_PHRASES = ["Michelson-interface storage", "Michelson storage"] as const;

function splitByPhraseLinks(
  msg: string,
  links: EventLogPhraseLink[],
): Array<{ kind: "text"; text: string } | { kind: "link"; text: string; href: string }> {
  if (!links.length) return [{ kind: "text", text: msg }];
  const sorted = [...links].sort((a, b) => b.phrase.length - a.phrase.length);
  const out: Array<{ kind: "text"; text: string } | { kind: "link"; text: string; href: string }> = [];
  let rest = msg;
  while (rest.length) {
    let bestIdx = -1;
    let bestMatch: EventLogPhraseLink | null = null;
    for (const l of sorted) {
      const idx = rest.toLowerCase().indexOf(l.phrase.toLowerCase());
      if (idx < 0) continue;
      const better =
        bestIdx < 0 ||
        idx < bestIdx ||
        (idx === bestIdx && l.phrase.length > (bestMatch?.phrase.length ?? 0));
      if (better) {
        bestIdx = idx;
        bestMatch = l;
      }
    }
    if (bestIdx < 0 || !bestMatch) {
      out.push({ kind: "text", text: rest });
      break;
    }
    if (bestIdx > 0) out.push({ kind: "text", text: rest.slice(0, bestIdx) });
    const plen = bestMatch.phrase.length;
    out.push({ kind: "link", text: rest.slice(bestIdx, bestIdx + plen), href: bestMatch.href });
    rest = rest.slice(bestIdx + plen);
  }
  return out;
}

function messageWithExplorerTxInner(
  msg: string,
  txHash: string | undefined,
  evmTxUrl: (hash: string) => string,
  options?: { allowOrphanTxLink?: boolean },
): ReactNode {
  const allowOrphanTxLink = options?.allowOrphanTxLink !== false;
  if (!txHash) return msg;
  const url = evmTxUrl(txHash);
  const lower = msg.toLowerCase();
  for (const phrase of TX_LINK_PHRASES) {
    const i = lower.indexOf(phrase);
    if (i >= 0) {
      const linked = msg.slice(i, i + phrase.length);
      return (
        <>
          {msg.slice(0, i)}
          <a href={url} target="_blank" rel="noopener noreferrer" className="explorer-link">
            {linked}
            {" ↗"}
          </a>
          {msg.slice(i + phrase.length)}
        </>
      );
    }
  }
  if (!allowOrphanTxLink) return msg;
  return (
    <>
      {msg}{" "}
      <a href={url} target="_blank" rel="noopener noreferrer" className="explorer-link">
        View on Blockscout ↗
      </a>
    </>
  );
}

function messageWithExplorerTxFragment(
  msg: string,
  txHash: string | undefined,
  evmTxUrl: (hash: string) => string,
  tezosExplorerUrl?: string,
): ReactNode {
  if (tezosExplorerUrl && msg) {
    for (const phrase of TEZOS_EXPLORER_PHRASES) {
      const ti = msg.toLowerCase().indexOf(phrase.toLowerCase());
      if (ti < 0) continue;
      const matched = msg.slice(ti, ti + phrase.length);
      const afterLinked = msg.slice(ti + phrase.length);
      return (
        <>
          {messageWithExplorerTxInner(msg.slice(0, ti), txHash, evmTxUrl, { allowOrphanTxLink: false })}
          <a href={tezosExplorerUrl} target="_blank" rel="noopener noreferrer" className="explorer-link explorer-link--michelson">
            {matched}
            {" ↗"}
          </a>
          {messageWithExplorerTxInner(afterLinked, undefined, evmTxUrl, { allowOrphanTxLink: false })}
        </>
      );
    }
  }
  return messageWithExplorerTxInner(msg, txHash, evmTxUrl);
}

export function messageWithExplorerTx(
  msg: string,
  txHash: string | undefined,
  evmTxUrl: (hash: string) => string,
  tezosExplorerUrl?: string,
  phraseLinks?: EventLogPhraseLink[],
): ReactNode {
  if (phraseLinks?.length) {
    const segments = splitByPhraseLinks(msg, phraseLinks);
    return (
      <>
        {segments.map((seg, i) =>
          seg.kind === "link" ? (
            <a
              key={`pl-${i}-${seg.href}`}
              href={seg.href}
              target="_blank"
              rel="noopener noreferrer"
              className="explorer-link"
            >
              {seg.text}
              {" ↗"}
            </a>
          ) : (
            <Fragment key={`pt-${i}`}>
              {messageWithExplorerTxFragment(seg.text, txHash, evmTxUrl, tezosExplorerUrl)}
            </Fragment>
          ),
        )}
      </>
    );
  }
  return messageWithExplorerTxFragment(msg, txHash, evmTxUrl, tezosExplorerUrl);
}

type RoundActionState = "connect" | "wrong-net" | "idle" | "play" | "depositing";

export function RoundActionButton(props: {
  state: RoundActionState;
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

export function SatelliteRoundButton(props: { label: string; onClick: () => void; disabled?: boolean }) {
  const { label, onClick, disabled } = props;
  const r = 78;
  const cx = 160;
  const cy = 160;

  return (
    <button
      type="button"
      className="pot-btn pot-play pot-btn--satellite"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <svg className="pot-svg" viewBox="0 0 320 320" aria-hidden>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--ring-base)"
          strokeWidth="2.25"
          strokeOpacity={1}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r + 14}
          fill="none"
          stroke="var(--ring-pulse)"
          strokeWidth="1.35"
          className="pot-pulse"
        />
      </svg>
      <span className="pot-content pot-content--satellite">
        <span className="pot-label pot-label--satellite">{label}</span>
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
                {messageWithExplorerTx(e.msg, e.txHash, props.evmTxUrl, e.tezosOpsUrl, e.phraseLinks)}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

export function ShellFooter(props: {
  hubUrl: string;
  faucetUrl: string;
  bridgeUrl?: string;
  evmExplorerUrl: string;
  michelsonExplorerUrl: string;
  docsUrl: string;
  onOpenNetworkInfo: () => void;
}) {
  const { hubUrl, faucetUrl, bridgeUrl, evmExplorerUrl, michelsonExplorerUrl, docsUrl, onOpenNetworkInfo } = props;
  return (
    <footer className="pl-footer">
      <div className="foot-left">
        <a href="https://x.com/tezos" target="_blank" rel="noopener noreferrer">
          Twitter
        </a>
        <a href="https://discord.gg/tezos" target="_blank" rel="noopener noreferrer">
          Tezos X Discord
        </a>
      </div>
      <div className="foot-right">
        <a href={hubUrl} target="_blank" rel="noopener noreferrer">
          Tezos X hub
        </a>
        {bridgeUrl ? (
          <a href={bridgeUrl} target="_blank" rel="noopener noreferrer">
            Bridge
          </a>
        ) : null}
        <a href={faucetUrl} target="_blank" rel="noopener noreferrer">
          Faucet
        </a>
        <a href={evmExplorerUrl} target="_blank" rel="noopener noreferrer">
          Blockscout (EVM)
        </a>
        <a href={michelsonExplorerUrl} target="_blank" rel="noopener noreferrer">
          TzKT (Michelson)
        </a>
        <a href={docsUrl} target="_blank" rel="noopener noreferrer">
          Developer docs
        </a>
        <button type="button" className="footer-link-btn" onClick={onOpenNetworkInfo}>
          Network details
        </button>
      </div>
    </footer>
  );
}

export function WrongChainHelp(props: { onAdd: () => void; evmNetworkDisplayName: string }) {
  return (
    <div className="net-help">
      You&apos;re not on {props.evmNetworkDisplayName}.{" "}
      <button type="button" className="link-btn inline" onClick={props.onAdd}>
        Add it to your wallet
      </button>{" "}
      to continue.
    </div>
  );
}
