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
  type EventLogPhraseLink,
  type EventLogTone,
} from "./nacCounterUi";
import { evmNetworkDisplayName, stackShortLabel, walletAddNetworkHelpRabby } from "./tezosxNetwork";
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
import {
  createWalletFundingHelpers,
  formatAirdropSuccessLog,
  type AirdropApiSuccess,
  type WalletState as FundingWalletState,
} from "./walletFunding";

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

/** Previewnet: TzKT `/v1/contracts/.../storage` (Michelson `.../storage` often 404s); testnet: Michelson RPC. */
const counterStorageUrl = COUNTER_KT1
  ? tezosXStack === "previewnet"
    ? `${tzktApiUrl.replace(/\/$/, "")}/v1/contracts/${encodeURIComponent(COUNTER_KT1)}/storage`
    : `${tezlinkRpc}/chains/main/blocks/head/context/contracts/${COUNTER_KT1}/storage`
  : "";

const POLL_INTERVAL_MS = Number(import.meta.env.VITE_POLL_INTERVAL_MS ?? "5000");
const WRAPPER_ADDRESS = import.meta.env.VITE_COUNTER_WRAPPER_ADDRESS?.trim() || "";
const TEZOS_X_DASHBOARD_URL = tezosXPreset.dashboardUrl;
const TEZOS_X_EXPLORE_URL =
  import.meta.env.VITE_TEZOS_X_EXPLORE_URL?.trim() || "https://tezos.com/tezos-x/";
const FAUCET_URL =
  tezosXStack === "previewnet"
    ? tezosXPreset.faucetUrl
    : import.meta.env.VITE_FAUCET_URL?.trim() || tezosXPreset.faucetUrl;
const DOCS_URL = import.meta.env.VITE_DOCS_URL ?? "https://x.tezos.com/docs/";

const TEZOSX_EVM_DISPLAY_NAME = evmNetworkDisplayName(tezosXStack);
const CHAIN_ID_HEX = `0x${chainId.toString(16)}`;

const TEZOS_X_EVM_WALLET_HINT = `Your wallet does not look like it is on ${TEZOSX_EVM_DISPLAY_NAME} yet. Add or switch to that network, then try again.`;

const CONFIRM_APP_CHAIN_SWITCH_MSG = `Confirm switching to ${TEZOSX_EVM_DISPLAY_NAME} in your wallet…`;

const DEFAULT_AIRDROP_API_URL = "https://tezosx-evm-usdc-airdrop.vercel.app/api/airdrop";
const airdropApiUrl = import.meta.env.VITE_AIRDROP_API_URL?.trim() || DEFAULT_AIRDROP_API_URL;
const AIRDROP_USDC_AMOUNT = "5";
const AIRDROP_XTZ_AMOUNT = "1";
const TEZOS_X_RELAYER_RDNS = "com.tezosx.relayer";
const RELAYER_WALLET_KEY_PREFIX = "potzluck_relayer_wallet_v1";
const RELAYER_XTZ_AIRDROP_KEY_PREFIX = "potzluck_relayer_xtz_airdrop_v1";

const walletFunding = createWalletFundingHelpers({
  chainId,
  pressAmount: "0",
  pressAmountUnits: 0n,
  airdropApiUrl,
  airdropUsdcAmount: AIRDROP_USDC_AMOUNT,
  airdropXtzAmount: AIRDROP_XTZ_AMOUNT,
  relayerRdns: TEZOS_X_RELAYER_RDNS,
  relayerWalletKeyPrefix: RELAYER_WALLET_KEY_PREFIX,
  relayerXtzAirdropKeyPrefix: RELAYER_XTZ_AIRDROP_KEY_PREFIX,
});

const {
  airdropDeliveredLogMessage,
  formatAirdropError,
  hasRelayerXtzAirdropFlag,
  isRelayerWalletLocallyMarked,
  isTezosRelayerProviderLike,
  markRelayerWallet,
  markRelayerXtzAirdropped,
  refreshWalletUntilPlayBalancesVisible,
  requestAirdrop,
} = walletFunding;

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
};

type CounterRead = { value: number };

function mergeCounterState(_prev: CounterState, read: CounterRead): CounterState {
  return { value: read.value };
}

type WalletState = {
  address: string | null;
  chainId: bigint | null;
  nativeBalance: string | null;
  /** Raw wei balance for starter-airdrop / relayer logic (same helpers as xbutton-frontend). */
  xtzBalanceRaw: bigint | null;
};

