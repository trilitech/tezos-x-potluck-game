import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import "./App.css";
import "./nacCounterShell.css";
import { WalletPickerModal } from "./WalletPickerModal";
import {
  EventLogStrip,
  NacCounterBrandIcon,
  RoundActionButton,
  SatelliteRoundButton,
  ShellFooter,
  WrongChainHelp,
  createEventLogEntryId,
  shortAddr,
  type EventLogEntry,
  type EventLogTone,
} from "./nacCounterUi";
import { evmNetworkDisplayName } from "./tezosxNetwork";
import {
  buildNetworkInfoModalRows,
  normalizeTezosXNetwork,
  TEZOSX_FRONTEND_PRESETS,
  type TezosXNetworkName,
} from "./tezosxNetworkPresets";
import {
  clearSavedWalletRdns,
  discoverEip6963Wallets,
  findDetailBySavedRdns,
  getSavedWalletRdns,
  saveWalletRdns,
  type Eip6963ProviderDetail,
} from "./wallet/discoverEip6963";
import { getEvmProvider, setSelectedEvmProvider } from "./wallet/selectedEvmProvider";

const tezosXStack: TezosXNetworkName = normalizeTezosXNetwork(import.meta.env.VITE_TEZOSX_NETWORK);
const tezosXPreset = TEZOSX_FRONTEND_PRESETS[tezosXStack];

const evmRpc =
  tezosXStack === "previewnet"
    ? tezosXPreset.evmRpc
    : import.meta.env.VITE_EVM_RPC?.trim() || tezosXPreset.evmRpc;
const tezlinkRpc =
  tezosXStack === "previewnet"
    ? tezosXPreset.tezlinkRpc
    : import.meta.env.VITE_TEZLINK_RPC?.trim() || tezosXPreset.tezlinkRpc;
const evmExplorerUrl =
  tezosXStack === "previewnet"
    ? tezosXPreset.evmExplorerUrl
    : import.meta.env.VITE_EVM_EXPLORER_URL?.trim() || tezosXPreset.evmExplorerUrl;
const tezosExplorerBase =
  tezosXStack === "previewnet"
    ? tezosXPreset.tezosExplorerBase
    : import.meta.env.VITE_TEZOS_EXPLORER_BASE?.trim() || tezosXPreset.tezosExplorerBase;
const chainId = BigInt(
  tezosXStack === "previewnet"
    ? tezosXPreset.chainId
    : import.meta.env.VITE_CHAIN_ID?.trim() || tezosXPreset.chainId,
);
const tzktApiUrl =
  tezosXStack === "previewnet"
    ? tezosXPreset.tzktApiUrl
    : import.meta.env.VITE_TZKT_API_URL?.trim() ||
      tezosXPreset.tzktApiUrl ||
      tezlinkRpc.replace(/\/rpc\/tezlink\/?$/, "") + "/tzkt";

const HARDCODED_PREVIEWNET_COUNTER_KT1 = "KT1R21hfGfp8f17iUTZr6CXNCyUfffzC5TjK";

const COUNTER_KT1 = (() => {
  const preview =
    tezosXStack === "previewnet"
      ? import.meta.env.VITE_PREVIEWNET_COUNTER_KT1?.trim()
      : undefined;
  const legacy = import.meta.env.VITE_COUNTER_KT1?.trim();
  const fromEnv = (preview || legacy || "").trim();
  if (fromEnv) return fromEnv;
  if (tezosXStack === "previewnet") return HARDCODED_PREVIEWNET_COUNTER_KT1;
  return "";
})();

const TEZLINK_STORAGE_URL = COUNTER_KT1
  ? `${tezlinkRpc}/chains/main/blocks/head/context/contracts/${COUNTER_KT1}/storage`
  : "";

