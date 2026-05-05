export type GameState = {
  currentSessionId: string;
  lastPlayerTezos: string | null;
  lastPlayerAddress: string | null;
  potRaw: string;
  potDisplay: string;
  sessionEnd: number;
  claimed: boolean;
  pendingSessions: Array<{
    sessionId: string;
    winnerTezos: string | null;
    winnerAddress: string | null;
    potRaw: string;
    potDisplay: string;
    sessionEnd: number;
    claimRequested: boolean;
  }>;
  fetchedAt: number;
};

export type ClaimTargetSession = {
  sessionId: string;
  source: "current" | "pending";
  winnerAddress: string | null;
};

export function addressesEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function michelsonPotHasFunds(potRaw: string | undefined | null): boolean {
  if (potRaw == null) return false;
  try {
    return BigInt(potRaw) > 0n;
  } catch {
    return false;
  }
}

export function potInfoForClaimTarget(
  gameState: GameState | null,
  target: ClaimTargetSession,
): { potDisplay: string; potRaw: string } | null {
  if (!gameState) return null;
  if (target.source === "pending") {
    const row = gameState.pendingSessions.find((s) => s.sessionId === target.sessionId);
    return row ? { potDisplay: row.potDisplay, potRaw: row.potRaw } : null;
  }
  return { potDisplay: gameState.potDisplay, potRaw: gameState.potRaw };
}

export function getClaimTargetSession(
  gameState: GameState | null,
  walletAddress: string | null,
  nowSeconds: number,
): ClaimTargetSession | null {
  if (!gameState || !walletAddress) return null;

  if (
    gameState.sessionEnd <= nowSeconds &&
    !gameState.claimed &&
    addressesEqual(gameState.lastPlayerAddress, walletAddress) &&
    michelsonPotHasFunds(gameState.potRaw)
  ) {
    return {
      sessionId: gameState.currentSessionId,
      source: "current",
      winnerAddress: gameState.lastPlayerAddress,
    };
  }

  const pending = gameState.pendingSessions.find(
    (session) =>
      !session.claimRequested &&
      addressesEqual(session.winnerAddress, walletAddress) &&
      michelsonPotHasFunds(session.potRaw),
  );
  if (!pending) return null;
  return {
    sessionId: pending.sessionId,
    source: "pending",
    winnerAddress: pending.winnerAddress,
  };
}

export function getPendingClaimRequestedSession(
  gameState: GameState | null,
  walletAddress: string | null,
): ClaimTargetSession | null {
  if (!gameState || !walletAddress) return null;
  const pending = gameState.pendingSessions.find(
    (session) => session.claimRequested && addressesEqual(session.winnerAddress, walletAddress),
  );
  if (!pending) return null;
  return {
    sessionId: pending.sessionId,
    source: "pending",
    winnerAddress: pending.winnerAddress,
  };
}

export function hasCurrentClaimInFlight(
  gameState: GameState | null,
  walletAddress: string | null,
  nowSeconds: number,
): boolean {
  return Boolean(
    gameState &&
      walletAddress &&
      gameState.sessionEnd <= nowSeconds &&
      gameState.claimed &&
      addressesEqual(gameState.lastPlayerAddress, walletAddress),
  );
}

export function getDuplicateClaimTargetForWalletSession(
  gameState: GameState | null,
  walletAddress: string | null,
  sessionId: string,
  nowSeconds: number,
): ClaimTargetSession | null {
  if (!gameState || !walletAddress) return null;

  const pending = gameState.pendingSessions.find(
    (s) =>
      s.sessionId === sessionId &&
      s.claimRequested &&
      addressesEqual(s.winnerAddress, walletAddress),
  );
  if (pending) {
    return { sessionId, source: "pending", winnerAddress: pending.winnerAddress };
  }

  if (
    gameState.currentSessionId === sessionId &&
    gameState.sessionEnd <= nowSeconds &&
    gameState.claimed &&
    addressesEqual(gameState.lastPlayerAddress, walletAddress)
  ) {
    return { sessionId, source: "current", winnerAddress: gameState.lastPlayerAddress };
  }

  return null;
}

export function isClaimSettled(nextState: GameState, target: ClaimTargetSession): boolean {
  const stillPending = nextState.pendingSessions.some((session) => session.sessionId === target.sessionId);
  if (target.source === "pending") {
    return !stillPending;
  }

  if (nextState.currentSessionId === target.sessionId) {
    return !nextState.claimed && BigInt(nextState.potRaw) === 0n && nextState.lastPlayerAddress == null;
  }

  return !stillPending;
}

export function compareSessionIdsDesc(left: { sessionId: string }, right: { sessionId: string }): number {
  const delta = BigInt(right.sessionId) - BigInt(left.sessionId);
  if (delta > 0n) return 1;
  if (delta < 0n) return -1;
  return 0;
}

export function formatClockDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function formatEndedAgo(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "—";
  }
  if (totalSeconds < 60) {
    return `Ended ${totalSeconds}s ago`;
  }
  if (totalSeconds < 3600) {
    return `Ended ${Math.floor(totalSeconds / 60)}m ago`;
  }
  if (totalSeconds < 86400) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return m > 0 ? `Ended ${h}h ${m}m ago` : `Ended ${h}h ago`;
  }
  const days = Math.floor(totalSeconds / 86400);
  if (totalSeconds < 86400 * 7) {
    const h = Math.floor((totalSeconds % 86400) / 3600);
    return h > 0 ? `Ended ${days}d ${h}h ago` : `Ended ${days}d ago`;
  }
  if (days < 30) {
    return `Ended ${days}d ago`;
  }
  if (totalSeconds < 86400 * 365 * 5) {
    return `Ended ${Math.max(1, Math.floor(totalSeconds / (86400 * 7)))}w+ ago`;
  }
  return "Ended a long time ago";
}
