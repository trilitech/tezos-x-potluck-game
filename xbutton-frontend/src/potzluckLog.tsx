import type { ReactNode } from "react";

export function shortAddr(addr: string | null): string {
  if (!addr || addr.length < 12) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export type EventLogTone = "info" | "success" | "error";

export type EventLogEntry = {
  id: string;
  msg: string;
  tone: EventLogTone;
  txHash?: string;
  tezosOpsUrl?: string;
  relatedUrl?: string;
  relatedLabel?: string;
};

export function createEventLogEntryId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

const TX_LINK_PHRASES = [
  "game transaction",
  "session transaction",
  "deposit transaction",
  "approval transaction",
  "claim transaction",
  "escrow payout transaction",
  "payout transaction",
  "payout confirmed.",
  "confirmed.",
  "payout complete",
  "claim submitted",
  "session",
  "deposited",
  "deposit",
  "approval",
] as const;

const TEZOS_EXPLORER_PHRASES = [
  "Michelson-interface storage",
  "game pot",
] as const;

function messageWithExplorerTxInner(
  msg: string,
  txHash: string | undefined,
  evmTxUrl: (hash: string) => string,
): ReactNode {
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
          </a>
          {msg.slice(i + phrase.length)}
        </>
      );
    }
  }
  return (
    <>
      {msg}{" "}
      <a href={url} target="_blank" rel="noopener noreferrer" className="explorer-link">
        View on explorer
      </a>
    </>
  );
}

export function isPayoutSuccessLogMessage(msg: string): boolean {
  return /^Game #\d+: Payout confirmed\./.test(msg) || msg.startsWith("Game pot payout confirmed.");
}

export function messageWithExplorerTx(
  msg: string,
  txHash: string | undefined,
  evmTxUrl: (hash: string) => string,
  tezosOpsUrl?: string,
): ReactNode {
  if (txHash && isPayoutSuccessLogMessage(msg)) {
    return messageWithExplorerTxInner(msg, txHash, evmTxUrl);
  }
  if (tezosOpsUrl && msg) {
    for (const phrase of TEZOS_EXPLORER_PHRASES) {
      const ti = msg.toLowerCase().indexOf(phrase.toLowerCase());
      if (ti < 0) continue;
      const afterLinked = msg.slice(ti + phrase.length);
      return (
        <>
          {messageWithExplorerTxInner(msg.slice(0, ti), txHash, evmTxUrl)}
          <a href={tezosOpsUrl} target="_blank" rel="noopener noreferrer" className="explorer-link">
            {msg.slice(ti, ti + phrase.length)}
          </a>
          {messageWithExplorerTxInner(afterLinked, undefined, evmTxUrl)}
        </>
      );
    }
  }
  return messageWithExplorerTxInner(msg, txHash, evmTxUrl);
}
