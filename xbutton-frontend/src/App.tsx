import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import "./App.css";
import "./potzluck.css";
import { PotzTour } from "./PotzTour";
import {
  DepositPotCelebration,
  EventLogStrip,
  NetworkHelpPotz,
  PotButton,
  PotFooter,
  PotzLuckPotIcon,
  RecentSessionsClaimInfo,
} from "./potzluckUi";
import {
  createEventLogEntryId,
  isPayoutSuccessLogMessage,
  shortAddr,
  type EventLogEntry,
  type EventLogTone,
} from "./potzluckLog";
import { evmNetworkDisplayName, stackShortLabel, walletAddNetworkHelpRabby } from "./tezosxNetwork";
import { resolveFrontendContracts } from "./tezosxContractEnv";
import {
  buildNetworkInfoModalRows,
  normalizeTezosXNetwork,
  TEZOSX_FRONTEND_PRESETS,
} from "./tezosxNetworkPresets";
import {
  addressesEqual,
  compareSessionIdsDesc,
  formatClockDuration,
  formatEndedAgo,
  getClaimTargetSession,
  getDuplicateClaimTargetForWalletSession,
  getPendingClaimRequestedSession,
  hasCurrentClaimInFlight,
  isClaimSettled,
  michelsonPotHasFunds,
  potInfoForClaimTarget,
  type ClaimTargetSession,
  type GameState,
} from "./gameSessions";
import {
  getPayoutStorageKeys,
  markPayoutSessionCompletedInStorage,
  PASSIVE_CLAIM_WAIT_LOG_KEY_PREFIX,
  readPayoutPotMeta,
  readStoredEventLog,
  readStringIdSet,
  type PayoutPotMeta,
  writePayoutPotMeta,
  writeStoredEventLog,
  writeStringIdSet,
} from "./potzluckStorage";
import { WalletPickerModal } from "./WalletPickerModal";
import {
  clearSavedWalletRdns,
  discoverEip6963Wallets,
  findDetailBySavedRdns,
  getSavedWalletRdns,
  saveWalletRdns,
  type Eip6963ProviderDetail,
} from "./wallet/discoverEip6963";
import {
  getEvmProvider,
  setSelectedEvmProvider,
  type SelectedEthereumProvider,
} from "./wallet/selectedEvmProvider";
import { createWalletFundingHelpers, formatAirdropSuccessLog, type WalletState } from "./walletFunding";

const tezosXStack = normalizeTezosXNetwork(import.meta.env.VITE_TEZOSX_NETWORK);
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
const { usdc: usdcAddress, pot: potAddress, game: gameContract, nac: nacPrecompile } =
  resolveFrontendContracts(tezosXStack, import.meta.env);
const usdcDecimals = Number(import.meta.env.VITE_USDC_DECIMALS ?? "6");
const pressAmount = import.meta.env.VITE_PRESS_AMOUNT ?? "1";
const pollIntervalMs = Number(import.meta.env.VITE_POLL_INTERVAL_MS ?? "5000");
const gameStateWaitTimeoutMs = (() => {
  const n = Number(import.meta.env.VITE_GAME_STATE_WAIT_TIMEOUT_MS ?? "40000");
  return Number.isFinite(n) && n > 0 ? n : 40000;
})();
const faucetUrl =
  tezosXStack === "previewnet"
    ? tezosXPreset.faucetUrl
    : import.meta.env.VITE_FAUCET_URL?.trim() || tezosXPreset.faucetUrl;
const DEFAULT_AIRDROP_API_URL = "https://tezosx-evm-usdc-airdrop.vercel.app/api/airdrop";
const airdropApiUrl = import.meta.env.VITE_AIRDROP_API_URL?.trim() || DEFAULT_AIRDROP_API_URL;
const DEFAULT_RELAYER_WAKE_URL = "https://tzbutton-crac-game-demo.onrender.com";
const relayerWakeUrl = import.meta.env.VITE_RELAYER_WAKE_URL?.trim() || DEFAULT_RELAYER_WAKE_URL;

const AIRDROP_BALANCE_SYNC_PENDING_MESSAGE =
  "Your airdrop was sent, but your wallet balance has not updated yet. Wait a moment, then press Play again.";

function formatPotPayoutSuccessMessage(sessionId: string, potDisplay: string | null | undefined): string {
  const head = `Game #${sessionId}: Payout confirmed.`;
  if (potDisplay != null && potDisplay !== "" && potDisplay !== "—" && potDisplay !== "0") {
    return `${head} ${potDisplay} USDC sent from the pot to your wallet. Click Play to keep playing!`;
  }
  return `${head} USDC was sent from the pot to your wallet. Click Play to keep playing!`;
}

const PAYOUT_LOG_LOOKBACK_BLOCKS = 4000;
const AIRDROP_USDC_AMOUNT = "5";
const AIRDROP_XTZ_AMOUNT = "1";
const TEZOS_X_RELAYER_RDNS = "com.tezosx.relayer";
const RELAYER_WALLET_KEY_PREFIX = "potzluck_relayer_wallet_v1";
const RELAYER_XTZ_AIRDROP_KEY_PREFIX = "potzluck_relayer_xtz_airdrop_v1";

const tzktApiUrl =
  tezosXStack === "previewnet"
    ? tezosXPreset.tzktApiUrl
    : import.meta.env.VITE_TZKT_API_URL?.trim() ||
      tezosXPreset.tzktApiUrl ||
      tezlinkRpc.replace(/\/rpc\/tezlink\/?$/, "") + "/tzkt";

const tezktGameOperationsPath =
  tezosXStack === "previewnet"
    ? gameContract
    : import.meta.env.VITE_TEZKT_GAME_OPERATIONS_PATH?.trim() || gameContract;

const gameStorageUrl =
  tezosXStack === "previewnet"
    ? `${tzktApiUrl.replace(/\/$/, "")}/v1/contracts/${encodeURIComponent(gameContract)}/storage`
    : `${tezlinkRpc}/chains/main/blocks/head/context/contracts/${gameContract}/storage`;

const CONFIG = {
  appName: "Potluck",
  stack: tezosXStack,
  evmRpc,
  tezlinkRpc,
  gameStorageUrl,
  evmExplorerUrl,
  tezosExplorerBase,
  tzktApiUrl,
  chainId,
  chainIdHex: `0x${chainId.toString(16)}`,
  usdcAddress,
  potAddress,
  gameContract,
  tezktGameOperationsPath,
  nacPrecompile,
  usdcDecimals,
  pressAmount,
  pollIntervalMs,
  gameStateWaitTimeoutMs,
} as const;

const TEZOSX_EVM_DISPLAY_NAME = evmNetworkDisplayName(CONFIG.stack);

const TEZOS_X_DASHBOARD_URL = tezosXPreset.dashboardUrl;
const POTZ_DOCS_URL = import.meta.env.VITE_DOCS_URL ?? "https://x.tezos.com/docs/";
const TEZLINK_SITE_URL = import.meta.env.VITE_TEZLINK_SITE_URL ?? tezosXPreset.tezosExplorerBase;

function evmTxUrl(hash: string) {
  const h = hash.startsWith("0x") ? hash : `0x${hash}`;
  return `${CONFIG.evmExplorerUrl}/tx/${h}`;
}

const { payoutWaitIdsKey: PAYOUT_WAIT_IDS_KEY, payoutDoneIdsKey: PAYOUT_DONE_IDS_KEY } =
  getPayoutStorageKeys();

