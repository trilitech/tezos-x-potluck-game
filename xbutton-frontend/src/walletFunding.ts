export type WalletState = {
  address: string | null;
  chainId: bigint | null;
  usdcBalance: string | null;
  usdcAllowance: bigint | null;
  usdcBalanceRaw: bigint | null;
  xtzBalanceRaw: bigint | null;
};

/** Successful POST /api/airdrop JSON (used for accurate event-log copy vs client assumptions). */
export type AirdropApiSuccess = {
  ok?: boolean;
  transfers?: Array<{ asset: string; amount: string; symbol: string }>;
  message?: string;
};

export function formatAirdropSuccessLog(
  parsed: AirdropApiSuccess,
  networkLabel: string,
  configured: { usdcAmount: string; xtzAmount: string },
): string | null {
  const transfers = parsed.transfers;
  if (!transfers?.length) return null;
  const parts = transfers.map((r) => {
    if (r.symbol === "USDC") return `${configured.usdcAmount} USDC`;
    if (r.symbol === "XTZ") return `${configured.xtzAmount} XTZ`;
    return `${r.amount} ${r.symbol}`;
  });
  return `${networkLabel} airdrop complete: ${parts.join(" and ")} sent to your wallet.`;
}

type PlayFundsConfig = {
  chainId: bigint;
  pressAmount: string;
  pressAmountUnits: bigint;
  airdropApiUrl: string;
  airdropUsdcAmount: string;
  airdropXtzAmount: string;
  relayerRdns: string;
  relayerWalletKeyPrefix: string;
  relayerXtzAirdropKeyPrefix: string;
};

export function createWalletFundingHelpers(config: PlayFundsConfig) {
  function relayerWalletStorageKey(prefix: string, chainIdLike: bigint | null, address: string | null): string | null {
    if (!chainIdLike || !address) return null;
    return `${prefix}:${chainIdLike.toString()}:${address.toLowerCase()}`;
  }

  function readLocalFlag(key: string | null): boolean {
    if (!key || typeof window === "undefined") return false;
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  function writeLocalFlag(key: string | null, value: boolean) {
    if (!key || typeof window === "undefined") return;
    try {
      if (value) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  function isTezosRelayerProviderLike(
    provider: unknown,
    rdns: string | null | undefined,
  ): boolean {
    const maybe = provider as { isTezosXRelayer?: boolean } | null | undefined;
    return Boolean(maybe?.isTezosXRelayer) || rdns === config.relayerRdns;
  }

  function isRelayerWalletLocallyMarked(wallet: WalletState): boolean {
    return readLocalFlag(
      relayerWalletStorageKey(config.relayerWalletKeyPrefix, wallet.chainId, wallet.address),
    );
  }

  function hasRelayerXtzAirdropFlag(wallet: WalletState): boolean {
    return readLocalFlag(
      relayerWalletStorageKey(config.relayerXtzAirdropKeyPrefix, wallet.chainId, wallet.address),
    );
  }

  function markRelayerWallet(address: string | null, chainIdLike: bigint | null) {
    writeLocalFlag(relayerWalletStorageKey(config.relayerWalletKeyPrefix, chainIdLike, address), true);
  }

  function markRelayerXtzAirdropped(address: string | null, chainIdLike: bigint | null) {
    writeLocalFlag(
      relayerWalletStorageKey(config.relayerXtzAirdropKeyPrefix, chainIdLike, address),
      true,
    );
  }

  function getInsufficientPlayFundsEventLogMessage(w: WalletState): string | null {
    if (!w.address || w.chainId !== config.chainId) return null;
    if (w.usdcBalanceRaw == null || w.xtzBalanceRaw == null) return null;
    const shortOnUsdc = w.usdcBalanceRaw < config.pressAmountUnits;
    const shortOnXtz = w.xtzBalanceRaw === 0n && !isRelayerWalletLocallyMarked(w);
    if (!shortOnUsdc && !shortOnXtz) return null;
    if (shortOnUsdc && shortOnXtz) {
      return `You don't have enough USDC or XTZ to play. You need at least ${config.pressAmount} USDC and a little XTZ for gas on this network.`;
    }
    if (shortOnUsdc) {
      return `You don't have enough USDC to play — you need at least ${config.pressAmount} USDC for each deposit.`;
    }
    return "You don't have enough XTZ for gas. Add a little native XTZ on this network so you can sign transactions, then try Play again.";
  }

  function airdropDeliveredLogMessage(usdc: boolean, xtz: boolean, networkLabel: string): string {
    if (usdc && xtz) {
      return `${networkLabel} airdrop complete: ${config.airdropUsdcAmount} USDC and ${config.airdropXtzAmount} XTZ sent to your wallet.`;
    }
    if (usdc) return `${networkLabel} airdrop complete: ${config.airdropUsdcAmount} USDC sent to your wallet.`;
    return `${networkLabel} airdrop complete: ${config.airdropXtzAmount} XTZ sent to your wallet.`;
  }

  function formatAirdropError(error: unknown, networkLabel: string): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("AIRDROP_FAILED:")) {
      return message.replace("AIRDROP_FAILED:", "").trim() || "Airdrop failed.";
    }
    return `We couldn't send ${networkLabel} funds right now. Please try again in a moment.`;
  }

  async function requestAirdrop(
    address: string,
    opts: { usdc: boolean; xtz: boolean },
  ): Promise<AirdropApiSuccess> {
    if (!config.airdropApiUrl) {
      throw new Error("AIRDROP_NOT_CONFIGURED");
    }

    const response = await fetch(config.airdropApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        walletAddress: address,
        usdc: opts.usdc,
        xtz: opts.xtz,
        usdcAmount: opts.usdc ? config.airdropUsdcAmount : undefined,
        xtzAmount: opts.xtz ? config.airdropXtzAmount : undefined,
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        /* ignore */
      }
      throw new Error(detail.trim() ? `AIRDROP_FAILED:${detail.trim()}` : `AIRDROP_FAILED:${response.status}`);
    }

    return (await response.json()) as AirdropApiSuccess;
  }

  async function refreshWalletUntilPlayBalancesVisible(
    willAirdrop: boolean,
    refresh: () => Promise<WalletState>,
  ): Promise<WalletState> {
    let w = await refresh();
    if (!willAirdrop) {
      return w;
    }
    for (let i = 0; i < 15; i++) {
      if (!getInsufficientPlayFundsEventLogMessage(w)) {
        return w;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      w = await refresh();
    }
    return w;
  }

  return {
    airdropDeliveredLogMessage,
    formatAirdropError,
    getInsufficientPlayFundsEventLogMessage,
    hasRelayerXtzAirdropFlag,
    isRelayerWalletLocallyMarked,
    isTezosRelayerProviderLike,
    markRelayerWallet,
    markRelayerXtzAirdropped,
    refreshWalletUntilPlayBalancesVisible,
    requestAirdrop,
  };
}