const POLL_INTERVAL_MS = Number(import.meta.env.VITE_POLL_INTERVAL_MS ?? "5000");
const WRAPPER_ADDRESS = import.meta.env.VITE_COUNTER_WRAPPER_ADDRESS?.trim() || "";
const TEZOS_X_DASHBOARD_URL = tezosXPreset.dashboardUrl;
const FAUCET_URL =
  tezosXStack === "previewnet"
    ? tezosXPreset.faucetUrl
    : import.meta.env.VITE_FAUCET_URL?.trim() || tezosXPreset.faucetUrl;
const DOCS_URL = import.meta.env.VITE_DOCS_URL ?? "https://x.tezos.com/docs/";

const TEZOSX_EVM_DISPLAY_NAME = evmNetworkDisplayName(tezosXStack);

const COUNTER_WRAPPER_ABI = [
  "function increment() external",
  "function decrement() external",
  "function reset() external",
  "function michelsonCounter() view returns (string)",
  "event CounterCalled(address indexed caller, string action, string michelsonCounter)",
];

type CounterAction = "increment" | "decrement" | "reset";

type CounterState = {
  value: number | null;
  fetchedAt: number | null;
  storageUpdatedAt: number | null;
};

type CounterRead = { value: number; fetchedAt: number };

function mergeCounterState(prev: CounterState, read: CounterRead): CounterState {
  const storageUpdatedAt =
    prev.value == null || read.value !== prev.value ? read.fetchedAt : (prev.storageUpdatedAt ?? read.fetchedAt);
  return { ...read, storageUpdatedAt };
}

type WalletState = {
  address: string | null;
  chainId: bigint | null;
  nativeBalance: string | null;
};

type MichelsonNode = {
  int?: string;
  prim?: string;
  args?: MichelsonNode[];
};

type RoundUiState = "connect" | "wrong-net" | "idle" | "play" | "depositing";

function NacCounterMark() {
  return (
    <>
      <span className="brand-name-tz">NAC</span> Counter
    </>
  );
}