/** Michelson-interface tzkt: contract (or rollup) operations list — e.g. `…/BLS2…/operations` or `…/KT1…/operations`. */
function tezosGameOperationsUrl(): string {
  const base = CONFIG.tezosExplorerBase.replace(/\/$/, "");
  const seg = String(CONFIG.tezktGameOperationsPath).replace(/^\//, "");
  return `${base}/${seg}/operations`;
}

/** Latest Michelson-side operation for the game contract (tzkt REST), as `{explorer}/{hash}`. */
async function fetchLatestTezosOpExplorerUrl(): Promise<string | null> {
  try {
    const api = CONFIG.tzktApiUrl.replace(/\/$/, "");
    const url = `${api}/v1/accounts/${encodeURIComponent(CONFIG.gameContract)}/operations?limit=1&sort.desc=id`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const h = (rows[0] as { hash?: string })?.hash;
    if (!h || typeof h !== "string") return null;
    const exBase = CONFIG.tezosExplorerBase.replace(/\/$/, "");
    return `${exBase}/${h}`;
  } catch {
    return null;
  }
}

const ERC20_ABI = [
  "function transfer(address to, uint256 value) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
];

const ESCROW_ABI = [
  "function deposit(uint256 amount)",
  "event Deposited(address indexed player, uint256 amount)",
  "event PaidOut(address indexed winner, uint256 amount)",
  "event SessionCompleted(uint256 indexed sessionId, address indexed winner, uint256 potSize, uint256 paidOutAt)",
];

const GATEWAY_ABI = [
  "function callMichelson(string destination, string entrypoint, bytes data) external payable",
];

// Default session duration in seconds (5 minutes). start_session takes an int.
const DEFAULT_SESSION_DURATION_SEC = 300;

/** Encode a non-negative int as Micheline bytes: 0x00 (int tag) + zarith encoding */
function encodeMichelineInt(value: number | string | bigint): string {
  let n = BigInt(value);
  if (n < 0n) throw new Error("encodeMichelineInt: non-negative only");
  const bytes: number[] = [0x00];
  let first = Number(n & 0x3fn);
  n >>= 6n;
  if (n > 0n) first |= 0x80;
  bytes.push(first);
  while (n > 0n) {
    let b = Number(n & 0x7fn);
    n >>= 7n;
    if (n > 0n) b |= 0x80;
    bytes.push(b);
  }
  return "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PRESS_AMOUNT_UNITS = ethers.parseUnits(CONFIG.pressAmount, CONFIG.usdcDecimals);

/**
 * Allowance we `approve` for the escrow. Max uint means one signature can cover many deposits;
 * each `deposit` call still only transfers `PRESS_AMOUNT_UNITS` (wallets usually show this as unlimited).
 */
const USDC_ESCROW_APPROVE_CAP = ethers.MaxUint256;

const walletFunding = createWalletFundingHelpers({
  chainId: CONFIG.chainId,
  pressAmount: CONFIG.pressAmount,
  pressAmountUnits: PRESS_AMOUNT_UNITS,
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
  getInsufficientPlayFundsEventLogMessage,
  hasRelayerXtzAirdropFlag,
  isRelayerWalletLocallyMarked,
  isTezosRelayerProviderLike,
  markRelayerWallet,
  markRelayerXtzAirdropped,
  refreshWalletUntilPlayBalancesVisible,
  requestAirdrop,
} = walletFunding;

type GameStorageJsonNode = {
  prim?: string;
  args?: GameStorageJsonNode[];
  bytes?: string;
  int?: string;
  string?: string;
};

type FlowStepStatus = "upcoming" | "active" | "done";

type FlowStep = {
  id: string;
  label: string;
  detail?: string;
  status: FlowStepStatus;
};

type FlowStepDef = { id: string; label: string; detail?: string };

function markFlowSteps(defs: FlowStepDef[], activeId: string): FlowStep[] {
  const activeIndex = defs.findIndex((d) => d.id === activeId);
  const ai = activeIndex === -1 ? 0 : activeIndex;
  const visible = defs.slice(0, ai + 1);
  return visible.map((d, idx) => ({
    id: d.id,
    label: d.label,
    ...(d.detail ? { detail: d.detail } : {}),
    status: (idx < ai ? "done" : "active") as FlowStepStatus,
  }));
}

function completeFlowSteps(defs: FlowStepDef[]): FlowStep[] {
  return defs.map((d) => ({ ...d, status: "done" as const }));
}

function pressStepDefs(needsApproval: boolean): FlowStepDef[] {
  return [
    {
      id: "prepare",
      label: "Load game state from the Michelson interface",
      detail: "Loading the latest round from the Michelson interface so the sidebar matches on-chain state.",
    },
    ...(needsApproval
      ? [
          {
            id: "approve",
            label: "Approve USDC for the escrow",
            detail:
              "Your wallet sets how much USDC the escrow may pull. We use a high allowance so you only sign this once; each play still moves just the stake.",
          },
        ]
      : []),
    {
      id: "wallet_deposit",
      label: "Deposit 1 USDC into the escrow",
      detail: `You confirm a deposit on the escrow contract. USDC moves into the game pot on ${TEZOSX_EVM_DISPLAY_NAME}.`,
    },
    {
      id: "evm_confirm",
      label: `Waiting for confirmation from ${TEZOSX_EVM_DISPLAY_NAME}`,
      detail: "The network confirms your deposit transaction.",
    },
    {
      id: "relayer_cross_runtime",
      label: "Calling the NAC gateway on the EVM side",
      detail:
        "The NAC gateway is invoked from the EVM interface so execution reaches the Michelson-interface and updates the game's Michelson-interface storage with your deposit.",
    },
  ];
}

const CLAIM_STEP_DEFS: FlowStepDef[] = [
  {
    id: "check",
    label: "We're checking that you're the last depositor",
    detail:
      "We compare your connected wallet with the last depositor stored in the game contract. Only that wallet can claim the pot.",
  },
  {
    id: "wallet_claim",
    label: "Confirm the claim in your wallet",
    detail: "When your wallet opens, approve the claim transaction.",
  },
  {
    id: "evm_claim",
    label: `Waiting for confirmation from ${TEZOSX_EVM_DISPLAY_NAME}`,
    detail: "After this confirms, automation pays USDC from escrow and updates Michelson storage.",
  },
];

const START_SESSION_STEP_DEFS: FlowStepDef[] = [
  {
    id: "wallet_start",
    label: "Start a new game",
  },
  {
    id: "evm_start",
    label: `Waiting for confirmation from ${TEZOSX_EVM_DISPLAY_NAME}`,
  },
];

function NetworkInfoModal(props: { open: boolean; onClose: () => void }) {
  if (!props.open) return null;

  const { rows, dashboardUrl } = buildNetworkInfoModalRows(CONFIG.stack, {
    networkDisplayName: TEZOSX_EVM_DISPLAY_NAME,
    evmRpc: CONFIG.evmRpc,
    tezlinkRpc: CONFIG.tezlinkRpc,
    chainId: CONFIG.chainId,
    evmExplorerUrl: CONFIG.evmExplorerUrl,
    tezosExplorerBase: CONFIG.tezosExplorerBase,
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
              Open network site
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function AirdropModal(props: {
  open: boolean;
  receivedUsdc: boolean;
  receivedXtz: boolean;
  onDismiss: () => void;
}) {
  if (!props.open) return null;

  const gotBoth = props.receivedUsdc && props.receivedXtz;
  const heading = gotBoth
    ? `Boom! We Airdropped you ${AIRDROP_USDC_AMOUNT} USDC and ${AIRDROP_XTZ_AMOUNT} XTZ.`
    : props.receivedUsdc
      ? `Boom! We Airdropped you ${AIRDROP_USDC_AMOUNT} USDC.`
      : `Boom! We Airdropped you ${AIRDROP_XTZ_AMOUNT} XTZ.`;

  const body = gotBoth
    ? `We airdropped ${AIRDROP_USDC_AMOUNT} USDC to play with and ${AIRDROP_XTZ_AMOUNT} XTZ for gas into your wallet on the EVM interface of Tezos X. You're ready to play.`
    : props.receivedUsdc
      ? `We airdropped ${AIRDROP_USDC_AMOUNT} USDC into your wallet so you can play on Tezos X.`
      : `We airdropped ${AIRDROP_XTZ_AMOUNT} XTZ into your wallet so you have gas to play on Tezos X.`;

  return (
    <div className="tour-backdrop" onClick={props.onDismiss}>
      <div className="tour-card sm" onClick={(e) => e.stopPropagation()}>
        <div className="tour-head">
          <div className="tour-step-pill">
            <span style={{ color: "var(--fg-1)" }}>Welcome aboard</span>
          </div>
          <button type="button" className="tour-close" onClick={props.onDismiss} aria-label="Close airdrop modal">
            ✕
          </button>
        </div>
        <div className="tour-body">
          <h2 className="tour-h">{heading}</h2>
          <p className="tour-sub">{body}</p>
          <div className="airdrop-grid">
            {props.receivedUsdc ? (
              <div className="airdrop-card">
                <div className="token"><span className="ic usdc">$</span> USDC</div>
                <div className="amt">{Number(AIRDROP_USDC_AMOUNT).toFixed(2)}</div>
                <div className="src">game token</div>
              </div>
            ) : null}
            {props.receivedXtz ? (
              <div className="airdrop-card">
                <div className="token"><span className="ic xtz">ꜩ</span> XTZ</div>
                <div className="amt">{Number(AIRDROP_XTZ_AMOUNT).toFixed(2)}</div>
                <div className="src">gas token</div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="tour-foot">
          <span className="hint">You&apos;ll need 1 USDC per Play.</span>
          <button type="button" className="btn primary" onClick={props.onDismiss}>
            Let&apos;s play <span className="kbd">↵</span>
          </button>
        </div>
      </div>
    </div>
  );
}

type ActionState =
  | { kind: "idle"; message: string; txHash?: undefined; tezosOpsUrl?: undefined; relatedUrl?: undefined; steps?: undefined }
  | { kind: "pending"; message: string; txHash?: string; tezosOpsUrl?: string; relatedUrl?: string; steps?: FlowStep[] }
  | { kind: "success"; message: string; txHash?: string; tezosOpsUrl?: string; relatedUrl?: string; steps?: FlowStep[] }
  | { kind: "error"; message: string; txHash?: string; tezosOpsUrl?: string; relatedUrl?: string; steps?: undefined };

type EthereumProvider = SelectedEthereumProvider;

const TEZOS_X_EVM_WALLET_HINT = `Your wallet does not look like it is on ${TEZOSX_EVM_DISPLAY_NAME} yet. Add or switch to that network, then try again.`;

const CLAIM_MISMATCH_LOG_PREFIX = "Only the last person who pressed can claim.";

const CONNECT_WALLET_CHECKING_MSG = "Connecting your wallet and checking your Tezos X balances…";

const DEPOSIT_MICHELSON_SYNC_LOG_PREFIX =
  "Calling the NAC gateway to update the game pot's Michelson-interface storage…";

const CONFIRM_APP_CHAIN_SWITCH_MSG = `Confirm switching to ${TEZOSX_EVM_DISPLAY_NAME} in your wallet…`;

function isUserRejectedWalletError(error: unknown): boolean {
  const e = error as { code?: number | string };
  return e.code === 4001 || e.code === "ACTION_REJECTED";
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
 * Read the wallet’s *current* chain from the injected provider. Prefer this over
 * `provider.getNetwork()`: the latter can disagree with the extension (cached / registered networks).
 */
async function readChainIdFromProvider(provider: ethers.BrowserProvider): Promise<bigint> {
  const hex = (await provider.send("eth_chainId", [])) as string;
  return BigInt(hex);
}

function isBadContractRpcResultError(error: unknown): boolean {
  const err = error as { code?: string; message?: string; shortMessage?: string };
  const text = `${err?.code ?? ""} ${err?.message ?? ""} ${err?.shortMessage ?? ""}`.toLowerCase();
  return (
    err?.code === "BAD_DATA" ||
    text.includes("bad_data") ||
    text.includes("could not decode result data")
  );
}

function formatTokenAmount(value: bigint, decimals: number) {
  const formatted = ethers.formatUnits(value, decimals);
  return formatted.replace(/\.?0+$/, "");
}

const TEZOS_BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const TEZOS_ADDR_PREFIXES: Record<string, number[]> = {
  tz1: [6, 161, 159],
  tz2: [6, 161, 161],
  tz3: [6, 161, 164],
  KT1: [2, 90, 121],
};

function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let result = "";
  while (n > 0n) {
    result = TEZOS_BASE58_ALPHABET[Number(n % 58n)] + result;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    result = "1" + result;
  }
  return result;
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer));
}

/**
 * Convert a 22-byte optimised Tezos address (as returned by Michelson contract JSON storage)
 * back to a human-readable tz1/tz2/tz3/KT1 Base58Check string.
 */
async function tezosAddressFromBinary(hexStr: string): Promise<string> {
  const bin = new Uint8Array(hexStr.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  if (bin.length !== 22) throw new Error(`Expected 22-byte address, got ${bin.length}`);

  let prefixBytes: number[];
  let hash: Uint8Array;

  if (bin[0] === 0x00) {
    const curve = bin[1];
    hash = bin.slice(2);
    if (curve === 0x00) prefixBytes = TEZOS_ADDR_PREFIXES.tz1;
    else if (curve === 0x01) prefixBytes = TEZOS_ADDR_PREFIXES.tz2;
    else if (curve === 0x02) prefixBytes = TEZOS_ADDR_PREFIXES.tz3;
    else throw new Error(`Unknown implicit curve byte: 0x${curve.toString(16)}`);
  } else if (bin[0] === 0x01) {
    prefixBytes = TEZOS_ADDR_PREFIXES.KT1;
    hash = bin.slice(1, 21);
  } else {
    throw new Error(`Unknown address type byte: 0x${bin[0].toString(16)}`);
  }

  const payload = new Uint8Array([...prefixBytes, ...hash]);
  const checksum = (await sha256Bytes(await sha256Bytes(payload))).slice(0, 4);
  return base58Encode(new Uint8Array([...payload, ...checksum]));
}

function parseGameStorage(storage: GameStorageJsonNode): {
  state: Omit<GameState, "lastPlayerTezos" | "lastPlayerAddress">;
  lastPlayerBytes: string | null;
  lastPlayerTezos: string | null;
  lastPlayerEvmHex: string | null;
} {
  // pair current_session_id
  //      (pair current_session
  //            (pair pending_session_ids pending_sessions))
  const root = storage.args;
  const currentSessionId = root?.[0]?.int;
  const currentSession = root?.[1]?.args?.[0];
  const pendingSessionsMapNode = root?.[1]?.args?.[1]?.args?.[1];
  const pendingSessionsMap = Array.isArray(pendingSessionsMapNode) ? pendingSessionsMapNode : [];

  const lastPlayerCell = currentSession?.args?.[0];
  const lastPlayerEvmCell = currentSession?.args?.[1]?.args?.[0];
  const potRaw = currentSession?.args?.[1]?.args?.[1]?.args?.[0]?.int;
  const sessionEndRaw = currentSession?.args?.[1]?.args?.[1]?.args?.[1]?.args?.[0]?.int;
  const claimedPrim = currentSession?.args?.[1]?.args?.[1]?.args?.[1]?.args?.[1]?.prim;

  // last_player (Tezos identity)
  let lastPlayerTezos: string | null = null;
  let lastPlayerBytes: string | null = null;

  if (!lastPlayerCell?.prim) {
    throw new Error("Unexpected game contract storage shape for last_player.");
  }
  if (lastPlayerCell.prim === "Some") {
    const arg = lastPlayerCell.args?.[0];
    if (arg?.string) lastPlayerTezos = arg.string;
    else if (arg?.bytes) lastPlayerBytes = arg.bytes;
    else throw new Error("Unexpected game contract storage: Some last_player without address or bytes.");
  } else if (lastPlayerCell.prim !== "None") {
    throw new Error("Unexpected game contract storage shape for last_player.");
  }

  // last_player_evm (raw 20-byte EVM address stored by the relayer)
  let lastPlayerEvmHex: string | null = null;
  if (lastPlayerEvmCell?.prim === "Some") {
    const evmBytes = lastPlayerEvmCell.args?.[0]?.bytes;
    if (evmBytes) lastPlayerEvmHex = evmBytes; // 40-char hex, no 0x prefix
  }

  const pendingSessions = pendingSessionsMap.flatMap((entry: GameStorageJsonNode) => {
    const sessionId = entry?.args?.[0]?.int;
    const sessionValue = entry?.args?.[1];
    const winnerTezos = sessionValue?.args?.[0]?.string ?? null;
    const winnerEvmHex = sessionValue?.args?.[1]?.args?.[0]?.bytes ?? null;
    const pendingPotRaw = sessionValue?.args?.[1]?.args?.[1]?.args?.[0]?.int;
    const pendingSessionEndRaw = sessionValue?.args?.[1]?.args?.[1]?.args?.[1]?.args?.[0]?.int;
    const claimRequestedPrim = sessionValue?.args?.[1]?.args?.[1]?.args?.[1]?.args?.[1]?.prim;

    if (
      sessionId == null ||
      pendingPotRaw == null ||
      pendingSessionEndRaw == null ||
      claimRequestedPrim == null
    ) {
      return [];
    }

    let winnerAddress: string | null = null;
    if (winnerEvmHex) {
      try {
        winnerAddress = ethers.getAddress(`0x${winnerEvmHex}`);
      } catch {
        winnerAddress = null;
      }
    }

    return [{
      sessionId,
      winnerTezos,
      winnerAddress,
      potRaw: pendingPotRaw,
      potDisplay: formatTokenAmount(BigInt(pendingPotRaw), CONFIG.usdcDecimals),
      sessionEnd: Number(pendingSessionEndRaw),
      claimRequested: claimRequestedPrim === "True",
    }];
  });

  if (currentSessionId === undefined || potRaw === undefined || !sessionEndRaw || claimedPrim === undefined) {
    throw new Error("Unexpected game contract storage shape.");
  }

  return {
    state: {
      currentSessionId,
      potRaw: potRaw ?? "0",
      potDisplay: formatTokenAmount(BigInt(potRaw ?? "0"), CONFIG.usdcDecimals),
      sessionEnd: Number(sessionEndRaw),
      claimed: claimedPrim === "True",
      pendingSessions,
      fetchedAt: Date.now(),
    },
    lastPlayerTezos,
    lastPlayerBytes,
    lastPlayerEvmHex,
  };
}

/** TzKT `/v1/contracts/.../storage` decoded shape (Previewnet). */
function parseGameStorageFromTzkt(raw: Record<string, unknown>): ReturnType<typeof parseGameStorage> {
  const cs = raw.current_session as Record<string, unknown> | undefined;
  const currentSessionIdRaw = raw.current_session_id;
  if (!cs || currentSessionIdRaw == null) throw new Error("Unexpected TzKT game storage shape.");

  const currentSessionId = String(currentSessionIdRaw);
  const potRaw = cs.pot != null ? String(cs.pot) : "0";
  const sessionEndIso = cs.session_end;
  if (typeof sessionEndIso !== "string") throw new Error("Unexpected TzKT session_end.");
  const sessionEndMs = Date.parse(sessionEndIso);
  if (!Number.isFinite(sessionEndMs)) throw new Error("Invalid TzKT session_end.");
  const sessionEnd = Math.floor(sessionEndMs / 1000);
  const claimed = Boolean(cs.claim_requested);

  let lastPlayerTezos: string | null =
    typeof cs.last_player_tezos === "string" ? cs.last_player_tezos : null;
  const lastPlayerBytes: string | null = null;
  let lastPlayerEvmHex: string | null = null;
  if (typeof cs.last_player_evm === "string" && cs.last_player_evm.length > 0) {
    lastPlayerEvmHex = cs.last_player_evm.replace(/^0x/i, "");
  }

  const pendingIds = Array.isArray(raw.pending_session_ids)
    ? raw.pending_session_ids.map((x) => String(x))
    : [];
  const pendingMap = raw.pending_sessions as Record<string, Record<string, unknown>> | undefined;

  const pendingSessions = pendingIds.flatMap((sessionId) => {
    const pv = pendingMap?.[sessionId];
    if (!pv) return [];
    const pendingPotRaw = pv.pot != null ? String(pv.pot) : null;
    const endIso = pv.session_end;
    if (pendingPotRaw == null || typeof endIso !== "string") return [];
    const endMs = Date.parse(endIso);
    if (!Number.isFinite(endMs)) return [];
    const claimRequested = Boolean(pv.claim_requested);
    const winnerTezos = typeof pv.winner_tezos === "string" ? pv.winner_tezos : null;
    const w = typeof pv.winner_evm === "string" ? pv.winner_evm.replace(/^0x/i, "") : "";
    let winnerAddress: string | null = null;
    if (w.length === 40) {
      try {
        winnerAddress = ethers.getAddress("0x" + w);
      } catch {
        winnerAddress = null;
      }
    }
    return [
      {
        sessionId,
        winnerTezos,
        winnerAddress,
        potRaw: pendingPotRaw,
        potDisplay: formatTokenAmount(BigInt(pendingPotRaw), CONFIG.usdcDecimals),
        sessionEnd: Math.floor(endMs / 1000),
        claimRequested,
      },
    ];
  });

  return {
    state: {
      currentSessionId,
      potRaw,
      potDisplay: formatTokenAmount(BigInt(potRaw), CONFIG.usdcDecimals),
      sessionEnd,
      claimed,
      pendingSessions,
      fetchedAt: Date.now(),
    },
    lastPlayerTezos,
    lastPlayerBytes,
    lastPlayerEvmHex,
  };
}

/** Fetch game contract storage (TzKT API on Previewnet; Michelson RPC on testnet). */
async function fetchGameState(): Promise<GameState> {
  const response = await fetch(CONFIG.gameStorageUrl);
  if (!response.ok) throw new Error(`Game service returned ${response.status}.`);

  const json = (await response.json()) as GameStorageJsonNode | Record<string, unknown>;
  const isTzktDecoded =
    json && typeof json === "object" && "current_session_id" in json && !("prim" in json);

  const { state, lastPlayerTezos: tezosStr, lastPlayerBytes, lastPlayerEvmHex } = isTzktDecoded
    ? parseGameStorageFromTzkt(json as Record<string, unknown>)
    : parseGameStorage(json as GameStorageJsonNode);

  let lastPlayerTezos = tezosStr;
  if (!lastPlayerTezos && lastPlayerBytes) {
    try {
      lastPlayerTezos = await tezosAddressFromBinary(lastPlayerBytes);
    } catch {
      /* non-fatal */
    }
  }

  // EVM address comes directly from storage - no log scan or RPC needed.
  let lastPlayerAddress: string | null = null;
  if (lastPlayerEvmHex) {
    try { lastPlayerAddress = ethers.getAddress("0x" + lastPlayerEvmHex); }
    catch { /* non-fatal */ }
  }

  return { ...state, lastPlayerTezos, lastPlayerAddress };
}

async function fetchPayoutTxHash(
  winnerAddress: string | null,
  expectedAmountWei?: bigint | null,
): Promise<string | null> {
  const ethereum = getEvmProvider();
  if (!ethereum) return null;
  try {
    const provider = new ethers.BrowserProvider(ethereum);
    const escrow = new ethers.Contract(CONFIG.potAddress, ESCROW_ABI, provider);
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - PAYOUT_LOG_LOOKBACK_BLOCKS);
    const pickHash = (logs: ethers.Log[]) =>
      logs.length > 0 ? (logs[logs.length - 1].transactionHash ?? null) : null;

    if (winnerAddress) {
      const filterByWinner = escrow.filters.PaidOut(winnerAddress);
      const winnerLogs = await escrow.queryFilter(filterByWinner, fromBlock, "latest");
      if (winnerLogs.length > 0 && expectedAmountWei != null && expectedAmountWei > 0n) {
        const matched = winnerLogs.filter((log) => {
          try {
            const parsed = escrow.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            });
            if (!parsed || parsed.name !== "PaidOut") return false;
            const amt = parsed.args.amount as bigint;
            return amt === expectedAmountWei;
          } catch {
            return false;
          }
        });
        if (matched.length > 0) {
          return pickHash(matched);
        }
      }
      if (winnerLogs.length > 0) {
        return pickHash(winnerLogs);
      }
    }
    const allLogs = await escrow.queryFilter(escrow.filters.PaidOut(), fromBlock, "latest");
    return pickHash(allLogs);
  } catch {
    /* RPC may reject wide log queries */
  }
  return null;
}

async function sleep(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function wakeRelayerService(): Promise<void> {
  if (!relayerWakeUrl) return;
  try {
    await fetch(relayerWakeUrl, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
    });
  } catch {
    /* ignore */
  }
}

function collectErrorText(error: unknown): string {
  const e = error as {
    code?: string;
    message?: string;
    shortMessage?: string;
    reason?: string;
    info?: { error?: { message?: string; data?: unknown } };
    data?: unknown;
  };
  let dataStr = "";
  try {
    if (e?.data != null) dataStr = String(JSON.stringify(e.data)).toLowerCase();
  } catch {
    /* ignore */
  }
  return [
    e?.code,
    e?.message,
    e?.shortMessage,
    e?.reason,
    e?.info?.error?.message,
    dataStr,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** USDC deposit / approve flow - hides raw CALL_EXCEPTION + estimateGas noise. */
function formatPressButtonError(error: unknown): string {
  const e = error as { code?: string; message?: string; shortMessage?: string };
  const parts = collectErrorText(error);

  if (
    e?.code === "ACTION_REJECTED" ||
    parts.includes("user rejected") ||
    parts.includes("user denied")
  ) {
    return "You cancelled the request in your wallet.";
  }

  if (e?.code === "INSUFFICIENT_FUNDS" || parts.includes("insufficient funds")) {
    return "Not enough native coin for gas fees. Add a little XTZ on this network and try again.";
  }

  if (
    e?.code === "CALL_EXCEPTION" ||
    parts.includes("call_exception") ||
    parts.includes("missing revert data") ||
    parts.includes("estimategas")
  ) {
    return (
      `The deposit did not go through. Most often you need at least 1 USDC, the right network (${TEZOSX_EVM_DISPLAY_NAME}), ` +
      "and an approval if the wallet asked for one."
    );
  }

  if (parts.includes("transfer_from_failed") || parts.includes("transferfrom")) {
    return "USDC did not reach the escrow. Keep at least 1 USDC and approve when the wallet asks.";
  }

  if (parts.includes("allowance too low") || parts.includes("allowance")) {
    return "The escrow needs permission to use your USDC. Approve again when your wallet prompts you.";
  }

  if (e?.message === "GAME_SERVICE_UNAVAILABLE") {
    return "We are unable to reach the game service right now. Check your connection and try again in a few minutes.";
  }

  if (e?.message === "GAME_STATE_RELAYER_TIMEOUT") {
    return (
      "Your deposit went through, but the Michelson-interface storage did not update in time. Wait a moment, refresh the page, " +
      "and check the pot size in the stats panel."
    );
  }

  const short = (e?.shortMessage ?? (error instanceof Error ? error.message : "")).trim();
  if (short.length > 0 && short.length < 240 && !parts.includes("missing revert data")) {
    return short;
  }

  return "Something stopped the deposit. Check USDC balance, network, and approval, then try again.";
}

/** Cross-runtime gateway calls (claim, start_session) when not already handled by revert branch. */
function formatGatewayError(error: unknown, kind: "claim" | "start_session"): string {
  const e = error as { code?: string; message?: string; shortMessage?: string };
  const parts = collectErrorText(error);

  if (
    e?.code === "ACTION_REJECTED" ||
    parts.includes("user rejected") ||
    parts.includes("user denied")
  ) {
    return kind === "claim"
      ? "You cancelled the claim in your wallet."
      : "You cancelled the transaction in your wallet.";
  }

  if (e?.code === "INSUFFICIENT_FUNDS" || parts.includes("insufficient funds")) {
    return "Not enough coin for gas. Add funds for fees and try again.";
  }

  if (
    e?.code === "CALL_EXCEPTION" ||
    parts.includes("call_exception") ||
    parts.includes("missing revert data") ||
    parts.includes("estimategas")
  ) {
    return kind === "claim"
      ? `The claim did not send. Check gas, that you are on ${TEZOSX_EVM_DISPLAY_NAME}, then refresh and try again.`
      : `Could not start a new game. Check gas and that you are on ${TEZOSX_EVM_DISPLAY_NAME}, then try again.`;
  }

  return (e?.shortMessage ?? e?.message ?? (kind === "claim" ? "Claim failed." : "Start game failed.")).trim();
}

/** start_session gateway tx: map common Michelson failwith strings before generic gateway text. */
function formatStartSessionError(error: unknown): string {
  const parts = collectErrorText(error);
  if (parts.includes("action_rejected") || parts.includes("user rejected") || parts.includes("user denied")) {
    return "You cancelled the transaction in your wallet.";
  }
  if (parts.includes("insufficient funds")) {
    return "Not enough coin for gas. Add funds for fees and try again.";
  }
  if (parts.includes("session_active")) {
    return "This round is still active on-chain. Wait until the timer finishes, refresh the page, then tap Play again.";
  }
  if (parts.includes("invalid_duration")) {
    return "The network rejected the session settings. Refresh and try again.";
  }
  if (parts.includes("inconsistent_current_session")) {
    return "Game state could not be updated. Refresh the page and try again.";
  }
  return formatGatewayError(error, "start_session");
}

function PotzLuckMark() {
  return <>Potluck</>;
}

function App() {
  const [walletState, setWalletState] = useState<WalletState>({
    address: null,
    chainId: null,
    usdcBalance: null,
    usdcAllowance: null,
    usdcBalanceRaw: null,
    xtzBalanceRaw: null,
  });
  /** When true, `refreshWalletState(false)` returns an empty wallet (user chose Disconnect). Ref is synchronous so connect + airdrop never races React state. */
  const isWalletDisconnectedRef = useRef(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameStateError, setGameStateError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Session id currently submitting a claim tx; other sessions keep a normal Claim button. */
  const [claimingForSessionId, setClaimingForSessionId] = useState<string | null>(null);
  /** Same as `claimingForSessionId` for async payout notifier (avoids stale effect closures). */
  const claimingForSessionIdRef = useRef<string | null>(null);
  claimingForSessionIdRef.current = claimingForSessionId;
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [actionState, setActionState] = useState<ActionState>({
    kind: "idle",
    message: "Connect your wallet, then press the button to send 1 USDC into the escrow.",
  });

  const [shellView, setShellView] = useState<"landing" | "game" | "sessions">("landing");
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const [networkInfoOpen, setNetworkInfoOpen] = useState(false);
  const [airdropModalState, setAirdropModalState] = useState<{ open: boolean; usdc: boolean; xtz: boolean }>({
    open: false,
    usdc: false,
    xtz: false,
  });
  const [depositFxId, setDepositFxId] = useState(0);
  /** `null` = discovery not run yet; length 0 = no provider */
  const [eip6963Wallets, setEip6963Wallets] = useState<Eip6963ProviderDetail[] | null>(null);
  const selectedWalletRdnsRef = useRef<string | null>(null);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [connectWalletOptions, setConnectWalletOptions] = useState<Eip6963ProviderDetail[]>([]);
  /** Bumps so wallet listener effect re-binds to the selected EIP-1193 provider. */
  const [evmListenerKey, setEvmListenerKey] = useState(0);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>(() => readStoredEventLog());
  const pushEventLog = useCallback(
    (
      msg: string,
      tone: EventLogTone = "info",
      evmTxHash?: string,
      tezosOpsUrl?: string,
      relatedUrl?: string,
      relatedLabel?: string,
    ) => {
      setEventLog((prev) => [
        ...prev.slice(-19),
        {
          id: createEventLogEntryId(),
          msg,
          tone,
          ...(evmTxHash ? { txHash: evmTxHash } : {}),
          ...(tezosOpsUrl ? { tezosOpsUrl } : {}),
          ...(relatedUrl
            ? { relatedUrl, ...(relatedLabel ? { relatedLabel } : { relatedLabel: "Escrow contract ↗" }) }
            : {}),
        },
      ]);
    },
    [],
  );

  useEffect(() => {
    writeStoredEventLog(eventLog);
  }, [eventLog]);

  const dismissAirdropModal = useCallback(() => {
    setAirdropModalState({ open: false, usdc: false, xtz: false });
  }, []);

  const dismissDepositFx = useCallback(() => {
    setDepositFxId(0);
  }, []);
  const depositInFlightRef = useRef(false);
  const freezeGameStateUiRef = useRef(false);
  /** After start_session + wait, onPotClick sets "Game ready…" then calls pressButton — avoid a redundant "Loading game state…" event-log line. */
  const skipMichelsonLoadingStatusAfterGameReadyRef = useRef(false);

  const hasInjectedWallet =
    typeof window === "undefined" || eip6963Wallets === null || eip6963Wallets.length > 0;
  const onExpectedNetwork = walletState.chainId === CONFIG.chainId;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sessionActive = gameState ? gameState.sessionEnd > nowSeconds : true;
  /** "Pot size was" only when the round has ended and Michelson still shows a non-zero pot (e.g. unclaimed); 0 USDC after payout stays "Pot size". */
  const potSidebarLabel =
    gameState && !sessionActive && michelsonPotHasFunds(gameState.potRaw) ? "Pot size was" : "Pot size";
  const claimTargetSession = getClaimTargetSession(gameState, walletState.address, nowSeconds);
  const unresolvedSessions = useMemo(
    () => [...(gameState?.pendingSessions ?? [])].sort(compareSessionIdsDesc),
    [gameState?.pendingSessions],
  );
  const sidebarPendingSessions = useMemo(() => unresolvedSessions.slice(0, 5), [unresolvedSessions]);
  const canPressButton =
    hasInjectedWallet &&
    Boolean(walletState.address) &&
    onExpectedNetwork &&
    !isSubmitting &&
    sessionActive &&
    !gameState?.claimed;

  const claimInProgressForCurrentTarget =
    Boolean(claimTargetSession && claimingForSessionId === claimTargetSession.sessionId);

  const claimInProgressForCurrentRoundButton =
    Boolean(
      claimTargetSession?.source === "current" &&
        claimingForSessionId === claimTargetSession.sessionId,
    );

  const canClaim =
    hasInjectedWallet &&
    Boolean(walletState.address) &&
    onExpectedNetwork &&
    !claimInProgressForCurrentTarget &&
    claimTargetSession != null;

  /**
   * Primary “Claim Winnings” under the live round stats — only when the **current** Michelson round ended and this
   * wallet won it. Pending-map wins use per-row Claim only. Stays visible while that claim tx is in flight.
   */
  const canShowClaimCurrentRoundButton =
    hasInjectedWallet &&
    Boolean(walletState.address) &&
    onExpectedNetwork &&
    claimTargetSession != null &&
    claimTargetSession.source === "current" &&
    (claimingForSessionId === null || claimingForSessionId === claimTargetSession.sessionId);

  // Session ended: allow starting a new round even if prior claim/payout is still pending (on-chain reset).
  const canStartNewSession =
    hasInjectedWallet &&
    Boolean(walletState.address) &&
    onExpectedNetwork &&
    !isStartingSession &&
    Boolean(gameState) &&
    !sessionActive;

  const potUiState = useMemo<
    "connect" | "wrong-net" | "idle" | "play" | "depositing" | "won"
  >(() => {
    if (!walletState.address) return "connect";
    if (!onExpectedNetwork) return "wrong-net";
    if (isSubmitting || isStartingSession) return "depositing";
    if (sessionActive && gameState && !gameState.claimed) return "play";
    return "idle";
  }, [
    walletState.address,
    onExpectedNetwork,
    isSubmitting,
    isStartingSession,
    sessionActive,
    gameState,
  ]);

  const [ringTick, setRingTick] = useState(0);
  useEffect(() => {
    if (shellView !== "game" || !gameState) return;
    const id = window.setInterval(() => setRingTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [shellView, gameState]);

  const potRingProgress = useMemo(() => {
    if (!sessionActive || !gameState || gameState.sessionEnd <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    void ringTick;
    const now = Math.floor(Date.now() / 1000);
    const left = Math.max(0, gameState.sessionEnd - now);
    return Math.min(1, left / DEFAULT_SESSION_DURATION_SEC);
  }, [sessionActive, gameState, ringTick]);

  const sessionLabel = useMemo(() => {
    if (!gameState) return "Loading...";
    void ringTick;
    const now = Math.floor(Date.now() / 1000);
    const delta = gameState.sessionEnd - now;
    if (delta > 0) {
      return `Ends in ${formatClockDuration(delta)}`;
    }
    return formatEndedAgo(Math.abs(delta));
  }, [gameState, ringTick]);

  const lastEventLogKey = useRef("");
  /** Dedupes passive vs claim-click logs for “only last player can claim”. */
  const claimMismatchDedupeKeyRef = useRef("");
  /** Session targeted by the in-flight gateway claim tx (for revert handling). */
  const claimAttemptTargetRef = useRef<ClaimTargetSession | null>(null);
  useEffect(() => {
    if (actionState.kind === "idle") return;
    // Payout success is pushed from the payout watcher effect (not mirrored here) so it can attach the payout tx hash.
    if (actionState.kind === "success" && isPayoutSuccessLogMessage(actionState.message)) {
      return;
    }
    if (actionState.kind === "error" && actionState.message.startsWith(CLAIM_MISMATCH_LOG_PREFIX)) {
      return;
    }
    if (actionState.kind === "error" && actionState.message === TEZOS_X_EVM_WALLET_HINT) {
      return;
    }
    if (actionState.kind === "pending" && actionState.message === CONNECT_WALLET_CHECKING_MSG) {
      return;
    }
    if (actionState.kind === "pending" && actionState.message.startsWith(DEPOSIT_MICHELSON_SYNC_LOG_PREFIX)) {
      const txHash = actionState.txHash;
      const tezosOpsUrl = actionState.tezosOpsUrl;
      const relatedUrl = actionState.relatedUrl;
      setEventLog((prev) => {
        const last = prev[prev.length - 1];
        const sameTickLine =
          last &&
          last.tone === "info" &&
          last.msg.startsWith(DEPOSIT_MICHELSON_SYNC_LOG_PREFIX) &&
          last.txHash === txHash &&
          last.tezosOpsUrl === tezosOpsUrl;
        if (sameTickLine) {
          return [...prev.slice(0, -1), { ...last, msg: actionState.message }];
        }
        const entry: EventLogEntry = {
          id: createEventLogEntryId(),
          msg: actionState.message,
          tone: "info",
          ...(txHash ? { txHash } : {}),
          ...(tezosOpsUrl ? { tezosOpsUrl } : {}),
          ...(relatedUrl
            ? { relatedUrl, relatedLabel: "Escrow contract ↗" as const }
            : {}),
        };
        return [...prev.slice(-19), entry];
      });
      lastEventLogKey.current = `pending:deposit_michelson_sync:${txHash ?? ""}:${tezosOpsUrl ?? ""}:${relatedUrl ?? ""}`;
      return;
    }
    const relatedUrl = "relatedUrl" in actionState ? actionState.relatedUrl : undefined;
    const key = `${actionState.kind}:${actionState.message}:${actionState.txHash ?? ""}:${actionState.tezosOpsUrl ?? ""}:${relatedUrl ?? ""}`;
    if (key === lastEventLogKey.current) return;
    lastEventLogKey.current = key;
    pushEventLog(
      actionState.message,
      actionState.kind === "success" ? "success" : actionState.kind === "error" ? "error" : "info",
      actionState.txHash,
      actionState.tezosOpsUrl,
      relatedUrl,
    );
  }, [actionState, pushEventLog]);

  /** Payout waiting / complete messages go to the event log (not session cards); ids persisted so refresh does not duplicate. */
  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    if (!gameState || !walletState.address) return;
    const addr = walletState.address;

    const waitSet = readStringIdSet(PAYOUT_WAIT_IDS_KEY);
    const doneSet = readStringIdSet(PAYOUT_DONE_IDS_KEY);
    let meta = readPayoutPotMeta();

    for (const session of gameState.pendingSessions) {
      if (!addressesEqual(session.winnerAddress, addr) || !session.claimRequested) continue;
      const sid = session.sessionId;
      if (doneSet.has(sid)) continue;
      if (!waitSet.has(sid)) {
        waitSet.add(sid);
        meta = { ...meta, [sid]: { potRaw: session.potRaw, potDisplay: session.potDisplay } };
        if (claimingForSessionId !== sid) {
          const k = `${PASSIVE_CLAIM_WAIT_LOG_KEY_PREFIX}${sid}`;
          if (sessionStorage.getItem(k) !== "1") {
            sessionStorage.setItem(k, "1");
            pushEventLog(`Game #${sid}: Claim on record. Waiting for relayer payout…`, "info");
          }
        }
      }
    }

    const nowSecRel = Math.floor(Date.now() / 1000);
    if (hasCurrentClaimInFlight(gameState, addr, nowSecRel)) {
      const sid = gameState.currentSessionId;
      if (!doneSet.has(sid) && !waitSet.has(sid)) {
        const coveredByPending = gameState.pendingSessions.some(
          (s) =>
            s.sessionId === sid &&
            addressesEqual(s.winnerAddress, addr) &&
            s.claimRequested,
        );
        if (!coveredByPending) {
          waitSet.add(sid);
          meta = { ...meta, [sid]: { potRaw: gameState.potRaw, potDisplay: gameState.potDisplay } };
          if (claimingForSessionId !== sid) {
            const k = `${PASSIVE_CLAIM_WAIT_LOG_KEY_PREFIX}${sid}`;
            if (sessionStorage.getItem(k) !== "1") {
              sessionStorage.setItem(k, "1");
              pushEventLog(`Game #${sid}: Claim on record. Waiting for relayer payout…`, "info");
            }
          }
        }
      }
    }

    writeStringIdSet(PAYOUT_WAIT_IDS_KEY, waitSet);
    writePayoutPotMeta(meta);

    const toComplete: string[] = [];
    for (const sid of waitSet) {
      if (doneSet.has(sid)) continue;
      const still = gameState.pendingSessions.some((s) => s.sessionId === sid);
      if (!still) toComplete.push(sid);
    }

    if (toComplete.length === 0) return;

    for (const sid of toComplete) {
      waitSet.delete(sid);
      const m = meta[sid];
      meta = Object.fromEntries(Object.entries(meta).filter(([k]) => k !== sid)) as PayoutPotMeta;
      void (async () => {
        if (claimingForSessionIdRef.current === sid) return;
        const payoutHash = await fetchPayoutTxHash(addr, m?.potRaw ? BigInt(m.potRaw) : null);
        const disp = m?.potDisplay ?? "—";
        if (readStringIdSet(PAYOUT_DONE_IDS_KEY).has(sid)) return;
        pushEventLog(
          formatPotPayoutSuccessMessage(sid, disp !== "—" && disp !== "0" ? disp : null),
          "success",
          payoutHash ?? undefined,
        );
        markPayoutSessionCompletedInStorage(sid);
      })();
    }

    writeStringIdSet(PAYOUT_WAIT_IDS_KEY, waitSet);
    writeStringIdSet(PAYOUT_DONE_IDS_KEY, doneSet);
    writePayoutPotMeta(meta);
  }, [gameState, walletState.address, pushEventLog, claimingForSessionId]);

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

  useEffect(() => {
    try {
      if (sessionStorage.getItem("potzluck_skip_landing") === "1") {
        setShellView("game");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const refreshWalletState = useCallback(async (requestAccounts = false) => {
    if (isWalletDisconnectedRef.current && !requestAccounts) {
      const emptyState = {
        address: null,
        chainId: null,
        usdcBalance: null,
        usdcAllowance: null,
        usdcBalanceRaw: null,
        xtzBalanceRaw: null,
      } satisfies WalletState;
      setWalletState(emptyState);
      return emptyState;
    }

    const ethereum = getEvmProvider();
    if (!ethereum) {
      const emptyState = {
        address: null,
        chainId: null,
        usdcBalance: null,
        usdcAllowance: null,
        usdcBalanceRaw: null,
        xtzBalanceRaw: null,
      } satisfies WalletState;
      setWalletState(emptyState);
      setWalletError(null);
      return emptyState;
    }

    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = (await provider.send(
        requestAccounts ? "eth_requestAccounts" : "eth_accounts",
        [],
      )) as string[];

      if (accounts.length === 0) {
        const emptyState = {
          address: null,
          chainId: null,
          usdcBalance: null,
          usdcAllowance: null,
          usdcBalanceRaw: null,
          xtzBalanceRaw: null,
        } satisfies WalletState;
        setWalletState(emptyState);
        setWalletError(null);
        return emptyState;
      }

      const address = ethers.getAddress(accounts[0]);
      const currentChainId = await readChainIdFromProvider(provider);

      if (currentChainId !== CONFIG.chainId) {
        const nextState = {
          address,
          chainId: currentChainId,
          usdcBalance: null,
          usdcAllowance: null,
          usdcBalanceRaw: null,
          xtzBalanceRaw: null,
        } satisfies WalletState;
        setWalletState(nextState);
        setWalletError(TEZOS_X_EVM_WALLET_HINT);
        return nextState;
      }

      const usdc = new ethers.Contract(CONFIG.usdcAddress, ERC20_ABI, provider);
      try {
        const [xtzBalance, balance, allowance] = await Promise.all([
          provider.getBalance(address),
          usdc.balanceOf(address) as Promise<bigint>,
          usdc.allowance(address, CONFIG.potAddress) as Promise<bigint>,
        ]);
        const nextState = {
          address,
          chainId: currentChainId,
          usdcBalance: formatTokenAmount(balance, CONFIG.usdcDecimals),
          usdcAllowance: allowance,
          usdcBalanceRaw: balance,
          xtzBalanceRaw: xtzBalance,
        } satisfies WalletState;
        setWalletState(nextState);
        setWalletError(null);
        return nextState;
      } catch (contractErr) {
        if (isBadContractRpcResultError(contractErr)) {
          setWalletError(TEZOS_X_EVM_WALLET_HINT);
        } else {
          setWalletError(
            contractErr instanceof Error ? contractErr.message : "Failed to load USDC balance.",
          );
        }
        const nextState = {
          address,
          chainId: currentChainId,
          usdcBalance: null,
          usdcAllowance: null,
          usdcBalanceRaw: null,
          xtzBalanceRaw: null,
        } satisfies WalletState;
        setWalletState(nextState);
        return nextState;
      }
    } catch (error) {
      if (isUserRejectedWalletError(error)) {
        setWalletError(null);
      } else if (isBadContractRpcResultError(error)) {
        setWalletError(TEZOS_X_EVM_WALLET_HINT);
      } else {
        setWalletError(error instanceof Error ? error.message : "Failed to connect wallet.");
      }
      const emptyState = {
        address: null,
        chainId: null,
        usdcBalance: null,
        usdcAllowance: null,
        usdcBalanceRaw: null,
        xtzBalanceRaw: null,
      } satisfies WalletState;
      setWalletState(emptyState);
      return emptyState;
    }
  }, []);

  const refreshGameState = useCallback(async (syncUi = true, bypassFreeze = false) => {
    try {
      const nextState = await fetchGameState();
      if (syncUi && (bypassFreeze || !freezeGameStateUiRef.current)) {
        setGameState(nextState);
      }
      setGameStateError(null);
      return nextState;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch game state.";
      setGameStateError(message);
      return null;
    }
  }, []);

  /** Poll until Michelson-interface storage shows an active, unclaimed round (e.g. after start_session confirms on EVM). */
  const waitForActiveRound = useCallback(
    async (timeoutMs = CONFIG.gameStateWaitTimeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const s = await refreshGameState();
        if (s) {
          const nowSec = Math.floor(Date.now() / 1000);
          if (s.sessionEnd > nowSec && !s.claimed) {
            return s;
          }
        }
        await sleep(Math.min(CONFIG.pollIntervalMs, Math.max(0, deadline - Date.now())));
      }
      return null;
    },
    [refreshGameState],
  );

  /** When already on the configured Tezos X EVM stack: top up USDC/XTZ via airdrop API if balances are zero. */
  const ensureNetworkFundsIfNeeded = useCallback(
    async (wallet: WalletState): Promise<{ willAirdrop: boolean; needsUsdc: boolean; needsXtz: boolean }> => {
      if (!wallet.address || wallet.chainId !== CONFIG.chainId) {
        return { willAirdrop: false, needsUsdc: false, needsXtz: false };
      }
      const relayerWallet = isRelayerWalletLocallyMarked(wallet);
      const needsUsdcAirdrop =
        wallet.usdcBalanceRaw == null || wallet.usdcBalanceRaw === 0n;
      const needsXtzAirdrop =
        relayerWallet
          ? !hasRelayerXtzAirdropFlag(wallet)
          : wallet.xtzBalanceRaw == null || wallet.xtzBalanceRaw === 0n;
      const willAirdrop = needsUsdcAirdrop || needsXtzAirdrop;
      if (!willAirdrop) {
        return { willAirdrop: false, needsUsdc: false, needsXtz: false };
      }
      setActionState({
        kind: "pending",
        message: `Your wallet needs ${stackShortLabel(CONFIG.stack)} USDC or XTZ — requesting an airdrop…`,
      });
      const result = await requestAirdrop(wallet.address, {
        xtz: needsXtzAirdrop,
        usdc: needsUsdcAirdrop,
      });
      if (relayerWallet && needsXtzAirdrop) {
        markRelayerXtzAirdropped(wallet.address, wallet.chainId);
      }
      await refreshWalletState(false);
      pushEventLog(
        formatAirdropSuccessLog(result, stackShortLabel(CONFIG.stack), {
          usdcAmount: AIRDROP_USDC_AMOUNT,
          xtzAmount: AIRDROP_XTZ_AMOUNT,
        }) ??
          airdropDeliveredLogMessage(needsUsdcAirdrop, needsXtzAirdrop, stackShortLabel(CONFIG.stack)),
        "success",
      );
      setAirdropModalState({
        open: true,
        xtz: needsXtzAirdrop,
        usdc: needsUsdcAirdrop,
      });
      return { willAirdrop: true, needsUsdc: needsUsdcAirdrop, needsXtz: needsXtzAirdrop };
    },
    [refreshWalletState, pushEventLog],
  );

  useEffect(() => {
    void (async () => {
      const d = await discoverEip6963Wallets();
      setEip6963Wallets(d);
      const saved = getSavedWalletRdns();
      if (saved) {
        selectedWalletRdnsRef.current = saved;
        const m = findDetailBySavedRdns(d, saved);
        if (m) {
          setSelectedEvmProvider(m.provider as SelectedEthereumProvider);
          setEvmListenerKey((k) => k + 1);
        }
      }
    })();
  }, []);

  useEffect(() => {
    void refreshWalletState(false);
    void refreshGameState();

    const intervalId = window.setInterval(() => {
      void refreshGameState();
    }, CONFIG.pollIntervalMs);

    const ethereum = getEvmProvider();
    if (!ethereum?.on) {
      return () => window.clearInterval(intervalId);
    }

    const handleAccountsChanged = () => {
      isWalletDisconnectedRef.current = false;
      void refreshWalletState(false);
    };

    const handleChainChanged = () => {
      isWalletDisconnectedRef.current = false;
      void refreshWalletState(false);
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.clearInterval(intervalId);
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [refreshGameState, refreshWalletState, evmListenerKey]);

  function applySelectedProvider(detail: Eip6963ProviderDetail) {
    setSelectedEvmProvider(detail.provider as SelectedEthereumProvider);
    const rdns = detail.info.rdns || detail.info.uuid;
    selectedWalletRdnsRef.current = rdns;
    saveWalletRdns(rdns);
    setEvmListenerKey((k) => k + 1);
  }

  async function runConnectCore() {
    const ethereum = getEvmProvider();
    if (!ethereum) {
      const msg =
        "No browser wallet was found. Install a wallet extension (for example MetaMask), or open this page in your wallet’s in-app browser, then press Connect again.";
      pushEventLog(msg, "error");
      setActionState({ kind: "error", message: msg });
      return;
    }

    let accounts: string[];
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      accounts = (await provider.send("eth_requestAccounts", [])) as string[];
    } catch (error) {
      if (isUserRejectedWalletError(error)) {
        const msg =
          "Your wallet did not approve access (you may have rejected the request or closed the prompt). Press Connect to try again.";
        pushEventLog(msg, "info");
        setActionState({
          kind: "idle",
          message: "Connect your wallet, then press the button to send 1 USDC into the escrow.",
        });
        return;
      }
      if (isWalletNetworkSetupError(error)) {
        pushEventLog(TEZOS_X_EVM_WALLET_HINT, "error");
        setActionState({ kind: "error", message: TEZOS_X_EVM_WALLET_HINT });
        setNetworkInfoOpen(true);
        return;
      }
      const msg =
        error instanceof Error ? error.message : "Could not reach your wallet. Unlock it and try Connect again.";
      pushEventLog(msg, "error");
      setActionState({ kind: "error", message: msg });
      return;
    }

    if (accounts.length === 0) {
      const msg =
        "Your wallet returned no account. Unlock it, allow this site, or pick an active account, then press Connect again.";
      pushEventLog(msg, "error");
      setActionState({ kind: "error", message: msg });
      return;
    }

    let connectedWallet = await refreshWalletState(false);
    if (!connectedWallet?.address) {
      const msg =
        "Could not read your wallet after it connected. Unlock your wallet, check that you are on a supported network, and try Connect again.";
      pushEventLog(msg, "error");
      setActionState({ kind: "error", message: msg });
      return;
    }

    if (connectedWallet.chainId !== CONFIG.chainId) {
      setActionState({
        kind: "pending",
        message: CONFIRM_APP_CHAIN_SWITCH_MSG,
      });
      const switched = await requestAppChainSwitch();
      if (!switched) {
        await refreshWalletState(false);
        pushEventLog(TEZOS_X_EVM_WALLET_HINT, "error");
        setActionState({ kind: "error", message: TEZOS_X_EVM_WALLET_HINT });
        return;
      }
      connectedWallet = await refreshWalletState(false);
      if (!connectedWallet?.address || connectedWallet.chainId !== CONFIG.chainId) {
        pushEventLog(TEZOS_X_EVM_WALLET_HINT, "error");
        setActionState({ kind: "error", message: TEZOS_X_EVM_WALLET_HINT });
        return;
      }
    }

    if (isTezosRelayerProviderLike(getEvmProvider(), selectedWalletRdnsRef.current)) {
      markRelayerWallet(connectedWallet.address, connectedWallet.chainId);
    }

    const funded = await ensureNetworkFundsIfNeeded(connectedWallet);
    const { willAirdrop } = funded;

    if (willAirdrop) {
      setActionState({
        kind: "pending",
        message: "Previewnet airdrop complete. Waiting for your wallet balance to update…",
      });
    }
    const wAfterFunds = await refreshWalletUntilPlayBalancesVisible(willAirdrop, () => refreshWalletState(false));
    let insufficientMsg = getInsufficientPlayFundsEventLogMessage(wAfterFunds);
    if (willAirdrop && insufficientMsg) {
      insufficientMsg = AIRDROP_BALANCE_SYNC_PENDING_MESSAGE;
    }

    const latestGameState = await refreshGameState();
    if (!latestGameState) {
      setActionState({
        kind: "error",
        message: "Could not load game state. Refresh and try again.",
      });
      return;
    }

    if (insufficientMsg) {
      pushEventLog(insufficientMsg, "error");
      pushEventLog(
        `You can get ${stackShortLabel(CONFIG.stack)} funds at ${faucetUrl.replace(/\/$/, "")} or reconnect after acquiring USDC and XTZ for this network.`,
        "info",
      );
    } else {
      pushEventLog(
        willAirdrop
          ? `${stackShortLabel(CONFIG.stack)} funds are in your wallet. Click Play when you are ready to start or join a game.`
          : "Wallet connected on Tezos X. Click Play when you are ready to deposit or start a new game.",
        "info",
      );
    }

    setActionState({
      kind: "idle",
      message: insufficientMsg
        ? `Add at least ${CONFIG.pressAmount} USDC and a little XTZ for gas, then try Play.`
        : `Click Play to start or join a game and send ${CONFIG.pressAmount} USDC into the pot when you are ready.`,
    });
  }

  async function connectWallet() {
    setWalletError(null);
    setIsConnecting(true);
    isWalletDisconnectedRef.current = false;
    pushEventLog(CONNECT_WALLET_CHECKING_MSG, "info");
    setActionState({
      kind: "pending",
      message: CONNECT_WALLET_CHECKING_MSG,
    });

    const discovered = await discoverEip6963Wallets();
    setEip6963Wallets(discovered);

    if (discovered.length === 0) {
      const msg =
        "No browser wallet was found. Install a wallet extension (for example MetaMask), or open this page in your wallet’s in-app browser, then press Connect again.";
      pushEventLog(msg, "error");
      setActionState({ kind: "error", message: msg });
      setIsConnecting(false);
      return;
    }

    if (discovered.length > 1) {
      setConnectWalletOptions(discovered);
      setWalletPickerOpen(true);
      return;
    }

    applySelectedProvider(discovered[0]);

    try {
      await runConnectCore();
    } catch (error) {
      if (error instanceof Error && (error.message === "AIRDROP_NOT_CONFIGURED" || error.message.startsWith("AIRDROP_FAILED:"))) {
        setActionState({ kind: "error", message: formatAirdropError(error, stackShortLabel(CONFIG.stack)) });
      } else if (isWalletNetworkSetupError(error)) {
        pushEventLog(TEZOS_X_EVM_WALLET_HINT, "error");
        setActionState({ kind: "error", message: TEZOS_X_EVM_WALLET_HINT });
        setNetworkInfoOpen(true);
      } else {
        setActionState({
          kind: "error",
          message: error instanceof Error ? error.message : "Something went wrong while connecting.",
        });
      }
    } finally {
      setIsConnecting(false);
    }
  }

  function handleWalletPickerSelect(detail: Eip6963ProviderDetail) {
    setWalletPickerOpen(false);
    applySelectedProvider(detail);
    void (async () => {
      try {
        await runConnectCore();
      } catch (error) {
        if (error instanceof Error && (error.message === "AIRDROP_NOT_CONFIGURED" || error.message.startsWith("AIRDROP_FAILED:"))) {
          setActionState({ kind: "error", message: formatAirdropError(error, stackShortLabel(CONFIG.stack)) });
        } else if (isWalletNetworkSetupError(error)) {
          pushEventLog(TEZOS_X_EVM_WALLET_HINT, "error");
          setActionState({ kind: "error", message: TEZOS_X_EVM_WALLET_HINT });
          setNetworkInfoOpen(true);
        } else {
          setActionState({
            kind: "error",
            message: error instanceof Error ? error.message : "Something went wrong while connecting.",
          });
        }
      } finally {
        setIsConnecting(false);
      }
    })();
  }

  function handleWalletPickerClose() {
    setWalletPickerOpen(false);
    setIsConnecting(false);
    setActionState({
      kind: "idle",
      message: "Connect your wallet, then press the button to send 1 USDC into the escrow.",
    });
  }

  async function runAfterNetworkSwitchToTezosX() {
    isWalletDisconnectedRef.current = false;
    const w = await refreshWalletState(false);
    if (!w.address || w.chainId !== CONFIG.chainId) {
      return;
    }
    if (isTezosRelayerProviderLike(getEvmProvider(), selectedWalletRdnsRef.current)) {
      markRelayerWallet(w.address, w.chainId);
    }
    pushEventLog(
      `${TEZOSX_EVM_DISPLAY_NAME} is now selected in your wallet — checking balances for ${stackShortLabel(CONFIG.stack)} funds…`,
      "info",
    );
    const { willAirdrop } = await ensureNetworkFundsIfNeeded(w);
    if (willAirdrop) {
      setActionState({
        kind: "pending",
        message: "Previewnet airdrop complete. Waiting for your wallet balance to update…",
      });
    }
    const wAfterFunds = await refreshWalletUntilPlayBalancesVisible(willAirdrop, () => refreshWalletState(false));
    let insufficientMsg = getInsufficientPlayFundsEventLogMessage(wAfterFunds);
    if (willAirdrop && insufficientMsg) {
      insufficientMsg = AIRDROP_BALANCE_SYNC_PENDING_MESSAGE;
    }

    const latestGameState = await refreshGameState();
    if (!latestGameState) {
      setActionState({
        kind: "error",
        message: "Could not load game state. Refresh and try again.",
      });
      return;
    }
    if (insufficientMsg) {
      pushEventLog(insufficientMsg, "error");
      pushEventLog(
        `You can get ${stackShortLabel(CONFIG.stack)} funds at ${faucetUrl.replace(/\/$/, "")} or reconnect after acquiring USDC and XTZ for this network.`,
        "info",
      );
    } else {
      pushEventLog(
        willAirdrop
          ? `${stackShortLabel(CONFIG.stack)} funds are in your wallet. Click Play when you are ready to start or join a game.`
          : `Network ready on ${TEZOSX_EVM_DISPLAY_NAME}. Click Play when you are ready to deposit or start a new game.`,
        "info",
      );
    }
    setActionState({
      kind: "idle",
      message: insufficientMsg
        ? `Add at least ${CONFIG.pressAmount} USDC and a little XTZ for gas, then try Play.`
        : `Click Play to start or join a game and send ${CONFIG.pressAmount} USDC into the pot when you are ready.`,
    });
  }

  async function disconnectWallet() {
    const ethereum = getEvmProvider();
    if (ethereum?.request) {
      try {
        await ethereum.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // wallet_revokePermissions may not be supported by all wallets
      }
    }
    isWalletDisconnectedRef.current = true;
    setSelectedEvmProvider(null);
    selectedWalletRdnsRef.current = null;
    clearSavedWalletRdns();
    setEvmListenerKey((k) => k + 1);
    setWalletError(null);
    setWalletState({
      address: null,
      chainId: null,
      usdcBalance: null,
      usdcAllowance: null,
      usdcBalanceRaw: null,
      xtzBalanceRaw: null,
    });
    setActionState({
      kind: "idle",
      message: "Wallet disconnected. Connect again to keep going.",
    });
  }

  /**
   * `wallet_switchEthereumChain` to the app’s chain, or add+switch if the chain isn’t in the wallet.
   * Does not show the wrong-network app message; callers decide what to do on `false` (e.g. reject, hint).
   */
  async function requestAppChainSwitch(): Promise<boolean> {
    const ethereum = getEvmProvider();
    if (!ethereum) {
      return false;
    }
    const addChainParam = {
      chainId: CONFIG.chainIdHex,
      chainName: TEZOSX_EVM_DISPLAY_NAME,
      rpcUrls: [CONFIG.evmRpc],
      nativeCurrency: {
        name: "XTZ",
        symbol: "XTZ",
        decimals: 18,
      },
      blockExplorerUrls: [CONFIG.evmExplorerUrl],
    } as const;

    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CONFIG.chainIdHex }],
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
            params: [{ chainId: CONFIG.chainIdHex }],
          });
          return true;
        } catch (addOrSwitchErr) {
          if (isUserRejectedWalletError(addOrSwitchErr)) {
            return false;
          }
          const detail =
            addOrSwitchErr instanceof Error ? addOrSwitchErr.message : String(addOrSwitchErr);
          pushEventLog(
            `Could not add ${TEZOSX_EVM_DISPLAY_NAME} in your wallet. In Rabby, ${walletAddNetworkHelpRabby(CONFIG.stack)}, then try again. ${detail}`,
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

  async function switchNetwork() {
    const ok = await requestAppChainSwitch();
    if (!ok) {
      return;
    }

    try {
      await runAfterNetworkSwitchToTezosX();
    } catch (error) {
      if (error instanceof Error && (error.message === "AIRDROP_NOT_CONFIGURED" || error.message.startsWith("AIRDROP_FAILED:"))) {
        setActionState({ kind: "error", message: formatAirdropError(error, stackShortLabel(CONFIG.stack)) });
      } else {
        throw error;
      }
    }
  }

  async function waitForGameStateUpdate(
    previousState: GameState,
    stepDefs: FlowStepDef[],
    depositTxHash: string,
  ) {
    const deadline = Date.now() + CONFIG.gameStateWaitTimeoutMs;
    const t0 = Date.now();
    let relayerWakeTriggered = false;

    const updateGameSyncProgress = () => {
      const elapsed = Math.floor((Date.now() - t0) / 1000);
      setActionState({
        kind: "pending",
        message: `${DEPOSIT_MICHELSON_SYNC_LOG_PREFIX} (${elapsed}s)`,
        steps: markFlowSteps(stepDefs, "relayer_cross_runtime"),
        txHash: depositTxHash,
      });
    };

    updateGameSyncProgress();

    while (true) {
      const now = Date.now();
      if (now >= deadline) {
        throw new Error("GAME_STATE_RELAYER_TIMEOUT");
      }
      const sleepMs = Math.min(CONFIG.pollIntervalMs, deadline - now);
      await sleep(sleepMs);
      updateGameSyncProgress();
      const elapsedMs = Date.now() - t0;
      if (!relayerWakeTriggered && elapsedMs >= 8_000) {
        relayerWakeTriggered = true;
        pushEventLog(
          "This is taking longer than usual. Waking up the sync service now…",
          "info",
        );
        void wakeRelayerService();
      }
      let nextState: GameState;
      try {
        nextState = await fetchGameState();
      } catch {
        throw new Error("GAME_SERVICE_UNAVAILABLE");
      }
      setGameStateError(null);

      if (BigInt(nextState.potRaw) > BigInt(previousState.potRaw)) {
        return nextState;
      }
      if (Date.now() >= deadline) {
        throw new Error("GAME_STATE_RELAYER_TIMEOUT");
      }
    }
  }

  async function waitForClaimSettlement(target: ClaimTargetSession): Promise<GameState | null> {
    const deadline = Date.now() + CONFIG.gameStateWaitTimeoutMs;

    while (Date.now() < deadline) {
      await sleep(Math.min(CONFIG.pollIntervalMs, Math.max(0, deadline - Date.now())));
      const nextState = await refreshGameState(true, true);
      if (!nextState) {
        continue;
      }
      if (isClaimSettled(nextState, target)) {
        return nextState;
      }
    }

    return null;
  }

  async function pressButton() {
    if (depositInFlightRef.current) {
      return;
    }
    depositInFlightRef.current = true;
    const useGameReadyLineForPrepare = skipMichelsonLoadingStatusAfterGameReadyRef.current;
    skipMichelsonLoadingStatusAfterGameReadyRef.current = false;

    const ethereum = getEvmProvider();
    if (!ethereum) {
      setActionState({ kind: "error", message: "No browser wallet is available in this browser." });
      depositInFlightRef.current = false;
      return;
    }

    // Read balances/address from the wallet RPC, not from React state so we do not rely on a stale render.
    let latestWallet = await refreshWalletState(false);
    if (!latestWallet.address) {
      setActionState({ kind: "error", message: "Connect your wallet before pressing the button." });
      depositInFlightRef.current = false;
      return;
    }

    if (latestWallet.chainId !== CONFIG.chainId) {
      setActionState({
        kind: "pending",
        message: CONFIRM_APP_CHAIN_SWITCH_MSG,
      });
      const switched = await requestAppChainSwitch();
      if (!switched) {
        setActionState({ kind: "error", message: `Switch your wallet to ${TEZOSX_EVM_DISPLAY_NAME} first.` });
        depositInFlightRef.current = false;
        return;
      }
      latestWallet = await refreshWalletState(false);
    }

    if (latestWallet.chainId !== CONFIG.chainId) {
      setActionState({ kind: "error", message: `Switch your wallet to ${TEZOSX_EVM_DISPLAY_NAME} first.` });
      depositInFlightRef.current = false;
      return;
    }

    const insufficientForPlay = getInsufficientPlayFundsEventLogMessage(latestWallet);
    if (insufficientForPlay) {
      const maybeAirdrop =
        latestWallet.usdcBalanceRaw === 0n || latestWallet.xtzBalanceRaw === 0n;

      if (maybeAirdrop) {
        try {
          setActionState({
            kind: "pending",
            message: `You need ${stackShortLabel(CONFIG.stack)} funds to play — we’re airdropping your wallet now…`,
          });
          const { willAirdrop } = await ensureNetworkFundsIfNeeded(latestWallet);
          if (willAirdrop) {
            setActionState({
              kind: "pending",
              message: "Previewnet airdrop complete. Waiting for your wallet balance to update…",
            });
          }
          const fundedWallet = await refreshWalletUntilPlayBalancesVisible(
            willAirdrop,
            () => refreshWalletState(false),
          );
          const stillInsufficient = getInsufficientPlayFundsEventLogMessage(fundedWallet);

          setActionState({
            kind: stillInsufficient ? "error" : "idle",
            message: stillInsufficient
              ? willAirdrop
                ? AIRDROP_BALANCE_SYNC_PENDING_MESSAGE
                : stillInsufficient
              : `Your wallet is topped up. Press Play again to deposit ${CONFIG.pressAmount} USDC into the pot.`,
          });
        } catch (error) {
          if (
            error instanceof Error &&
            (error.message === "AIRDROP_NOT_CONFIGURED" || error.message.startsWith("AIRDROP_FAILED:"))
          ) {
            setActionState({ kind: "error", message: formatAirdropError(error, stackShortLabel(CONFIG.stack)) });
          } else {
            setActionState({
              kind: "error",
              message: error instanceof Error ? error.message : insufficientForPlay,
            });
          }
        }
      } else {
        setActionState({
          kind: "error",
          message: insufficientForPlay,
        });
      }
      depositInFlightRef.current = false;
      return;
    }

    freezeGameStateUiRef.current = true;
    setIsSubmitting(true);
    const approvalNeeded =
      latestWallet.usdcAllowance !== null && latestWallet.usdcAllowance < PRESS_AMOUNT_UNITS;
    const depositSteps = pressStepDefs(approvalNeeded);

    setActionState({
      kind: "pending",
      message: useGameReadyLineForPrepare
        ? `Game ready. Confirm your ${CONFIG.pressAmount} USDC deposit into the EVM escrow.`
        : "Loading game state from the Michelson interface…",
      steps: markFlowSteps(depositSteps, "prepare"),
    });

    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const currentState = await refreshGameState();
      if (!currentState) {
        throw new Error("Could not load game data. Refresh and try again.");
      }

      if (currentState.claimed) {
        throw new Error("This game was already claimed.");
      }

      if (currentState.sessionEnd <= Math.floor(Date.now() / 1000)) {
        throw new Error("This game has ended.");
      }

      if (approvalNeeded) {
        setActionState({
          kind: "pending",
          message: "Approve USDC when your wallet asks.",
          steps: markFlowSteps(depositSteps, "approve"),
        });
        const usdc = new ethers.Contract(CONFIG.usdcAddress, ERC20_ABI, signer);
        const approveTx = await usdc.approve(CONFIG.potAddress, USDC_ESCROW_APPROVE_CAP);
        setActionState({
          kind: "pending",
          message: `Waiting for your approval transaction to confirm on ${TEZOSX_EVM_DISPLAY_NAME}…`,
          steps: markFlowSteps(depositSteps, "approve"),
          txHash: approveTx.hash,
        });
        await approveTx.wait();
        await refreshWalletState(false);
      }

      const escrow = new ethers.Contract(CONFIG.potAddress, ESCROW_ABI, signer);
      setActionState({
        kind: "pending",
        message: "Confirm the 1 USDC deposit in your wallet.",
        steps: markFlowSteps(depositSteps, "wallet_deposit"),
      });

      const tx = await escrow.deposit(PRESS_AMOUNT_UNITS);
      setActionState({
        kind: "pending",
        message: `Waiting for your ${CONFIG.pressAmount} USDC deposit to confirm on ${TEZOSX_EVM_DISPLAY_NAME}…`,
        steps: markFlowSteps(depositSteps, "evm_confirm"),
        txHash: tx.hash,
      });

      await tx.wait();

      const updatedState = await waitForGameStateUpdate(currentState, depositSteps, tx.hash);
      freezeGameStateUiRef.current = false;
      setGameState(updatedState);
      await refreshWalletState(false);

      const tezosOpDirect = await fetchLatestTezosOpExplorerUrl();
      const tezosOpsUrl = tezosOpDirect ?? tezosGameOperationsUrl();

      setDepositFxId((id) => id + 1);
      setActionState({
        kind: "success",
        message: `Done. You deposited ${CONFIG.pressAmount} USDC into the game pot. Potluck to you!`,
        txHash: tx.hash,
        tezosOpsUrl,
        steps: completeFlowSteps(depositSteps),
      });
    } catch (error) {
      setActionState({ kind: "error", message: formatPressButtonError(error) });
    } finally {
      freezeGameStateUiRef.current = false;
      setIsSubmitting(false);
      depositInFlightRef.current = false;
    }
  }

  async function claimContract(targetSessionId?: string) {
    const ethereum = getEvmProvider();
    if (!ethereum) {
      setActionState({ kind: "error", message: "No browser wallet is available in this browser." });
      return;
    }

    if (!walletState.address) {
      setActionState({ kind: "error", message: "Connect your wallet before claiming." });
      return;
    }

    if (!onExpectedNetwork) {
      setActionState({ kind: "error", message: `Switch your wallet to ${TEZOSX_EVM_DISPLAY_NAME} first.` });
      return;
    }

    const preNow = Math.floor(Date.now() / 1000);
    const preSid =
      targetSessionId ??
      (gameState ? getClaimTargetSession(gameState, walletState.address, preNow)?.sessionId : null) ??
      gameState?.currentSessionId ??
      "—";

    setActionState({
      kind: "pending",
      message: `Game #${preSid}: Checking if you can claim…`,
      steps: markFlowSteps(CLAIM_STEP_DEFS, "check"),
    });

    try {
      const currentState = await refreshGameState(true, true);
      const nowSec = Math.floor(Date.now() / 1000);
      const inFlightPending = getPendingClaimRequestedSession(currentState, walletState.address);
      const currentInFlight = hasCurrentClaimInFlight(currentState, walletState.address, nowSec);
      const naturalClaimTarget = getClaimTargetSession(currentState, walletState.address, nowSec);
      const duplicateClaimTarget: ClaimTargetSession | null = targetSessionId
        ? getDuplicateClaimTargetForWalletSession(currentState, walletState.address, targetSessionId, nowSec)
        : naturalClaimTarget
          ? getDuplicateClaimTargetForWalletSession(
              currentState,
              walletState.address,
              naturalClaimTarget.sessionId,
              nowSec,
            )
          : inFlightPending
            ? inFlightPending
            : currentInFlight && currentState
              ? {
                  sessionId: currentState.currentSessionId,
                  source: "current",
                  winnerAddress: currentState.lastPlayerAddress,
                }
              : null;
      if (duplicateClaimTarget) {
        const potInf = potInfoForClaimTarget(currentState, duplicateClaimTarget);
        const payoutHash =
          walletState.address && potInf
            ? await fetchPayoutTxHash(walletState.address, BigInt(potInf.potRaw))
            : await fetchPayoutTxHash(walletState.address ?? null, null);
        const sid = duplicateClaimTarget.sessionId;
        const potLine = potInf ? `${potInf.potDisplay} USDC` : "USDC";
        const msg = potInf
          ? `Game #${sid}: Already claimed (${potLine}). Waiting for relayer payout…`
          : "Claim already recorded. Waiting for relayer payout…";
        setActionState({
          kind: "pending",
          message: msg,
          txHash: payoutHash ?? undefined,
        });
        return;
      }

      let claimTarget = getClaimTargetSession(currentState, walletState.address, nowSec);
      if (targetSessionId) {
        if (
          currentState &&
          currentState.currentSessionId === targetSessionId &&
          currentState.sessionEnd <= nowSec &&
          !currentState.claimed &&
          addressesEqual(currentState.lastPlayerAddress, walletState.address)
        ) {
          claimTarget = {
            sessionId: targetSessionId,
            source: "current",
            winnerAddress: currentState.lastPlayerAddress,
          };
        } else {
          const pendingMatch = currentState?.pendingSessions.find(
            (session) =>
              session.sessionId === targetSessionId &&
              !session.claimRequested &&
              addressesEqual(session.winnerAddress, walletState.address),
          );
          claimTarget = pendingMatch
            ? {
                sessionId: pendingMatch.sessionId,
                source: "pending",
                winnerAddress: pendingMatch.winnerAddress,
              }
            : null;
        }
      }
      if (!claimTarget) {
        if (currentState?.lastPlayerAddress && walletState.address && !sessionActive) {
          const logMsg = `Only the last person who pressed can claim. Winner wallet: ${shortAddr(currentState.lastPlayerAddress)}.`;
          const key = `${currentState.sessionEnd}-${currentState.lastPlayerAddress}-${walletState.address}`;
          if (claimMismatchDedupeKeyRef.current !== key) {
            pushEventLog(logMsg, "error");
            claimMismatchDedupeKeyRef.current = key;
          }
          setActionState({
            kind: "error",
            message: logMsg,
          });
        } else {
          setActionState({
            kind: "error",
            message: "There is no claimable game for this wallet right now.",
          });
        }
        return;
      }

      const potForClaim = potInfoForClaimTarget(currentState, claimTarget);
      if (!potForClaim || !michelsonPotHasFunds(potForClaim.potRaw)) {
        setActionState({
          kind: "error",
          message: `Game #${claimTarget.sessionId} has no pot in Michelson storage — nothing to claim.`,
        });
        return;
      }

      setClaimingForSessionId(claimTarget.sessionId);

      setActionState({
        kind: "pending",
        message: `Game #${claimTarget.sessionId}: You can! Confirm the claim in your wallet.`,
        steps: markFlowSteps(CLAIM_STEP_DEFS, "wallet_claim"),
      });

      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const gateway = new ethers.Contract(CONFIG.nacPrecompile, GATEWAY_ABI, signer);

      claimAttemptTargetRef.current = claimTarget;
      const tx = await gateway.callMichelson(
        CONFIG.gameContract,
        "claim",
        encodeMichelineInt(claimTarget.sessionId),
        { value: 0n, gasLimit: 2_000_000n }
      );

      setActionState({
        kind: "pending",
        message: `Game #${claimTarget.sessionId}: Waiting for your claim transaction to confirm on ${TEZOSX_EVM_DISPLAY_NAME}…`,
        steps: markFlowSteps(CLAIM_STEP_DEFS, "evm_claim"),
        txHash: tx.hash,
      });

      await tx.wait();
      const stateAfterClaimTx = await refreshGameState(true, true);
      const potAfterSubmit = potInfoForClaimTarget(stateAfterClaimTx, claimTarget);

      setActionState({
        kind: "pending",
        message: `Game #${claimTarget.sessionId}: Your Claim is confirmed. Paying you and updating Game #${claimTarget.sessionId} on the Michelson-interface via the NAC Gateway`,
        txHash: tx.hash,
        steps: completeFlowSteps(CLAIM_STEP_DEFS),
      });

      const settledState = await waitForClaimSettlement(claimTarget);
      const potInfoAfter = potInfoForClaimTarget(
        settledState ?? (await refreshGameState(true, true)),
        claimTarget,
      );
      /** After mark_paid, current-game storage shows pot 0 — keep the amount from right after the claim tx for logs and PaidOut matching. */
      const expectedWei = (() => {
        const wSubmit = potAfterSubmit ? BigInt(potAfterSubmit.potRaw) : null;
        const wAfter = potInfoAfter ? BigInt(potInfoAfter.potRaw) : null;
        if (wSubmit != null && wSubmit > 0n) return wSubmit;
        if (wAfter != null && wAfter > 0n) return wAfter;
        return wSubmit ?? wAfter;
      })();

      if (!settledState) {
        const payoutHashLate = await fetchPayoutTxHash(
          claimTarget.winnerAddress ?? walletState.address ?? null,
          expectedWei,
        );
        const amountLine = potInfoAfter ? `${potInfoAfter.potDisplay} USDC (Michelson-interface storage)` : "— USDC";
        setActionState({
          kind: "pending",
          message: payoutHashLate
            ? `Game #${claimTarget.sessionId}: Payout transaction found (${amountLine}). Check links below.`
            : `Game #${claimTarget.sessionId}: Claim is on-chain (${amountLine}). Waiting for relayer payout — refresh if this persists.`,
          txHash: payoutHashLate ?? tx.hash,
          steps: completeFlowSteps(CLAIM_STEP_DEFS),
        });
        return;
      }

      const payoutHash = await fetchPayoutTxHash(
        claimTarget.winnerAddress ?? walletState.address ?? null,
        expectedWei,
      );
      const potLineResolved =
        potInfoAfter && BigInt(potInfoAfter.potRaw) > 0n
          ? potInfoAfter.potDisplay
          : potAfterSubmit && BigInt(potAfterSubmit.potRaw) > 0n
            ? potAfterSubmit.potDisplay
            : null;
      const successBody = formatPotPayoutSuccessMessage(claimTarget.sessionId, potLineResolved);
      const notYetLogged = !readStringIdSet(PAYOUT_DONE_IDS_KEY).has(claimTarget.sessionId);
      setActionState({
        kind: "success",
        message: payoutHash ? successBody : `${successBody} Transaction link pending — refresh in a moment.`,
        txHash: payoutHash ?? tx.hash,
        steps: completeFlowSteps(CLAIM_STEP_DEFS),
      });
      if (notYetLogged) {
        pushEventLog(successBody, "success", payoutHash ?? tx.hash ?? undefined);
      }
      markPayoutSessionCompletedInStorage(claimTarget.sessionId);
    } catch (error) {
      const err = error as { code?: string; message?: string; shortMessage?: string };
      const isRevert =
        err?.code === "CALL_EXCEPTION" ||
        err?.message?.toLowerCase().includes("reverted") ||
        err?.shortMessage?.toLowerCase().includes("reverted");

      if (isRevert) {
        const fresh = await refreshGameState(true, true);
        const nowSec = Math.floor(Date.now() / 1000);
        const attempted = claimAttemptTargetRef.current;
        const dupForAttempted =
          attempted &&
          getDuplicateClaimTargetForWalletSession(fresh, walletState.address, attempted.sessionId, nowSec);
        const anyWalletClaimInFlight =
          hasCurrentClaimInFlight(fresh, walletState.address, nowSec) ||
          Boolean(getPendingClaimRequestedSession(fresh, walletState.address));
        if (dupForAttempted) {
          const potInf = potInfoForClaimTarget(fresh, dupForAttempted);
          const payoutHash = await fetchPayoutTxHash(
            walletState.address ?? null,
            potInf ? BigInt(potInf.potRaw) : null,
          );
          const sid = dupForAttempted.sessionId;
          const potLine = potInf ? `${potInf.potDisplay} USDC` : "USDC";
          const msg = potInf
            ? `Game #${sid}: Already claimed (${potLine}). Waiting for relayer payout…`
                + (payoutHash ? " Payout tx linked below." : "")
            : "Claim recorded. Waiting for relayer payout…" + (payoutHash ? " Payout tx linked below." : "");
          setActionState({
            kind: "pending",
            message: msg,
            txHash: payoutHash ?? undefined,
          });
        } else if (attempted && anyWalletClaimInFlight) {
          const sid = attempted.sessionId;
          setActionState({
            kind: "error",
            message: `Could not submit claim for game #${sid} (transaction reverted). Another payout may still be in progress — wait and try again.`,
          });
        } else if (anyWalletClaimInFlight) {
          const pendingInf = getPendingClaimRequestedSession(fresh, walletState.address);
          const curTarget =
            pendingInf ??
            (hasCurrentClaimInFlight(fresh, walletState.address, nowSec)
              ? {
                  sessionId: fresh!.currentSessionId,
                  source: "current" as const,
                  winnerAddress: fresh!.lastPlayerAddress,
                }
              : null);
          const potInf = curTarget ? potInfoForClaimTarget(fresh, curTarget) : null;
          const payoutHash = await fetchPayoutTxHash(
            walletState.address ?? null,
            potInf ? BigInt(potInf.potRaw) : null,
          );
          setActionState({
            kind: "pending",
            message: "Claim recorded. Waiting for relayer payout…" + (payoutHash ? " Payout tx linked below." : ""),
            txHash: payoutHash ?? undefined,
          });
        } else {
          const notLast =
            err?.message?.includes("NOT_LAST_PLAYER") || err?.shortMessage?.includes("NOT_LAST_PLAYER");
          setActionState({
            kind: "error",
            message: notLast
              ? "Only the wallet that pressed last can claim. Switch wallet or wait until the round ends."
              : "Claim failed. Refresh the page and try again.",
          });
        }
      } else {
        setActionState({ kind: "error", message: formatGatewayError(error, "claim") });
      }
    } finally {
      setClaimingForSessionId(null);
      claimAttemptTargetRef.current = null;
    }
  }

  async function startNewSession(options?: { continueWithDeposit?: boolean }) {
    const ethereum = getEvmProvider();
    if (!ethereum) {
      setActionState({ kind: "error", message: `Connect your wallet and switch to ${TEZOSX_EVM_DISPLAY_NAME}.` });
      return false;
    }
    const continueWithDeposit = Boolean(options?.continueWithDeposit);
    let leaveStartingSessionFlag = false;
    setIsStartingSession(true);
    setActionState({
      kind: "pending",
      message: "Confirm the new game in your wallet to start a round on the Michelson-interface.",
      steps: markFlowSteps(START_SESSION_STEP_DEFS, "wallet_start"),
    });
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = (await provider.send("eth_accounts", [])) as string[];
      if (accounts.length === 0) {
        setActionState({ kind: "error", message: `Connect your wallet and switch to ${TEZOSX_EVM_DISPLAY_NAME}.` });
        return false;
      }
      let currentChainId = await readChainIdFromProvider(provider);
      if (currentChainId !== CONFIG.chainId) {
        setActionState({
          kind: "pending",
          message: CONFIRM_APP_CHAIN_SWITCH_MSG,
        });
        const switched = await requestAppChainSwitch();
        if (!switched) {
          setActionState({ kind: "error", message: `Connect your wallet and switch to ${TEZOSX_EVM_DISPLAY_NAME}.` });
          return false;
        }
        const p2 = new ethers.BrowserProvider(ethereum);
        currentChainId = await readChainIdFromProvider(p2);
      }
      if (currentChainId !== CONFIG.chainId) {
        setActionState({ kind: "error", message: `Connect your wallet and switch to ${TEZOSX_EVM_DISPLAY_NAME}.` });
        return false;
      }
      setActionState({
        kind: "pending",
        message: "Confirm the new game in your wallet to start a round on the Michelson-interface.",
        steps: markFlowSteps(START_SESSION_STEP_DEFS, "wallet_start"),
      });
      let preRound: GameState;
      try {
        preRound = await fetchGameState();
      } catch {
        setActionState({
          kind: "error",
          message:
            "Could not load the latest game state before starting. Check your connection, refresh the page, and try again.",
        });
        return false;
      }
      const nowSecPreflight = Math.floor(Date.now() / 1000);
      if (preRound.sessionEnd > nowSecPreflight) {
        setActionState({
          kind: "error",
          message:
            "This round has not finished on-chain yet. Wait for the timer, refresh, then tap Play again.",
        });
        return false;
      }
      const sessionProvider = new ethers.BrowserProvider(ethereum);
      const signer = await sessionProvider.getSigner();
      const gateway = new ethers.Contract(CONFIG.nacPrecompile, GATEWAY_ABI, signer);
      const durationBytes = encodeMichelineInt(DEFAULT_SESSION_DURATION_SEC);
      const tx = await gateway.callMichelson(
        CONFIG.gameContract,
        "start_session",
        durationBytes,
        { value: 0n, gasLimit: 2_000_000n },
      );
      setActionState({
        kind: "pending",
        message: `Waiting for your new game transaction to confirm on ${TEZOSX_EVM_DISPLAY_NAME}…`,
        steps: markFlowSteps(START_SESSION_STEP_DEFS, "evm_start"),
        txHash: tx.hash,
      });
      await tx.wait();
      await refreshGameState();
      if (continueWithDeposit) {
        leaveStartingSessionFlag = true;
        setActionState({
          kind: "pending",
          message: "Round created on the Michelson-interface. Syncing game state…",
          txHash: tx.hash,
          steps: completeFlowSteps(START_SESSION_STEP_DEFS),
        });
      } else {
        setActionState({
          kind: "success",
          message: `New game started (${DEFAULT_SESSION_DURATION_SEC / 60} min). Click Play to deposit ${CONFIG.pressAmount} USDC into the pot.`,
          txHash: tx.hash,
          steps: completeFlowSteps(START_SESSION_STEP_DEFS),
        });
      }
      return true;
    } catch (error) {
      setActionState({
        kind: "error",
        message: formatStartSessionError(error),
      });
      return false;
    } finally {
      if (!leaveStartingSessionFlag) {
        setIsStartingSession(false);
      }
    }
  }

  const startTourFromLanding = useCallback(() => {
    setShellView("game");
    setTourStep(0);
    setTourOpen(true);
  }, []);

  const skipLandingToGame = useCallback(() => {
    try {
      sessionStorage.setItem("potzluck_skip_landing", "1");
    } catch {
      /* ignore */
    }
    setShellView("game");
  }, []);

  const goToLanding = useCallback(() => {
    try {
      sessionStorage.removeItem("potzluck_skip_landing");
    } catch {
      /* ignore */
    }
    setWalletMenuOpen(false);
    setTourOpen(false);
    setShellView("landing");
  }, []);

  const goToGame = useCallback(() => {
    setWalletMenuOpen(false);
    setTourOpen(false);
    setShellView("game");
  }, []);

  const goToSessions = useCallback(() => {
    setWalletMenuOpen(false);
    setTourOpen(false);
    setShellView("sessions");
  }, []);

  const openTourFromGame = useCallback(() => {
    setWalletMenuOpen(false);
    setTourStep(0);
    setTourOpen(true);
  }, []);

  const tourNext = useCallback(() => setTourStep((s) => Math.min(5, s + 1)), []);
  const tourBack = useCallback(() => setTourStep((s) => Math.max(0, s - 1)), []);
  const tourClose = useCallback(() => setTourOpen(false), []);
  const tourEnd = useCallback(() => {
    setTourOpen(false);
    setShellView("game");
  }, []);

  const onPotClick = async () => {
    if (potUiState === "connect") {
      await connectWallet();
      return;
    }
    if (potUiState === "wrong-net") {
      await switchNetwork();
      return;
    }
    if (potUiState === "idle") {
      const started = await startNewSession({ continueWithDeposit: true });
      if (!started) return;
      try {
        const active = await waitForActiveRound();
        if (!active) {
          setActionState({
            kind: "error",
            message:
              "New game was started, but Michelson-interface storage has not caught up yet. Wait a few seconds and press Play again.",
          });
          return;
        }
        setActionState({
          kind: "pending",
          message: `Game ready. Confirm your ${CONFIG.pressAmount} USDC deposit into the EVM escrow.`,
        });
        skipMichelsonLoadingStatusAfterGameReadyRef.current = true;
        await pressButton();
      } finally {
        setIsStartingSession(false);
      }
      return;
    }
    if (potUiState === "play") {
      await pressButton();
      return;
    }
    if (potUiState === "won") {
      const started = await startNewSession({ continueWithDeposit: true });
      if (!started) return;
      try {
        const active = await waitForActiveRound();
        if (!active) {
          setActionState({
            kind: "error",
            message:
              "New game was started, but Michelson-interface storage has not caught up yet. Wait a few seconds and press Play again.",
          });
          return;
        }
        setActionState({
          kind: "pending",
          message: `Game ready. Confirm your ${CONFIG.pressAmount} USDC deposit into the EVM escrow.`,
        });
        skipMichelsonLoadingStatusAfterGameReadyRef.current = true;
        await pressButton();
      } finally {
        setIsStartingSession(false);
      }
    }
  };

  const potCopy = useMemo(() => {
    const userIsLastDepositor =
      Boolean(walletState.address) &&
      Boolean(gameState?.lastPlayerAddress) &&
      walletState.address!.toLowerCase() === gameState!.lastPlayerAddress!.toLowerCase();
    switch (potUiState) {
      case "connect":
        return { label: "Connect", sub: "wallet to play" };
      case "wrong-net":
        return { label: "Add", sub: TEZOSX_EVM_DISPLAY_NAME };
      case "idle":
        return { label: "Play", sub: null };
      case "play":
        return {
          label: userIsLastDepositor ? "Play Again" : "Play",
          sub: `${CONFIG.pressAmount} USDC`,
        };
      case "depositing":
        return { label: "…", sub: "working" };
      case "won":
        return { label: "Play", sub: null };
    }
  }, [potUiState, walletState.address, gameState]);

  const potProgressShown =
    potUiState === "play" || potUiState === "depositing" ? potRingProgress : null;

  const lastPlayerDisplay = useMemo(() => {
    if (!gameState?.lastPlayerAddress) {
      if (gameState?.lastPlayerTezos) return gameState.lastPlayerTezos;
      return "—";
    }
    return shortAddr(gameState.lastPlayerAddress);
  }, [gameState?.lastPlayerAddress, gameState?.lastPlayerTezos]);

  const hasGameStatus =
    !hasInjectedWallet ||
    Boolean(gameStateError) ||
    (Boolean(walletError) && walletError !== TEZOS_X_EVM_WALLET_HINT);

  if (shellView === "landing") {
    return (
      <>
        <div className="bg-grid" />
        <div className="bg-glow" />
        <div className="pl-shell">
          <header className="pl-topbar">
            <div className="brand">
              <div className="brand-mark brand-mark-pot" aria-hidden>
                <PotzLuckPotIcon />
              </div>
              <div className="brand-lockup">
                <span className="brand-name">
                  <PotzLuckMark />
                </span>
                <span className="brand-sub">on Tezos X</span>
              </div>
            </div>
            <div className="topbar-right">
              <a
                className="btn ghost sm"
                href={TEZOS_X_DASHBOARD_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Explore Tezos X ↗
              </a>
            </div>
          </header>
          <main className="pl-landing">
            <section className="landing-copy">
              <h1 className="landing-h">
                <span className="landing-h-primary">Native Atomic Composability</span>
                <span className="landing-sub-h">comes to Tezos X.</span>
              </h1>
              <p className="landing-blurb">
                <PotzLuckMark /> is a simple game that helps you understand the power of NAC on Tezos X. You deposit
                into a pot on the EVM interface and watch game state update on the Michelson-interface without switching
                context. The last player to deposit when the game ends wins.
              </p>
              <div className="landing-cta">
                <button type="button" className="btn primary lg" onClick={skipLandingToGame}>
                  Play Game
                </button>
                <button type="button" className="btn ghost lg" onClick={startTourFromLanding}>
                  Take the Tour
                </button>
              </div>
            </section>
          </main>
          <PotFooter
            faucetUrl={faucetUrl}
            docsUrl={POTZ_DOCS_URL}
            tezlinkUrl={TEZLINK_SITE_URL}
            onOpenNetworkInfo={() => setNetworkInfoOpen(true)}
          />
        </div>
        <NetworkInfoModal open={networkInfoOpen} onClose={() => setNetworkInfoOpen(false)} />
        <PotzTour
          open={tourOpen}
          stepIdx={tourStep}
          onNext={tourNext}
          onBack={tourBack}
          onClose={tourClose}
          onEndGoToGame={tourEnd}
        />
        <AirdropModal
          open={airdropModalState.open}
          receivedUsdc={airdropModalState.usdc}
          receivedXtz={airdropModalState.xtz}
          onDismiss={dismissAirdropModal}
        />
        <WalletPickerModal
          open={walletPickerOpen}
          options={connectWalletOptions}
          onSelect={handleWalletPickerSelect}
          onClose={handleWalletPickerClose}
        />
      </>
    );
  }

  if (shellView === "sessions") {
    return (
      <>
        <div className="bg-grid" />
        <div className="bg-glow" />
        <div className="pl-shell">
          <header className="pl-topbar">
            <button type="button" className="brand brand-button" onClick={goToLanding}>
              <div className="brand-mark brand-mark-pot" aria-hidden>
                <PotzLuckPotIcon />
              </div>
              <div className="brand-lockup">
                <span className="brand-name">
                  <PotzLuckMark />
                </span>
                <span className="brand-sub">on Tezos X</span>
              </div>
            </button>
            <div className="topbar-right">
              <button type="button" className="btn ghost sm" onClick={goToGame}>
                Back to game
              </button>
              <a
                className="btn ghost sm"
                href={TEZOS_X_DASHBOARD_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Explore Tezos X ↗
              </a>
            </div>
          </header>

          <main className="sessions-page">
            <section className="sessions-hero">
              <h1>Games</h1>
              <p>Review every Michelson-interface game that is still unresolved and claim the rounds your connected wallet won.</p>
            </section>

            <section className="sessions-claim-card">
              <div className="sessions-card-head">
                <h2>Current game claim</h2>
                <span className={`session-state ${sessionActive ? "active" : ""}`}>
                  <span className="dot" />
                  {sessionActive ? "Game active" : "No active game"}
                </span>
              </div>
              <div className="sessions-claim-grid">
                <div className="stat-row">
                  <div className="stat-l">Last player</div>
                  <div className="stat-v">{lastPlayerDisplay}</div>
                </div>
                <div className="stat-row">
                  <div className="stat-l">Pot size</div>
                  <div className="stat-v">
                    <b>{gameState ? gameState.potDisplay : "—"}</b> <span>USDC</span>
                  </div>
                </div>
                <div className="stat-row">
                  <div className="stat-l">Status</div>
                  <div className="stat-v">{sessionLabel}</div>
                </div>
              </div>
              {canShowClaimCurrentRoundButton ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void claimContract()}
                  disabled={claimInProgressForCurrentRoundButton}
                >
                  {claimInProgressForCurrentRoundButton ? "Claiming..." : "Claim Winnings"}
                </button>
              ) : (
                <p className="side-note">
                  {canClaim && claimTargetSession?.source === "pending"
                    ? "You have a claim on an earlier game — use Claim next to that game below."
                    : sessionActive
                      ? "The current round is still active."
                      : "The claim button here is for the current round once it ends. Use the list below for earlier games."}
                </p>
              )}
            </section>

            <section className="sessions-list-card">
              <div className="sessions-card-head">
                <h2>All unclaimed games</h2>
              </div>
              {unresolvedSessions.length > 0 ? (
                <div className="sessions-list">
                  {unresolvedSessions.map((session) => {
                    const winnerMatches = addressesEqual(session.winnerAddress, walletState.address);
                    return (
                    <article key={session.sessionId} className="sessions-list-item">
                      <div className="sessions-list-top">
                        <strong>Game #{session.sessionId}</strong>
                        <span>{session.potDisplay} USDC</span>
                      </div>
                      <div className="sessions-list-mid">
                        <span className="session-winner-label">Winner</span>
                        <span className="session-winner-value">
                          {session.winnerAddress ? shortAddr(session.winnerAddress) : (session.winnerTezos ?? "—")}
                        </span>
                      </div>
                      <div className="sessions-list-bottom">
                        <span>
                          {session.claimRequested
                            ? "Processing"
                            : `Ended ${formatEndedAgo(Math.max(0, Math.floor(Date.now() / 1000) - session.sessionEnd))}`}
                        </span>
                        {winnerMatches && !session.claimRequested && michelsonPotHasFunds(session.potRaw) ? (
                          <button
                            type="button"
                            className="btn primary sm"
                            onClick={() => void claimContract(session.sessionId)}
                            disabled={claimingForSessionId === session.sessionId}
                          >
                            {claimingForSessionId === session.sessionId ? "Claiming..." : "Claim"}
                          </button>
                        ) : (
                          <span className="sessions-list-status">
                            {!winnerMatches
                              ? "Not your game"
                              : session.claimRequested
                                ? "Processing"
                                : "No pot"}
                          </span>
                        )}
                      </div>
                    </article>
                  )})}
                </div>
              ) : (
                <p className="side-note">No unresolved games right now.</p>
              )}
            </section>
          </main>
        </div>
        <NetworkInfoModal open={networkInfoOpen} onClose={() => setNetworkInfoOpen(false)} />
        <WalletPickerModal
          open={walletPickerOpen}
          options={connectWalletOptions}
          onSelect={handleWalletPickerSelect}
          onClose={handleWalletPickerClose}
        />
      </>
    );
  }

  return (
    <>
      <div className="bg-grid" />
      <div className="bg-glow" />
      <div className="pl-shell">
        <header className="pl-topbar">
          <button type="button" className="brand brand-button" onClick={goToLanding}>
            <div className="brand-mark brand-mark-pot" aria-hidden>
              <PotzLuckPotIcon />
            </div>
            <div className="brand-lockup">
              <span className="brand-name">
                <PotzLuckMark />
              </span>
              <span className="brand-sub">on Tezos X</span>
            </div>
          </button>
          <div className="topbar-right">
            {walletState.address ? (
              <div className="wallet-menu" ref={walletMenuRef}>
                <button
                  type="button"
                  className="wallet-pill"
                  onClick={() => setWalletMenuOpen((o) => !o)}
                >
                  <span className="wallet-avatar" />
                  <span className="addr">{shortAddr(walletState.address)}</span>
                  <svg className="caret" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {walletMenuOpen ? (
                  <div className="wallet-dropdown">
                    <button
                      type="button"
                      onClick={() => {
                        setWalletMenuOpen(false);
                        openTourFromGame();
                      }}
                    >
                      Take the tour
                    </button>
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
            ) : (
              <>
                <button type="button" className="btn ghost sm" onClick={openTourFromGame}>
                  Take the tour
                </button>
              </>
            )}
            <a
              className="btn ghost sm"
              href={TEZOS_X_DASHBOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Explore Tezos X ↗
            </a>
          </div>
        </header>

        <main className="pl-game">
          <div className="game-layout">
            <aside className="game-stats">
              <div className="stat-row hero">
                <div className="stat-l">{potSidebarLabel}</div>
                <div className="stat-v hero-v">
                  <b>{gameState ? gameState.potDisplay : "—"}</b> <span>USDC</span>
                </div>
              </div>
              <div className="stat-row">
                <div className="stat-l">Last player</div>
                <div className="stat-v">{lastPlayerDisplay}</div>
              </div>
              <div className="stat-row">
                <div className="stat-l">Game ends</div>
                <div className="stat-v">{sessionLabel}</div>
              </div>
              {canShowClaimCurrentRoundButton ? (
                <button
                  type="button"
                  className="btn primary sm claim-under-ends"
                  onClick={() => void claimContract()}
                  disabled={claimInProgressForCurrentRoundButton}
                >
                  {claimInProgressForCurrentRoundButton ? "Claiming..." : "Claim Winnings"}
                </button>
              ) : null}
              <div className={`session-state ${sessionActive ? "active" : ""}`}>
                <span className="dot" />
                {sessionActive ? "Game active" : "No active game"}
              </div>
              <div className="session-history">
                <div className="session-history-head">
                  <button
                    type="button"
                    className="session-history-heading-btn"
                    onClick={goToSessions}
                  >
                    <h3 className="session-history-h">Recent games</h3>
                  </button>
                  <RecentSessionsClaimInfo walletConnected={Boolean(walletState.address)} />
                </div>
                {sidebarPendingSessions.length > 0 ? (
                  <div className="session-history-list">
                    {sidebarPendingSessions.map((session) => {
                      const winnerMatches = addressesEqual(session.winnerAddress, walletState.address);
                      return (
                      <div key={session.sessionId} className="session-history-item">
                        <div className="session-history-top">
                          <span>Game #{session.sessionId}</span>
                          <span>{session.potDisplay} USDC</span>
                        </div>
                        <div className="session-history-bottom">
                          <span className="session-winner-block">
                            <span className="session-winner-label">Winner</span>
                            <span className="session-winner-value">
                              {session.winnerAddress ? shortAddr(session.winnerAddress) : (session.winnerTezos ?? "—")}
                            </span>
                          </span>
                          {winnerMatches && !session.claimRequested && michelsonPotHasFunds(session.potRaw) ? (
                            <button
                              type="button"
                              className="btn primary sm session-history-claim"
                              onClick={() => void claimContract(session.sessionId)}
                              disabled={claimingForSessionId === session.sessionId}
                            >
                              {claimingForSessionId === session.sessionId ? "Claiming..." : "Claim"}
                            </button>
                          ) : (
                            <span className="session-history-status">
                              {session.claimRequested
                                ? "Processing"
                                : winnerMatches
                                  ? michelsonPotHasFunds(session.potRaw)
                                    ? "Yours"
                                    : "No pot"
                                  : "Unclaimed"}
                            </span>
                          )}
                        </div>
                      </div>
                    )})}
                  </div>
                ) : (
                  <div className="session-history-empty">No recent games yet.</div>
                )}
                {unresolvedSessions.length > 5 ? (
                  <button type="button" className="session-history-link" onClick={goToSessions}>
                    View all unclaimed games
                  </button>
                ) : null}
              </div>
            </aside>

            <div className="pot-stage">
              <div className="pot-stage-pot-wrap">
                <PotButton
                  state={potUiState}
                  label={potCopy.label}
                  sublabel={potCopy.sub}
                  progress={potProgressShown}
                  onClick={() => void onPotClick()}
                  disabled={
                    potUiState === "depositing" ||
                    (potUiState === "connect" && isConnecting) ||
                    (potUiState === "play" && !canPressButton) ||
                    (potUiState === "idle" && !canStartNewSession) ||
                    (potUiState === "won" && !canStartNewSession)
                  }
                />
                {depositFxId > 0 ? (
                  <DepositPotCelebration key={depositFxId} onComplete={dismissDepositFx} />
                ) : null}
              </div>
              {walletState.address && !onExpectedNetwork ? (
                <NetworkHelpPotz onAdd={() => void switchNetwork()} evmNetworkDisplayName={TEZOSX_EVM_DISPLAY_NAME} />
              ) : null}
              <EventLogStrip entries={eventLog} evmTxUrl={evmTxUrl} />
            </div>
          </div>

          {hasGameStatus ? (
            <section className="game-status-area">
              {!hasInjectedWallet ? (
                <p className="side-note" style={{ color: "var(--amber)" }}>
                  No wallet detected. Install MetaMask and reload.
                </p>
              ) : null}
              {walletError && walletError !== TEZOS_X_EVM_WALLET_HINT ? (
                <p className="side-note" style={{ color: "var(--amber)" }}>
                  {walletError}
                </p>
              ) : null}
              {gameStateError ? <p className="side-note" style={{ color: "var(--amber)" }}>{gameStateError}</p> : null}
            </section>
          ) : null}
        </main>
        <PotFooter
          faucetUrl={faucetUrl}
          docsUrl={POTZ_DOCS_URL}
          tezlinkUrl={TEZLINK_SITE_URL}
          onOpenNetworkInfo={() => setNetworkInfoOpen(true)}
        />
      </div>
      <NetworkInfoModal open={networkInfoOpen} onClose={() => setNetworkInfoOpen(false)} />
      <AirdropModal
        open={airdropModalState.open}
        receivedUsdc={airdropModalState.usdc}
        receivedXtz={airdropModalState.xtz}
        onDismiss={dismissAirdropModal}
      />
      <WalletPickerModal
        open={walletPickerOpen}
        options={connectWalletOptions}
        onSelect={handleWalletPickerSelect}
        onClose={handleWalletPickerClose}
      />
      <PotzTour
        open={tourOpen}
        stepIdx={tourStep}
        onNext={tourNext}
        onBack={tourBack}
        onClose={tourClose}
        onEndGoToGame={tourEnd}
      />
    </>
  );
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export default App;
