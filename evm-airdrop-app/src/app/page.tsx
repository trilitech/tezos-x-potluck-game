"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./page.module.css";

type AirdropAsset = "usdc" | "xtz";
type ThemeMode = "light" | "dark";

type ClaimResult = {
  ok: boolean;
  message: string;
  txHash?: string;
  amount?: string;
  explorerUrl?: string | null;
};

const networkName =
  process.env.NEXT_PUBLIC_NETWORK_NAME ?? "Tezos X EVM Faucet";
const networkSubtitle =
  process.env.NEXT_PUBLIC_NETWORK_SUBTITLE ?? "Tezos X Testnet Faucet";
const rpcEndpoint =
  process.env.NEXT_PUBLIC_EVM_RPC ?? "https://demo.txpark.nomadic-labs.com/rpc";
const usdcSymbol = process.env.NEXT_PUBLIC_AIRDROP_TOKEN_SYMBOL ?? "USDC";
const usdcAmount = process.env.NEXT_PUBLIC_AIRDROP_AMOUNT ?? "10";
const nativeSymbol = process.env.NEXT_PUBLIC_NATIVE_AIRDROP_SYMBOL ?? "XTZ";
const nativeAmount = process.env.NEXT_PUBLIC_NATIVE_AIRDROP_AMOUNT ?? "5";
const assetOptions: Record<
  AirdropAsset,
  { label: string; amount: string; description: string }
> = {
  usdc: {
    label: usdcSymbol,
    amount: usdcAmount,
    description: `Sends ${usdcAmount} ${usdcSymbol} from the faucet to your wallet.`,
  },
  xtz: {
    label: nativeSymbol,
    amount: nativeAmount,
    description: `Sends ${nativeAmount} ${nativeSymbol} from the faucet to your wallet.`,
  },
};

export default function Home() {
  const [walletAddress, setWalletAddress] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<AirdropAsset>("usdc");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeAsset = assetOptions[selectedAsset];

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("tezosx-evm-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      return;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem("tezosx-evm-theme", nextTheme);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/airdrop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ walletAddress, asset: selectedAsset }),
      });

      const data = (await response.json()) as ClaimResult;
      setResult(data);
    } catch {
      setResult({
        ok: false,
        message: "The request failed before the server could respond.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={`${styles.page} ${theme === "dark" ? styles.darkTheme : ""}`}>
      <main className={styles.panel}>
        <header className={styles.hero}>
          <div className={styles.heroTopRow}>
            <button className={styles.themeToggle} type="button" onClick={toggleTheme}>
              {theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            </button>
          </div>
          <h1>{networkName}</h1>
          <p>{networkSubtitle}</p>
        </header>

        <section className={styles.details}>
          <div className={styles.sectionHeader}>
            <h2>Faucet</h2>
            <div className={styles.rule} />
          </div>

          <div className={styles.detailRows}>
            <div className={styles.detailRow}>
              <span>Network Name</span>
              <strong>{networkName}</strong>
            </div>
            <div className={styles.detailRow}>
              <span>RPC Endpoint</span>
              <strong className={styles.mono}>{rpcEndpoint}</strong>
            </div>
            <div className={styles.detailRow}>
              <span>Selected Asset</span>
              <strong>
                {activeAsset.label}
              </strong>
            </div>
            <div className={styles.detailRow}>
              <span>Default faucet</span>
              <strong>
                {activeAsset.amount} {activeAsset.label}
              </strong>
            </div>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.tabList} role="tablist" aria-label="Select token for faucet">
              <button
                type="button"
                role="tab"
                aria-selected={selectedAsset === "usdc"}
                className={`${styles.tab} ${
                  selectedAsset === "usdc" ? styles.tabActive : ""
                }`}
                onClick={() => {
                  setSelectedAsset("usdc");
                  setResult(null);
                }}
                disabled={isSubmitting}
              >
                USDC faucet
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedAsset === "xtz"}
                className={`${styles.tab} ${
                  selectedAsset === "xtz" ? styles.tabActive : ""
                }`}
                onClick={() => {
                  setSelectedAsset("xtz");
                  setResult(null);
                }}
                disabled={isSubmitting}
              >
                XTZ faucet
              </button>
            </div>

            <p className={styles.helperText}>
              Selected: {activeAsset.amount} {activeAsset.label}. {activeAsset.description}
            </p>

            <label className={styles.label} htmlFor="walletAddress">
              Recipient Wallet
            </label>
            <input
              id="walletAddress"
              name="walletAddress"
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck="false"
              placeholder="0x..."
              className={styles.input}
              value={walletAddress}
              onChange={(event) => setWalletAddress(event.target.value)}
              disabled={isSubmitting}
            />

            <button className={styles.button} type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Sending..."
                : selectedAsset === "xtz"
                  ? `Send ${activeAsset.amount} XTZ to your wallet`
                  : `Send ${activeAsset.amount} USDC to your wallet`}
            </button>
          </form>

          <div
            className={`${styles.statusBox} ${
              result ? (result.ok ? styles.statusSuccess : styles.statusError) : ""
            }`}
          >
            {result ? (
              <>
                <p>{result.message}</p>
                {result.txHash ? (
                  <p className={styles.mono}>Tx: {result.txHash}</p>
                ) : null}
                {result.explorerUrl ? (
                  <a href={result.explorerUrl} target="_blank" rel="noreferrer">
                    Open transaction →
                  </a>
                ) : null}
              </>
            ) : (
              <p>
                Enter a wallet address to receive {activeAsset.amount}{" "}
                {activeAsset.label} from the {networkName} faucet.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