function NetworkInfoModal(props: { open: boolean; onClose: () => void }) {
  if (!props.open) return null;

  const { rows, dashboardUrl } = buildNetworkInfoModalRows(tezosXStack, {
    networkDisplayName: TEZOSX_EVM_DISPLAY_NAME,
    evmRpc,
    tezlinkRpc,
    chainId,
    evmExplorerUrl,
    tezosExplorerBase,
    dashboardUrl: TEZOS_X_DASHBOARD_URL,
  });

  return (
    <div className="tour-backdrop" onClick={props.onClose}>
      <div className="tour-card sm network-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tour-head">
          <div className="tour-step-pill">
            <b>Network Details</b>
          </div>
          <button type="button" className="tour-close" onClick={props.onClose} aria-label="Close network details">
            ×
          </button>
        </div>
        <div className="tour-body">
          <div className="network-info-list">
            {rows.map(([label, value]) => (
              <div key={label} className="network-info-row">
                <div className="network-info-label">{label}</div>
                <div className="network-info-value">{value}</div>
              </div>
            ))}
          </div>
          <p className="network-info-link-wrap">
            <a href={dashboardUrl} target="_blank" rel="noopener noreferrer" className="explorer-link">
              Open Tezos X hub
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function evmTxUrl(hash: string) {
  const normalized = hash.startsWith("0x") ? hash : `0x${hash}`;
  return `${evmExplorerUrl}/tx/${normalized}`;
}

function counterExplorerUrl() {
  return `${tezosExplorerBase.replace(/\/$/, "")}/${COUNTER_KT1}`;
}

function counterOperationsUrl() {
  return `${tezosExplorerBase.replace(/\/$/, "")}/${COUNTER_KT1}/operations`;
}

async function fetchLatestTezosOpExplorerUrl(): Promise<string | null> {
  if (!COUNTER_KT1) return null;
  try {
    const api = tzktApiUrl.replace(/\/$/, "");
    const url = `${api}/v1/accounts/${encodeURIComponent(COUNTER_KT1)}/operations?limit=1&sort.desc=id`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const hash = (rows[0] as { hash?: string }).hash;
    if (!hash) return null;
    return `${tezosExplorerBase.replace(/\/$/, "")}/${hash}`;
  } catch {
    return null;
  }
}

function extractFirstInt(node: MichelsonNode | null | undefined): number | null {
  if (!node) return null;
  if (typeof node.int === "string") {
    const n = Number(node.int);
    return Number.isFinite(n) ? n : null;
  }
  if (Array.isArray(node.args)) {
    for (const child of node.args) {
      const value = extractFirstInt(child);
      if (value != null) return value;
    }
  }
  return null;
}

async function readCounterState(): Promise<CounterRead> {
  if (!COUNTER_KT1 || !TEZLINK_STORAGE_URL) {
    throw new Error(
      "No Michelson counter address configured. Set VITE_COUNTER_KT1 (or VITE_PREVIEWNET_COUNTER_KT1 on previewnet) in frontend/.env after originating the SmartPy contract.",
    );
  }
  const res = await fetch(TEZLINK_STORAGE_URL);
  if (res.status === 404) {
    throw new Error(
      `Michelson RPC returned 404 for ${COUNTER_KT1}. The contract is missing on this network or the address is wrong. ` +
        `Confirm VITE_TEZOSX_NETWORK matches where the contract was originated (${tezosXStack}), and verify: ${TEZLINK_STORAGE_URL}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Michelson storage request failed with ${res.status}. URL: ${TEZLINK_STORAGE_URL}`);
  }
  const json = (await res.json()) as MichelsonNode;
  const value = extractFirstInt(json);
  if (value == null) {
    throw new Error("Unexpected counter storage shape returned by Michelson RPC.");
  }
  return { value, fetchedAt: Date.now() };
}

function formatCounterError(
  error: unknown,
  action: CounterAction,
  ctx?: { valueBefore?: number | null },
): string {
  const act = action.charAt(0).toUpperCase() + action.slice(1);
  const err = error as { code?: string; message?: string; shortMessage?: string; data?: string };
  const msg = `${err?.shortMessage ?? err?.message ?? error ?? ""}`.toLowerCase();
  if (msg.includes("user rejected") || msg.includes("user denied")) {
    return `You canceled ${act} in your wallet.`;
  }
  const decrementAtZero =
    action === "decrement" &&
    ctx?.valueBefore === 0 &&
    (msg.includes("revert") ||
      msg.includes("reverted") ||
      msg.includes("execution reverted") ||
      msg.includes("require") ||
      msg.includes("at zero"));
  if (decrementAtZero || (action === "decrement" && msg.includes("at zero"))) {
    return "Can't decrement—the Michelson counter is already at 0. Increment first (or reset if your contract exposes it).";
  }
  if (msg.includes("revert") || msg.includes("reverted")) {
    const bare = !err?.data || err.data === "0x" || err.data === "0x0";
    const hint = bare
      ? " Empty revert often means KT1 mismatch (wrapper vs VITE_COUNTER_KT1), wrong network, or low gas."
      : "";
    return `${act} reverted.${hint} Check Blockscout (EVM) and Michelson explorers, then try again.`;
  }
  return `Could not ${act} the counter right now.`;
}

function formatTimeAgo(ts: number | null): string {
  if (!ts) return "Waiting for first fetch";
  const delta = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (delta < 2) return "Just now";
  if (delta < 60) return `${delta}s ago`;
  const mins = Math.floor(delta / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

async function wait(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForCounterChange(previous: number | null): Promise<CounterRead> {
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const fresh = await readCounterState();
    if (previous == null || fresh.value !== previous) return fresh;
    await wait(1500);
  }
  return readCounterState();
}

function App() {
  const counterKt1Configured = COUNTER_KT1.length > 0;
  const wrapperConfigured = WRAPPER_ADDRESS.length > 0;

  const [walletState, setWalletState] = useState<WalletState>({
    address: null,
    chainId: null,
    nativeBalance: null,
  });
  const [walletOptions, setWalletOptions] = useState<Eip6963ProviderDetail[]>([]);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [discoveringWallets, setDiscoveringWallets] = useState(false);
  const [counterState, setCounterState] = useState<CounterState>({
    value: null,
    fetchedAt: null,
    storageUpdatedAt: null,
  });
  const [eventLog, setEventLog] = useState<EventLogEntry[]>(() => {
    if (!counterKt1Configured) {
      return [
        {
          id: createEventLogEntryId(),
          msg: "Configure a Michelson counter: set VITE_COUNTER_KT1 (or VITE_PREVIEWNET_COUNTER_KT1) in frontend/.env after you originate the SmartPy contract.",
          tone: "error",
        },
      ];
    }
    const lines: EventLogEntry[] = [
      {
        id: createEventLogEntryId(),
        msg: "Connect an EVM wallet, then use the main control to Increment, Decrement, or Reset.",
        tone: "info",
      },
    ];
    if (!wrapperConfigured) {
      lines.push({
        id: createEventLogEntryId(),
        msg: "Deploy EvmToMichelsonCounter on Tezos X, then set VITE_COUNTER_WRAPPER_ADDRESS in frontend/.env.",
        tone: "info",
      });
    }
    return lines;
  });
  const [networkInfoOpen, setNetworkInfoOpen] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [, setStorageAgeTick] = useState(0);
  const mountedRef = useRef(true);
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const wrapperMismatchWarnedRef = useRef(false);
  const hasInjectedWallet = typeof window !== "undefined" && Boolean(window.ethereum);

  function pushEventLog(msg: string, tone: EventLogTone, txHash?: string, tezosOpsUrl?: string) {
    setEventLog((prev) => [
      ...prev,
      {
        id: createEventLogEntryId(),
        msg,
        tone,
        txHash,
        tezosOpsUrl,
      },
    ]);
  }

  async function refreshWalletState() {
    const ethereum = getEvmProvider();
    if (!ethereum) {
      setWalletState({ address: null, chainId: null, nativeBalance: null });
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = (await provider.send("eth_accounts", [])) as string[];
      const address = accounts[0] ?? null;
      const network = await provider.getNetwork();
      let nativeBalance: string | null = null;
      if (address) {
        const bal = await provider.getBalance(address);
        nativeBalance = Number(ethers.formatEther(bal)).toFixed(4);
      }
      if (mountedRef.current) {
        setWalletState({
          address,
          chainId: network.chainId,
          nativeBalance,
        });
      }
    } catch {
      if (mountedRef.current) {
        setWalletState({ address: null, chainId: null, nativeBalance: null });
      }
    }
  }

  async function refreshCounter() {
    const fresh = await readCounterState();
    if (mountedRef.current) setCounterState((prev) => mergeCounterState(prev, fresh));
    return fresh;
  }

  function disconnectWallet() {
    clearSavedWalletRdns();
    setSelectedEvmProvider(null);
    setWalletMenuOpen(false);
    void refreshWalletState();
    pushEventLog("Wallet disconnected.", "info");
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      setStorageAgeTick((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (counterKt1Configured) {
      refreshCounter().catch((error) => {
        const message = error instanceof Error ? error.message : "Failed to load counter storage.";
        pushEventLog(message, "error");
      });
    }
    return () => {
      mountedRef.current = false;
    };
  }, [counterKt1Configured]);

  useEffect(() => {
    if (!counterKt1Configured || !wrapperConfigured || wrapperMismatchWarnedRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const provider = new ethers.JsonRpcProvider(evmRpc);
        const wrapper = new ethers.Contract(WRAPPER_ADDRESS, COUNTER_WRAPPER_ABI, provider);
        const onChain: string = await wrapper.michelsonCounter();
        if (cancelled || wrapperMismatchWarnedRef.current) return;
        if (onChain !== COUNTER_KT1) {
          wrapperMismatchWarnedRef.current = true;
          pushEventLog(
            `Wrapper stores KT1 ${onChain}; this app uses ${COUNTER_KT1}. Redeploy the wrapper or fix VITE_COUNTER_KT1 / VITE_COUNTER_WRAPPER_ADDRESS.`,
            "error",
          );
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [counterKt1Configured, wrapperConfigured]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!counterKt1Configured) return;
      refreshCounter().catch(() => undefined);
      refreshWalletState().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [counterKt1Configured]);

  useEffect(() => {
    const ethereum = getEvmProvider();
    if (!ethereum?.on || !ethereum?.removeListener) return;
    const handleAccountsChanged = () => {
      refreshWalletState().catch(() => undefined);
    };
    const handleChainChanged = () => {
      refreshWalletState().catch(() => undefined);
    };
    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);
    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [walletState.address]);

  useEffect(() => {
    if (!walletMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (walletMenuRef.current && !walletMenuRef.current.contains(e.target as Node)) {
        setWalletMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [walletMenuOpen]);

  async function requestWalletConnection() {
    setDiscoveringWallets(true);
    try {
      const details = await discoverEip6963Wallets();
      setWalletOptions(details);
      if (details.length === 0) {
        pushEventLog(
          "No EVM wallet was detected. Install MetaMask, Rabby, or another EIP-1193 wallet.",
          "error",
        );
        return;
      }
      const saved = getSavedWalletRdns();
      const savedDetail = saved ? findDetailBySavedRdns(details, saved) : undefined;
      if (savedDetail) {
        await connectWalletDetail(savedDetail);
        return;
      }
      if (details.length === 1) {
        await connectWalletDetail(details[0]);
        return;
      }
      setWalletPickerOpen(true);
    } finally {
      setDiscoveringWallets(false);
    }
  }

  async function connectWalletDetail(detail: Eip6963ProviderDetail) {
    setSelectedEvmProvider(detail.provider);
    saveWalletRdns(detail.info.rdns || detail.info.uuid);
    setWalletPickerOpen(false);
    try {
      const provider = new ethers.BrowserProvider(detail.provider);
      await provider.send("eth_requestAccounts", []);
      await switchToTezosXNetwork(detail.provider);
      await refreshWalletState();
      pushEventLog(
        `Wallet connected. You can send NAC counter updates on ${TEZOSX_EVM_DISPLAY_NAME}.`,
        "success",
      );
    } catch (error) {
      clearSavedWalletRdns();
      setSelectedEvmProvider(null);
      const msg = error instanceof Error ? error.message : "Could not connect wallet.";
      pushEventLog(msg, "error");
    }
  }

  async function switchToTezosXNetwork(providerDetail?: Eip6963ProviderDetail["provider"]) {
    const ethereum = providerDetail ?? getEvmProvider();
    if (!ethereum?.request) return;
    const chainIdHex = `0x${chainId.toString(16)}`;
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });
    } catch (error) {
      const err = error as { code?: number };
      if (err?.code !== 4902) throw error;
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: TEZOSX_EVM_DISPLAY_NAME,
            nativeCurrency: { name: "XTZ", symbol: "XTZ", decimals: 18 },
            rpcUrls: [evmRpc],
            blockExplorerUrls: [evmExplorerUrl],
          },
        ],
      });
    }
  }

  async function performCounterAction(action: CounterAction) {
    const ethereum = getEvmProvider();
    if (!ethereum) {
      pushEventLog("Connect an EVM wallet first.", "error");
      return;
    }
    if (!wrapperConfigured) {
      pushEventLog(
        "Set VITE_COUNTER_WRAPPER_ADDRESS to your deployed EvmToMichelsonCounter before using the controls.",
        "error",
      );
      return;
    }
    if (!counterKt1Configured) return;

    setIsActing(true);
    const actLabel = action.charAt(0).toUpperCase() + action.slice(1);
    const previousValue = counterState.value;
    const tezosContractUrl = counterExplorerUrl();
    const tezosOpsFallback = counterOperationsUrl();
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      if (network.chainId !== chainId) {
        await switchToTezosXNetwork();
      }

      pushEventLog(
        `Please confirm ${actLabel} in your wallet. This EVM transaction routes through the NAC gateway to Michelson-interface storage.`,
        "info",
        undefined,
        tezosContractUrl,
      );

      const wrapper = new ethers.Contract(WRAPPER_ADDRESS, COUNTER_WRAPPER_ABI, signer);
      const tx = await wrapper[action]();

      pushEventLog(
        `${actLabel}: EVM transaction submitted. Waiting for Michelson-interface storage to update.`,
        "info",
        tx.hash,
        tezosContractUrl,
      );

      await tx.wait();

      const fresh = await waitForCounterChange(previousValue);
      setCounterState((prev) => mergeCounterState(prev, fresh));
      const successMsg = `${actLabel} succeeded. Michelson storage now reads ${fresh.value}.`;
      pushEventLog(successMsg, "success", tx.hash, tezosContractUrl);
    } catch (error) {
      const message = formatCounterError(error, action, { valueBefore: previousValue });
      const latestTezosOp = await fetchLatestTezosOpExplorerUrl();
      pushEventLog(message, "error", undefined, latestTezosOp ?? tezosOpsFallback);
    } finally {
      setIsActing(false);
      refreshWalletState().catch(() => undefined);
    }
  }

  const walletConnected = Boolean(walletState.address);
  const onExpectedChain = walletState.chainId === chainId;

  const mainUiState = useMemo((): RoundUiState => {
    if (isActing) return "depositing";
    if (!walletConnected) return "connect";
    if (!onExpectedChain) return "wrong-net";
    if (!wrapperConfigured) return "idle";
    return "play";
  }, [isActing, walletConnected, onExpectedChain, wrapperConfigured]);

  const mainControlLabels = useMemo(() => {
    switch (mainUiState) {
      case "connect":
        return { label: discoveringWallets ? "…" : "Connect", sub: "wallet" as string | null };
      case "wrong-net":
        return { label: "Add", sub: TEZOSX_EVM_DISPLAY_NAME };
      case "depositing":
        return { label: "…", sub: "working" };
      case "idle":
        return { label: "Configure", sub: "wrapper in .env" };
      case "play":
      default:
        return { label: "Increment", sub: null };
    }
  }, [mainUiState, discoveringWallets]);

  async function onMainControlClick() {
    if (mainUiState === "connect") {
      await requestWalletConnection();
      return;
    }
    if (mainUiState === "wrong-net") {
      await switchToTezosXNetwork();
      await refreshWalletState();
      return;
    }
    if (mainUiState === "play") {
      await performCounterAction("increment");
    }
  }

  const showSatelliteControls =
    mainUiState === "play" && counterState.value != null && counterState.value > 0;

  return (
    <>
      <div className="bg-grid" aria-hidden />
      <div className="bg-glow" aria-hidden />
      <div className="pl-shell">
        <header className="pl-topbar">
          <div className="brand">
            <div className="brand-mark brand-mark-icon" aria-hidden>
              <NacCounterBrandIcon />
            </div>
            <div className="brand-lockup">
              <span className="brand-name">
                <NacCounterMark />
              </span>
            </div>
          </div>
          <div className="topbar-right">
            {walletConnected ? (
              <div className="wallet-menu" ref={walletMenuRef}>
                <button
                  type="button"
                  className="wallet-pill"
                  onClick={() => setWalletMenuOpen((o) => !o)}
                >
                  <span className={`net-diamond ${onExpectedChain ? "" : "warn"}`}>◆</span>
                  <span className="addr">{shortAddr(walletState.address)}</span>
                  <svg className="caret" viewBox="0 0 12 12" aria-hidden="true">
                    <path
                      d="M3 4.5 6 7.5l3-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {walletMenuOpen ? (
                  <div className="wallet-dropdown">
                    <button
                      type="button"
                      onClick={() => {
                        setWalletMenuOpen(false);
                        disconnectWallet();
                      }}
                    >
                      Disconnect wallet
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <a className="btn ghost sm" href={TEZOS_X_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
              Explore Tezos X ↗
            </a>
          </div>
        </header>

        <main className="pl-game">
          <div className="game-layout">
            <aside className="game-stats">
              <div className="stat-row hero">
                <div className="stat-l">Michelson storage</div>
                <div className="stat-v hero-v">
                  <b>{counterState.value ?? "—"}</b>
                </div>
              </div>
              <div className="stat-row">
                <div className="stat-l">Storage updated</div>
                <div className="stat-v">{formatTimeAgo(counterState.storageUpdatedAt)}</div>
              </div>
              <div className="stat-row">
                <div className="stat-l">Counter KT1</div>
                <div className="stat-v">
                  {counterKt1Configured ? (
                    <a
                      className="explorer-link explorer-link--michelson"
                      href={counterExplorerUrl()}
                      target="_blank"
                      rel="noreferrer"
                      title={COUNTER_KT1}
                    >
                      {shortAddr(COUNTER_KT1)}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <div className="stat-row">
                <div className="stat-l">Your XTZ balance</div>
                <div className="stat-v">{walletState.nativeBalance ? `${walletState.nativeBalance} XTZ` : "—"}</div>
              </div>
            </aside>

            <div className="pot-stage">
              <div className={`pot-stage-controls${showSatelliteControls ? " pot-stage-controls--triad" : ""}`}>
                {showSatelliteControls ? (
                  <SatelliteRoundButton
                    label="Decrement"
                    disabled={isActing}
                    onClick={() => void performCounterAction("decrement")}
                  />
                ) : null}
                <div className="pot-stage-pot-wrap">
                  <RoundActionButton
                    state={mainUiState}
                    label={mainControlLabels.label}
                    sublabel={mainControlLabels.sub}
                    progress={null}
                    onClick={() => void onMainControlClick()}
                    disabled={
                      !counterKt1Configured ||
                      mainUiState === "depositing" ||
                      mainUiState === "idle" ||
                      (mainUiState === "connect" && discoveringWallets)
                    }
                  />
                </div>
                {showSatelliteControls ? (
                  <SatelliteRoundButton
                    label="Reset"
                    disabled={isActing}
                    onClick={() => void performCounterAction("reset")}
                  />
                ) : null}
              </div>
              {walletConnected && !onExpectedChain ? (
                <WrongChainHelp onAdd={() => void switchToTezosXNetwork()} evmNetworkDisplayName={TEZOSX_EVM_DISPLAY_NAME} />
              ) : null}

              <EventLogStrip entries={eventLog} evmTxUrl={evmTxUrl} />
            </div>
          </div>

          {(!hasInjectedWallet || !counterKt1Configured) && (
            <section className="game-status-area">
              {!hasInjectedWallet ? (
                <p className="side-note" style={{ color: "var(--amber)" }}>
                  No injected wallet detected. Install MetaMask or Rabby and reload.
                </p>
              ) : null}
              {!counterKt1Configured ? (
                <p className="side-note" style={{ color: "var(--amber)" }}>
                  Set <code>VITE_COUNTER_KT1</code> to your originated Michelson counter (see tutorial Part A). On
                  previewnet you can also use <code>VITE_TEZOSX_NETWORK=previewnet</code> so RPC URLs stay canonical.
                </p>
              ) : null}
            </section>
          )}
        </main>

        <ShellFooter
          hubUrl={TEZOS_X_DASHBOARD_URL}
          bridgeUrl={tezosXPreset.bridgeUrl}
          faucetUrl={FAUCET_URL}
          evmExplorerUrl={evmExplorerUrl}
          michelsonExplorerUrl={tezosExplorerBase}
          docsUrl={DOCS_URL}
          onOpenNetworkInfo={() => setNetworkInfoOpen(true)}
        />
      </div>

      <NetworkInfoModal open={networkInfoOpen} onClose={() => setNetworkInfoOpen(false)} />
      <WalletPickerModal
        open={walletPickerOpen}
        options={walletOptions}
        onSelect={(detail) => {
          connectWalletDetail(detail).catch(() => undefined);
        }}
        onClose={() => setWalletPickerOpen(false)}
      />
    </>
  );
}

export default App;

declare global {
  interface Window {
    ethereum?: unknown;
  }
}