function toFundingWallet(s: WalletState): FundingWalletState {
  return {
    address: s.address,
    chainId: s.chainId,
    usdcBalance: null,
    usdcAllowance: null,
    usdcBalanceRaw: 0n,
    xtzBalanceRaw: s.xtzBalanceRaw,
  };
}

type MichelsonNode = {
  int?: string;
  prim?: string;
  args?: MichelsonNode[];
};

type RoundUiState = "connect" | "wrong-net" | "idle" | "play" | "depositing";

function XCounterMark() {
  return (
    <>
      <span className="brand-name-tz">x</span>Counter
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

function evmContractExplorerUrl(contractAddress: string) {
  const a = contractAddress.startsWith("0x") ? contractAddress : `0x${contractAddress}`;
  return `${evmExplorerUrl.replace(/\/$/, "")}/address/${a}`;
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

/** TzKT often returns a bare JSON string for simple `nat` storage, e.g. `"42"`. */
function parseCounterStorageJson(json: unknown): number | null {
  if (typeof json === "string" && /^\d+$/.test(json)) {
    const n = Number(json);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof json === "number" && Number.isFinite(json)) return json;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    return extractFirstInt(json as MichelsonNode);
  }
  return null;
}

async function readCounterState(): Promise<CounterRead> {
  if (!COUNTER_KT1 || !counterStorageUrl) {
    throw new Error(
      "No Michelson counter address configured. Set VITE_COUNTER_KT1 (or VITE_PREVIEWNET_COUNTER_KT1 on previewnet) in frontend/.env after originating the SmartPy contract.",
    );
  }
  const res = await fetch(counterStorageUrl);
  if (res.status === 404) {
    throw new Error(
      `Storage request returned 404 for ${COUNTER_KT1}. The contract is missing on this network or the address is wrong. ` +
        `Confirm VITE_TEZOSX_NETWORK matches where the contract was originated (${tezosXStack}), and verify: ${counterStorageUrl}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Counter storage request failed with ${res.status}. URL: ${counterStorageUrl}`);
  }
  const json: unknown = await res.json();
  const value = parseCounterStorageJson(json);
  if (value == null) {
    throw new Error(
      "Unexpected counter storage shape. Expected TzKT decoded value (e.g. JSON string nat) or Micheline JSON.",
    );
  }
  return { value };
}

function isUserRejectedWalletError(error: unknown): boolean {
  if (error == null) return false;
  const e = error as {
    code?: string | number;
    message?: string;
    shortMessage?: string;
    reason?: string;
  };
  if (e.code === 4001 || e.code === "ACTION_REJECTED") return true;
  const msg = `${e.shortMessage ?? e.message ?? String(error)}`.toLowerCase();
  return (
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("ethers-user-denied") ||
    msg.includes("rejected the request") ||
    msg.includes("action_rejected")
  );
}

/**
 * EIP-1193 error `code` as returned by the wallet, or wrapped by ethers / extension (e.g. 4902 inside
 * `data.originalError` when the top-level `code` is -32603).
 */
function getWalletRpcErrorCode(error: unknown): number | undefined {
  const e = error as {
    code?: number | string;
    data?: { code?: number; originalError?: { code?: number } };
    info?: { error?: { code?: number } };
    cause?: { code?: number };
  };
  const n = (c: number | string | undefined): number | undefined => {
    if (c === undefined) return undefined;
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string" && /^-?\d+$/.test(c)) return parseInt(c, 10);
    return undefined;
  };
  return (
    n(e.code) ??
    n(e.data?.originalError?.code) ??
    n(e.data?.code) ??
    n(e.info?.error?.code) ??
    n(e.cause?.code)
  );
}

function isUnrecognizedChainError(error: unknown): boolean {
  if (getWalletRpcErrorCode(error) === 4902) return true;
  if (getWalletRpcErrorCode(error) === -32603) {
    let blob = "";
    try {
      blob = JSON.stringify(error);
    } catch {
      /* ignore */
    }
    if (blob.includes("4902")) return true;
  }
  const msg = `${(error as Error)?.message ?? ""} ${
    (error as { data?: { originalError?: { message?: string } } })?.data?.originalError?.message ?? ""
  }`.toLowerCase();
  return msg.includes("unrecognized") && msg.includes("chain");
}

function isWalletNetworkSetupError(error: unknown): boolean {
  if (isUserRejectedWalletError(error)) return false;
  const e = error as { message?: string; data?: { originalError?: { message?: string } } };
  const msg = `${e?.message ?? ""} ${e?.data?.originalError?.message ?? ""}`;
  if (!msg) return false;
  return msg.includes("Cannot destructure property") && msg.includes("defaultChain");
}

/**
 * Prefer over `provider.getNetwork()` — it can disagree with the extension (cached / registered networks).
 */
async function readChainIdFromProvider(provider: ethers.BrowserProvider): Promise<bigint> {
  const hex = (await provider.send("eth_chainId", [])) as string;
  return BigInt(hex);
}

function formatCounterError(
  error: unknown,
  action: CounterAction,
  ctx?: { valueBefore?: number | null },
): string {
  const act = action.charAt(0).toUpperCase() + action.slice(1);
  if (isUserRejectedWalletError(error)) {
    return `You canceled ${act} in your wallet.`;
  }
  const err = error as { code?: string; message?: string; shortMessage?: string; data?: string };
  const msg = `${err?.shortMessage ?? err?.message ?? error ?? ""}`.toLowerCase();
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
    xtzBalanceRaw: null,
  });
  const [walletOptions, setWalletOptions] = useState<Eip6963ProviderDetail[]>([]);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [discoveringWallets, setDiscoveringWallets] = useState(false);
  const [counterState, setCounterState] = useState<CounterState>({
    value: null,
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
  const [evmListenerKey, setEvmListenerKey] = useState(0);
  const [isActing, setIsActing] = useState(false);
  const mountedRef = useRef(true);
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const selectedWalletRdnsRef = useRef<string | null>(null);
  const wrapperMismatchWarnedRef = useRef(false);
  const walletSessionActiveRef = useRef(false);
  const walletStateRef = useRef(walletState);
  useEffect(() => {
    walletStateRef.current = walletState;
  }, [walletState]);
  const hasInjectedWallet = typeof window !== "undefined" && Boolean(window.ethereum);

  function pushEventLog(
    msg: string,
    tone: EventLogTone,
    txHash?: string,
    tezosOpsUrl?: string,
    phraseLinks?: EventLogPhraseLink[],
  ) {
    setEventLog((prev) => [
      ...prev,
      {
        id: createEventLogEntryId(),
        msg,
        tone,
        txHash,
        tezosOpsUrl,
        phraseLinks,
      },
    ]);
  }

  async function tryEnsureGasViaAirdrop(w: WalletState): Promise<void> {
    if (!w.address || w.chainId !== chainId) return;
    const fw = toFundingWallet(w);
    const relayerWallet = isRelayerWalletLocallyMarked(fw);
    const needsXtzAirdrop = relayerWallet
      ? !hasRelayerXtzAirdropFlag(fw)
      : w.xtzBalanceRaw == null || w.xtzBalanceRaw === 0n;
    if (!needsXtzAirdrop) return;

    let result: AirdropApiSuccess;
    try {
      pushEventLog(
        `Your wallet needs ${stackShortLabel(tezosXStack)} XTZ for gas — requesting an airdrop…`,
        "info",
      );
      result = await requestAirdrop(w.address, { usdc: false, xtz: true });
    } catch (error) {
      if (error instanceof Error && error.message === "AIRDROP_NOT_CONFIGURED") {
        pushEventLog(
          "Starter airdrop is not configured. Add XTZ via the faucet (see footer) to pay for gas.",
          "info",
        );
        return;
      }
      throw error;
    }

    if (relayerWallet) {
      markRelayerXtzAirdropped(w.address, w.chainId);
    }

    await refreshWalletUntilPlayBalancesVisible(true, async () => toFundingWallet(await refreshWalletState()));

    pushEventLog(
      formatAirdropSuccessLog(result, stackShortLabel(tezosXStack)) ??
        airdropDeliveredLogMessage(false, true, stackShortLabel(tezosXStack)),
      "success",
    );
  }

  async function refreshWalletState(): Promise<WalletState> {
    const empty: WalletState = { address: null, chainId: null, nativeBalance: null, xtzBalanceRaw: null };
    const ethereum = getEvmProvider();
    if (!ethereum) {
      walletSessionActiveRef.current = false;
      if (mountedRef.current) setWalletState(empty);
      return empty;
    }
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = (await provider.send("eth_accounts", [])) as string[];
      const currentChainId = await readChainIdFromProvider(provider);

      let address: string | null = null;
      if (accounts.length > 0) {
        address = ethers.getAddress(accounts[0]);
        walletSessionActiveRef.current = true;
      } else if (walletSessionActiveRef.current) {
        address = walletStateRef.current.address;
      }

      let nativeBalance: string | null = null;
      let xtzBalanceRaw: bigint | null = null;
      if (address) {
        try {
          const bal = await provider.getBalance(address);
          xtzBalanceRaw = bal;
          nativeBalance = Number(ethers.formatEther(bal)).toFixed(4);
        } catch {
          nativeBalance = walletStateRef.current.nativeBalance;
          xtzBalanceRaw = walletStateRef.current.xtzBalanceRaw;
        }
      }

      const next: WalletState = { address, chainId: currentChainId, nativeBalance, xtzBalanceRaw };
      if (mountedRef.current) setWalletState(next);
      return next;
    } catch {
      if (mountedRef.current) {
        setWalletState((prev) =>
          prev.address && walletSessionActiveRef.current ? prev : empty,
        );
      }
      const prev = walletStateRef.current;
      return prev.address && walletSessionActiveRef.current ? prev : empty;
    }
  }

  /**
   * `wallet_switchEthereumChain` to the app chain, or add+switch if the chain isn't in the wallet.
   */
  async function requestAppChainSwitch(): Promise<boolean> {
    const ethereum = getEvmProvider();
    if (!ethereum?.request) {
      return false;
    }
    const addChainParam = {
      chainId: CHAIN_ID_HEX,
      chainName: TEZOSX_EVM_DISPLAY_NAME,
      rpcUrls: [evmRpc],
      nativeCurrency: {
        name: "XTZ",
        symbol: "XTZ",
        decimals: 18,
      },
      blockExplorerUrls: [evmExplorerUrl],
    } as const;

    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
      return true;
    } catch (error) {
      if (isUserRejectedWalletError(error)) {
        return false;
      }
      if (isUnrecognizedChainError(error)) {
        try {
          await ethereum.request({
            method: "wallet_addEthereumChain",
            params: [addChainParam],
          });
          await ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: CHAIN_ID_HEX }],
          });
          return true;
        } catch (addOrSwitchErr) {
          if (isUserRejectedWalletError(addOrSwitchErr)) {
            return false;
          }
          const detail =
            addOrSwitchErr instanceof Error ? addOrSwitchErr.message : String(addOrSwitchErr);
          pushEventLog(
            `Could not add ${TEZOSX_EVM_DISPLAY_NAME} in your wallet. In Rabby, ${walletAddNetworkHelpRabby(tezosXStack)}, then try again. ${detail}`,
            "error",
          );
          return false;
        }
      }
      const msg = error instanceof Error ? error.message : String(error);
      pushEventLog(`Could not switch network: ${msg}`, "error");
      return false;
    }
  }

  async function refreshCounter() {
    const fresh = await readCounterState();
    if (mountedRef.current) setCounterState((prev) => mergeCounterState(prev, fresh));
    return fresh;
  }

  function disconnectWallet() {
    walletSessionActiveRef.current = false;
    selectedWalletRdnsRef.current = null;
    clearSavedWalletRdns();
    setSelectedEvmProvider(null);
    setEvmListenerKey((k) => k + 1);
    setWalletMenuOpen(false);
    void refreshWalletState();
    pushEventLog("Wallet disconnected.", "info");
  }

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
    const handleAccountsChanged = (accs: unknown) => {
      const accounts = accs as string[];
      if (!accounts?.length) {
        walletSessionActiveRef.current = false;
        setWalletState({ address: null, chainId: null, nativeBalance: null, xtzBalanceRaw: null });
        return;
      }
      void refreshWalletState();
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
  }, [evmListenerKey]);

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
    selectedWalletRdnsRef.current = detail.info.rdns || detail.info.uuid;
    setWalletPickerOpen(false);
    setEvmListenerKey((k) => k + 1);

    const ethereum = getEvmProvider();
    if (!ethereum) {
      pushEventLog(
        "No browser wallet was found. Install a wallet extension (for example MetaMask), or open this page in your wallet’s in-app browser, then press Connect again.",
        "error",
      );
      return;
    }

    let accounts: string[];
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      accounts = (await provider.send("eth_requestAccounts", [])) as string[];
    } catch (error) {
      if (isUserRejectedWalletError(error)) {
        pushEventLog(
          "Your wallet did not approve access (you may have rejected the request or closed the prompt). Press Connect to try again.",
          "info",
        );
        return;
      }
      if (isWalletNetworkSetupError(error)) {
        pushEventLog(TEZOS_X_EVM_WALLET_HINT, "error");
        setNetworkInfoOpen(true);
        return;
      }
      const msg =
        error instanceof Error ? error.message : "Could not reach your wallet. Unlock it and try Connect again.";
      pushEventLog(msg, "error");
      return;
    }

    if (accounts.length === 0) {
      pushEventLog(
        "Your wallet returned no account. Unlock it, allow this site, or pick an active account, then press Connect again.",
        "error",
      );
      return;
    }

    walletSessionActiveRef.current = true;

    let connected = await refreshWalletState();
    if (!connected.address) {
      pushEventLog(
        "Could not read your wallet after it connected. Unlock your wallet, check that you are on a supported network, and try Connect again.",
        "error",
      );
      return;
    }

    if (connected.chainId !== chainId) {
      pushEventLog(CONFIRM_APP_CHAIN_SWITCH_MSG, "info");
      const switched = await requestAppChainSwitch();
      if (!switched) {
        await refreshWalletState();
        pushEventLog(TEZOS_X_EVM_WALLET_HINT, "error");
        return;
      }
      connected = await refreshWalletState();
      if (!connected.address || connected.chainId !== chainId) {
        pushEventLog(TEZOS_X_EVM_WALLET_HINT, "error");
        return;
      }
    }

    if (isTezosRelayerProviderLike(getEvmProvider(), selectedWalletRdnsRef.current)) {
      markRelayerWallet(connected.address, connected.chainId);
    }

    try {
      await tryEnsureGasViaAirdrop(connected);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("AIRDROP_FAILED:")) {
        pushEventLog(formatAirdropError(error, stackShortLabel(tezosXStack)), "error");
        return;
      }
      pushEventLog(error instanceof Error ? error.message : "Airdrop failed.", "error");
      return;
    }

    await refreshWalletState();

    const connectMsg =
      "Wallet connected. Click the main button to update Michelson-interface storage via a Solidity contract on the EVM interface using NAC (Native Atomic Composability) on Tezos X.";
    const phraseLinks: EventLogPhraseLink[] | undefined =
      WRAPPER_ADDRESS.length > 0
        ? [{ phrase: "Solidity contract", href: evmContractExplorerUrl(WRAPPER_ADDRESS) }]
        : undefined;
    pushEventLog(connectMsg, "success", undefined, undefined, phraseLinks);
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
      const currentChainId = await readChainIdFromProvider(provider);
      if (currentChainId !== chainId) {
        pushEventLog(CONFIRM_APP_CHAIN_SWITCH_MSG, "info");
        const switched = await requestAppChainSwitch();
        if (!switched) {
          pushEventLog(TEZOS_X_EVM_WALLET_HINT, "error");
          return;
        }
      }

      const gasWallet = await refreshWalletState();
      try {
        await tryEnsureGasViaAirdrop(gasWallet);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("AIRDROP_FAILED:")) {
          pushEventLog(formatAirdropError(error, stackShortLabel(tezosXStack)), "error");
          return;
        }
        pushEventLog(error instanceof Error ? error.message : "Airdrop failed.", "error");
        return;
      }
      await refreshWalletState();

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
      pushEventLog(CONFIRM_APP_CHAIN_SWITCH_MSG, "info");
      await requestAppChainSwitch();
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
                <XCounterMark />
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
            <a className="btn ghost sm" href={TEZOS_X_EXPLORE_URL} target="_blank" rel="noopener noreferrer">
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
                <div className="stat-l">Counter EVM</div>
                <div className="stat-v">
                  {wrapperConfigured ? (
                    <a
                      className="explorer-link"
                      href={evmContractExplorerUrl(WRAPPER_ADDRESS)}
                      target="_blank"
                      rel="noreferrer"
                      title={WRAPPER_ADDRESS}
                    >
                      {shortAddr(WRAPPER_ADDRESS)}
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
                <WrongChainHelp
                  onAdd={() => {
                    pushEventLog(CONFIRM_APP_CHAIN_SWITCH_MSG, "info");
                    void requestAppChainSwitch().then(() => refreshWalletState());
                  }}
                  evmNetworkDisplayName={TEZOSX_EVM_DISPLAY_NAME}
                />
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
