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
  shortAddr,
  type EventLogEntry,
  type EventLogTone,
} from "./potzluckUi";

const evmRpc = import.meta.env.VITE_EVM_RPC ?? "https://demo.txpark.nomadic-labs.com/rpc";
const tezlinkRpc = import.meta.env.VITE_TEZLINK_RPC ?? "https://demo.txpark.nomadic-labs.com/rpc/tezlink";
const evmExplorerUrl =
  import.meta.env.VITE_EVM_EXPLORER_URL ?? "https://demo-blockscout.txpark.nomadic-labs.com";
const tezosExplorerBase =
  import.meta.env.VITE_TEZOS_EXPLORER_BASE ?? "https://sandbox.tezlink.tzkt.io";
const chainId = BigInt(import.meta.env.VITE_CHAIN_ID ?? "127124");
const usdcAddress = import.meta.env.VITE_USDC_ADDRESS ?? "0x92E791DF3Dd5A8704f0e7d9B3003A0627d95d017";
const potAddress = import.meta.env.VITE_POT_ADDRESS ?? "0x34A76754E2aA034c02FEd2b87b5a6f647043d441";
const gameContract = import.meta.env.VITE_GAME_CONTRACT ?? "KT1Whp8174wXWCmhKKojfS3AdzKgTRaH9mie";
const cracPrecompile =
  import.meta.env.VITE_CRAC_PRECOMPILE ?? "0xff00000000000000000000000000000000000007";
const usdcDecimals = Number(import.meta.env.VITE_USDC_DECIMALS ?? "6");
const pressAmount = import.meta.env.VITE_PRESS_AMOUNT ?? "1";
const pollIntervalMs = Number(import.meta.env.VITE_POLL_INTERVAL_MS ?? "5000");
/** Max time to wait for Michelson-side pot to reflect the deposit after EVM confirmation (relayer → cross-runtime). Default 40s. */
const gameStateWaitTimeoutMs = (() => {
  const n = Number(import.meta.env.VITE_GAME_STATE_WAIT_TIMEOUT_MS ?? "40000");
  return Number.isFinite(n) && n > 0 ? n : 40000;
})();
const DEFAULT_TESTNET_FAUCET_URL = "https://demo-faucet.txpark.nomadic-labs.com/";
const faucetUrl =
  import.meta.env.VITE_FAUCET_URL?.trim() || DEFAULT_TESTNET_FAUCET_URL;
const DEFAULT_AIRDROP_API_URL = "https://tezosx-evm-usdc-airdrop.vercel.app/api/airdrop";
const airdropApiUrl = import.meta.env.VITE_AIRDROP_API_URL?.trim() || DEFAULT_AIRDROP_API_URL;
const AIRDROP_USDC_AMOUNT = "5";
const AIRDROP_XTZ_AMOUNT = "5";

function airdropDeliveredLogMessage(usdc: boolean, xtz: boolean): string {
  if (usdc && xtz) {
    return `Airdrop complete: ${AIRDROP_USDC_AMOUNT} USDC and ${AIRDROP_XTZ_AMOUNT} XTZ sent to your wallet.`;
  }
  if (usdc) return `Airdrop complete: ${AIRDROP_USDC_AMOUNT} USDC sent to your wallet.`;
  return `Airdrop complete: ${AIRDROP_XTZ_AMOUNT} XTZ sent to your wallet.`;
}

const tzktApiUrl = tezlinkRpc.replace(/\/rpc\/tezlink\/?$/, "") + "/tzkt";

const CONFIG = {
  appName: "XButton",
  evmRpc,
  tezlinkRpc,
  tezlinkStorageUrl: `${tezlinkRpc}/chains/main/blocks/head/context/contracts/${gameContract}/storage`,
  evmExplorerUrl,
  tezosExplorerBase,
  tzktApiUrl,
  chainId,
  chainIdHex: `0x${chainId.toString(16)}`,
  usdcAddress,
  potAddress,
  gameContract,
  cracPrecompile,
  usdcDecimals,
  pressAmount,
  pollIntervalMs,
  gameStateWaitTimeoutMs,
} as const;

/** Tezos X testnet dashboard (RPC, chain ID, explorers, faucet): https://demo.txpark.nomadic-labs.com/ */
const TEZOS_X_TESTNET_DASHBOARD_URL = "https://demo.txpark.nomadic-labs.com/";
const POTZ_DOCS_URL = import.meta.env.VITE_DOCS_URL ?? "https://tezos.com/tezos-x/";
const TEZLINK_SITE_URL = import.meta.env.VITE_TEZLINK_SITE_URL ?? "https://tezlink.tezos.com/";
const NETWORK_INFO = {
  testnetName: "demo",
  deployedBy: "foucaultaurelien",
  created: "2026-04-22 10:19:00 UTC",
  evmNodeVersion: "649d7e6a",
  rpcEndpoint: "https://demo.txpark.nomadic-labs.com/rpc",
  tezlinkEndpoint: "https://demo.txpark.nomadic-labs.com/rpc/tezlink",
  smartRollupNode: "https://demo.txpark.nomadic-labs.com/rollup",
  chainId: "127124 (0x1f094)",
  rollupAddress: "sr1HHiXgJf4WBRBLzQ61ybLDbz5C5p3FeNzA",
  smartRollupNodeConfig: "https://demo.txpark.nomadic-labs.com/rollup/config",
  dashboardUrl: "https://demo.txpark.nomadic-labs.com/",
} as const;

function evmAddressUrl(address: string) {
  return `${CONFIG.evmExplorerUrl}/address/${address}`;
}

function evmTokenUrl(address: string) {
  return `${CONFIG.evmExplorerUrl}/token/${address}`;
}

function evmTxUrl(hash: string) {
  const h = hash.startsWith("0x") ? hash : `0x${hash}`;
  return `${CONFIG.evmExplorerUrl}/tx/${h}`;
}

function tezosContractUrl(address: string) {
  return `${CONFIG.tezosExplorerBase}/${address}?tzkt_api_url=${encodeURIComponent(CONFIG.tzktApiUrl)}`;
}

function isEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isTezosAddress(value: string) {
  return /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
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
];

const GATEWAY_ABI = [
  "function callMichelson(string destination, string entrypoint, bytes data) external payable",
];

// Micheline binary for Unit - the claim entrypoint parameter.
// The gateway routes by entrypoint name, so we only encode the parameter value itself.
// 03 = bare prim (no args, no annotations), 0b = D_Unit
const CLAIM_PARAM_HEX = "030b";

// Default session duration in seconds (5 minutes). start_session takes an int.
const DEFAULT_SESSION_DURATION_SEC = 300;

/** Encode a non-negative int as Micheline bytes: 0x00 (int tag) + zarith encoding */
function encodeMichelineInt(value: number): string {
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

type GameStorageJsonNode = {
  prim?: string;
  args?: GameStorageJsonNode[];
  bytes?: string;
  int?: string;
  string?: string;
};

type GameState = {
  /** Michelson-side identity for the last depositor - matched against Tezos.get_sender on claim. */
  lastPlayerTezos: string | null;
  /** Raw 20-byte EVM address of the last depositor, stored directly in contract storage. */
  lastPlayerAddress: string | null;
  potRaw: string;
  potDisplay: string;
  sessionEnd: number;
  claimed: boolean;
  payoutCompleted: boolean;
  fetchedAt: number;
};

type WalletState = {
  address: string | null;
  chainId: bigint | null;
  usdcBalance: string | null;
  usdcAllowance: bigint | null;
  usdcBalanceRaw: bigint | null;
  xtzBalanceRaw: bigint | null;
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
              "Your wallet prompts you to let the escrow contract pull USDC. Only the amount you approve can move.",
          },
        ]
      : []),
    {
      id: "wallet_deposit",
      label: "Deposit 1 USDC into the escrow",
      detail:
        "You confirm a deposit on the escrow contract. USDC moves into the game pot on Tezos X EVM.",
    },
    {
      id: "evm_confirm",
      label: "Waiting for confirmation from the Tezos X EVM network",
      detail: "The network confirms your deposit transaction.",
    },
    {
      id: "relayer_cross_runtime",
      label: "Relayer is calling the NAC gateway on the EVM side",
      detail:
        "The relayer invokes the NAC gateway from the EVM interface so execution reaches Tezlink and updates the Michelson-interface storage with your deposit.",
    },
  ];
}

const CLAIM_STEP_DEFS: FlowStepDef[] = [
  {
    id: "check",
    label: "We're checking that you're the last depositor",
    detail:
      "We compare your connected wallet with the last depositor stored in the game contract (Michelson interface). Only that wallet can claim the pot.",
  },
  {
    id: "wallet_claim",
    label: "Confirm the claim in your wallet",
    detail:
      "When your wallet opens, approve the claim transaction. Cross-runtime execution routes it from the EVM interface to the game contract on the Michelson interface.",
  },
  {
    id: "evm_claim",
    label: "Waiting for confirmation from the Tezos X EVM network",
    detail: "After the claim is confirmed, the relayer sees it and pays the winnings from the escrow pot to your wallet in USDC.",
  },
];

const START_SESSION_STEP_DEFS: FlowStepDef[] = [
  {
    id: "wallet_start",
    label: "Start a new round",
  },
  {
    id: "evm_start",
    label: "Waiting for confirmation from the Tezos X EVM network",
  },
];

function NetworkInfoModal(props: { open: boolean; onClose: () => void }) {
  if (!props.open) return null;

  const rows = [
    ["Testnet Name", NETWORK_INFO.testnetName],
    ["Created", NETWORK_INFO.created],
    ["EVM Node Version", NETWORK_INFO.evmNodeVersion],
    ["RPC Endpoint", NETWORK_INFO.rpcEndpoint],
    ["Tezlink Endpoint", NETWORK_INFO.tezlinkEndpoint],
    ["Smart Rollup Node", NETWORK_INFO.smartRollupNode],
    ["Chain ID", NETWORK_INFO.chainId],
  ] as const;

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
            <a href={NETWORK_INFO.dashboardUrl} target="_blank" rel="noopener noreferrer" className="explorer-link">
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
    ? "You've got 5 USDC and 5 XTZ. On us."
    : props.receivedUsdc
      ? "You've got 5 USDC. On us."
      : "You've got 5 XTZ. On us.";

  const body = gotBoth
    ? "We airdropped 5 USDC to play with and 5 XTZ for gas into your wallet on the EVM interface of Tezos X. You're ready to play."
    : props.receivedUsdc
      ? "We airdropped 5 USDC into your wallet so you can play on Tezos X."
      : "We airdropped 5 XTZ into your wallet so you have gas to play on Tezos X.";

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
                <div className="amt">5.00</div>
                <div className="src">stake currency</div>
              </div>
            ) : null}
            {props.receivedXtz ? (
              <div className="airdrop-card">
                <div className="token"><span className="ic xtz">ꜩ</span> XTZ</div>
                <div className="amt">5.00</div>
                <div className="src">gas</div>
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
  | { kind: "idle"; message: string; txHash?: undefined; steps?: undefined }
  | { kind: "pending"; message: string; txHash?: string; steps?: FlowStep[] }
  | { kind: "success"; message: string; txHash?: string; steps?: FlowStep[] }
  | { kind: "error"; message: string; txHash?: string; steps?: undefined };

type EthereumProvider = ethers.Eip1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

function getEthereum(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum as EthereumProvider | undefined;
}

const TEZOS_X_EVM_WALLET_HINT =
  "Your wallet does not look like it is on Tezos X EVM yet. Add or switch to that network, then try again.";

function isUserRejectedWalletError(error: unknown): boolean {
  const e = error as { code?: number | string };
  return e.code === 4001 || e.code === "ACTION_REJECTED";
}

/** Ethers BAD_DATA / empty `0x` when reading a contract - usually wrong chain or token not deployed there. */
function isBadContractRpcResultError(error: unknown): boolean {
  const err = error as { code?: string; message?: string; shortMessage?: string };
  const text = `${err?.code ?? ""} ${err?.message ?? ""} ${err?.shortMessage ?? ""}`.toLowerCase();
  return (
    err?.code === "BAD_DATA" ||
    text.includes("bad_data") ||
    text.includes("could not decode result data")
  );
}

function shortenAddress(value: string | null, size = 6) {
  if (!value) return "Not connected";
  return `${value.slice(0, size)}...${value.slice(-4)}`;
}

function ExplorableAddress({
  address,
  displayText,
  type = "address",
}: {
  address: string | null;
  displayText?: string;
  type?: "address" | "token" | "contract";
}) {
  if (!address) return <>{displayText ?? "-"}</>;
  const text = displayText ?? shortenAddress(address, 8);
  const href =
    type === "token" && isEvmAddress(address)
      ? evmTokenUrl(address)
      : isEvmAddress(address)
        ? evmAddressUrl(address)
        : isTezosAddress(address)
          ? tezosContractUrl(address)
          : null;
  if (!href) return <>{text}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="explorer-link">
      {text}
    </a>
  );
}

function formatTokenAmount(value: bigint, decimals: number) {
  const formatted = ethers.formatUnits(value, decimals);
  return formatted.replace(/\.?0+$/, "");
}

// ---------------------------------------------------------------------------
// Tezos address helpers (browser-side, async Web Crypto SHA-256)
// ---------------------------------------------------------------------------

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
  // New storage layout:
  // pair (option %last_player address)
  //      (pair (option %last_player_evm bytes)
  //            (pair (nat %pot)
  //                  (pair (timestamp %session_end)
  //                        (pair (bool %claim_requested) (bool %payout_completed)))))
  const levelOne   = storage.args;              // [last_player, pair(last_player_evm,...)]
  const levelTwo   = levelOne?.[1]?.args;       // [last_player_evm, pair(pot,...)]
  const levelThree = levelTwo?.[1]?.args;       // [pot, pair(session_end,...)]
  const levelFour  = levelThree?.[1]?.args;     // [session_end, pair(claim_requested, payout_completed)]
  const levelFive  = levelFour?.[1]?.args;      // [claim_requested, payout_completed]

  // last_player (Tezos identity)
  const lastPlayerCell = levelOne?.[0];
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
  const lastPlayerEvmCell = levelTwo?.[0];
  let lastPlayerEvmHex: string | null = null;
  if (lastPlayerEvmCell?.prim === "Some") {
    const evmBytes = lastPlayerEvmCell.args?.[0]?.bytes;
    if (evmBytes) lastPlayerEvmHex = evmBytes; // 40-char hex, no 0x prefix
  }

  const potRaw = levelThree?.[0]?.int;
  const sessionEndRaw = levelFour?.[0]?.int;
  const claimedPrim = levelFive?.[0]?.prim;
  const payoutCompletedPrim = levelFive?.[1]?.prim;

  if (potRaw === undefined || !sessionEndRaw || claimedPrim === undefined) {
    throw new Error("Unexpected game contract storage shape.");
  }

  return {
    state: {
      potRaw: potRaw ?? "0",
      potDisplay: formatTokenAmount(BigInt(potRaw ?? "0"), CONFIG.usdcDecimals),
      sessionEnd: Number(sessionEndRaw),
      claimed: claimedPrim === "True",
      payoutCompleted: payoutCompletedPrim === "True",
      fetchedAt: Date.now(),
    },
    lastPlayerTezos,
    lastPlayerBytes,
    lastPlayerEvmHex,
  };
}



/** Fetch game contract storage (Michelson interface). */
async function fetchGameState(): Promise<GameState> {
  const response = await fetch(CONFIG.tezlinkStorageUrl);
  if (!response.ok) throw new Error(`Game service returned ${response.status}.`);

  const json = (await response.json()) as GameStorageJsonNode;
  const { state, lastPlayerTezos: tezosStr, lastPlayerBytes, lastPlayerEvmHex } = parseGameStorage(json);

  let lastPlayerTezos = tezosStr;
  if (!lastPlayerTezos && lastPlayerBytes) {
    try { lastPlayerTezos = await tezosAddressFromBinary(lastPlayerBytes); }
    catch (e) { console.warn("Could not decode last_player bytes:", e); }
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
): Promise<string | null> {
  const ethereum = getEthereum();
  if (!ethereum) return null;
  try {
    const provider = new ethers.BrowserProvider(ethereum);
    const escrow = new ethers.Contract(CONFIG.potAddress, ESCROW_ABI, provider);
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 999);
    if (winnerAddress) {
      const filterByWinner = escrow.filters.PaidOut(winnerAddress);
      const winnerLogs = await escrow.queryFilter(filterByWinner, fromBlock, "latest");
      if (winnerLogs.length > 0) {
        return winnerLogs[winnerLogs.length - 1].transactionHash ?? null;
      }
    }
    const allLogs = await escrow.queryFilter(escrow.filters.PaidOut(), fromBlock, "latest");
    if (allLogs.length > 0) {
      return allLogs[allLogs.length - 1].transactionHash ?? null;
    }
  } catch {
    /* RPC may reject wide log queries */
  }
  return null;
}

async function sleep(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatClockDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatEndedAgo(totalSeconds: number): string {
  if (totalSeconds < 60) return `Ended ${totalSeconds}s ago`;
  const minutes = Math.floor(totalSeconds / 60);
  return `Ended ${minutes}m ago`;
}

async function requestAirdrop(
  address: string,
  opts: { usdc: boolean; xtz: boolean },
): Promise<void> {
  if (!airdropApiUrl) {
    throw new Error("AIRDROP_NOT_CONFIGURED");
  }

  const response = await fetch(airdropApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      walletAddress: address,
      usdc: opts.usdc,
      xtz: opts.xtz,
      usdcAmount: opts.usdc ? AIRDROP_USDC_AMOUNT : undefined,
      xtzAmount: opts.xtz ? AIRDROP_XTZ_AMOUNT : undefined,
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
}

function collectErrorText(error: unknown): string {
  const e = error as {
    code?: string;
    message?: string;
    shortMessage?: string;
    info?: { error?: { message?: string } };
  };
  return [e?.code, e?.message, e?.shortMessage, e?.info?.error?.message]
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
      "The deposit did not go through. Most often you need at least 1 USDC, the right network (Tezos X EVM), " +
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
      "and check the pot on the right."
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
      : "You cancelled the session transaction in your wallet.";
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
      ? "The claim did not send. Check gas, that you are on Tezos X EVM, then refresh and try again."
      : "Could not start a new session. Check gas and that you are on Tezos X EVM, then try again.";
  }

  return (e?.shortMessage ?? e?.message ?? (kind === "claim" ? "Claim failed." : "Start session failed.")).trim();
}

function formatAirdropError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("AIRDROP_FAILED:")) {
    return message.replace("AIRDROP_FAILED:", "").trim() || "Airdrop failed.";
  }
  return "We couldn't airdrop starter funds right now. Please try again in a moment.";
}

function PotzLuckMark() {
  return (
    <>
      Po<span className="brand-name-tz">tz</span>Luck
    </>
  );
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
  const [isWalletDisconnected, setIsWalletDisconnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameStateError, setGameStateError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [actionState, setActionState] = useState<ActionState>({
    kind: "idle",
    message: "Connect your wallet, then press the button to send 1 USDC into the escrow.",
  });

  const [shellView, setShellView] = useState<"landing" | "game">("landing");
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
  const eventLogId = useRef(0);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const pushEventLog = useCallback((msg: string, tone: EventLogTone = "info", txHash?: string) => {
    eventLogId.current += 1;
    setEventLog((prev) => [...prev.slice(-19), { id: eventLogId.current, msg, tone, ...(txHash ? { txHash } : {}) }]);
  }, []);

  const dismissAirdropModal = useCallback(() => {
    setAirdropModalState({ open: false, usdc: false, xtz: false });
  }, []);

  const dismissDepositFx = useCallback(() => {
    setDepositFxId(0);
  }, []);

  const hasInjectedWallet = typeof window !== "undefined" && Boolean(getEthereum());
  const onExpectedNetwork = walletState.chainId === CONFIG.chainId;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sessionActive = gameState ? gameState.sessionEnd > nowSeconds : true;
  const canPressButton =
    hasInjectedWallet &&
    Boolean(walletState.address) &&
    onExpectedNetwork &&
    !isSubmitting &&
    sessionActive &&
    !gameState?.claimed;

  const canClaim =
    hasInjectedWallet &&
    Boolean(walletState.address) &&
    onExpectedNetwork &&
    !sessionActive &&
    !isClaiming &&
    Boolean(gameState);

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
    if (isSubmitting || isClaiming || isStartingSession) return "depositing";
    if (sessionActive && gameState && !gameState.claimed) return "play";
    return "idle";
  }, [
    walletState.address,
    onExpectedNetwork,
    isSubmitting,
    isClaiming,
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
  useEffect(() => {
    if (actionState.kind === "idle") return;
    const key = `${actionState.kind}:${actionState.message}:${actionState.txHash ?? ""}`;
    if (key === lastEventLogKey.current) return;
    lastEventLogKey.current = key;
    pushEventLog(
      actionState.message,
      actionState.kind === "success" ? "success" : actionState.kind === "error" ? "error" : "info",
      actionState.txHash,
    );
  }, [actionState.kind, actionState.message, actionState.txHash, pushEventLog]);

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
    if (isWalletDisconnected && !requestAccounts) {
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

    const ethereum = getEthereum();
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
      const network = await provider.getNetwork();

      if (network.chainId !== CONFIG.chainId) {
        const nextState = {
          address,
          chainId: network.chainId,
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
          chainId: network.chainId,
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
          chainId: network.chainId,
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
  }, [isWalletDisconnected]);

  const refreshGameState = useCallback(async () => {
    try {
      const nextState = await fetchGameState();
      setGameState(nextState);
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

  // When payout completes (after claim + relayer), refresh status text and event log; attach payout tx when found.
  useEffect(() => {
    if (!gameState?.payoutCompleted || !gameState?.claimed) {
      return;
    }

    let cancelled = false;
    const winner = gameState.lastPlayerAddress ?? walletState.address ?? null;

    void (async () => {
      let payoutHash: string | null = null;
      try {
        payoutHash = await fetchPayoutTxHash(winner);
      } catch {
        /* non-fatal */
      }
      if (cancelled) return;

      setActionState((prev) => {
        if (prev.message.toLowerCase().includes("payout complete")) {
          return prev;
        }
        const m = prev.message.toLowerCase();
        const inClaimPayoutFlow =
          m.includes("waiting for payout") ||
          m.includes("claim submitted") ||
          m.includes("pay out the winner") ||
          m.includes("claim transaction is confirmed");
        if (!inClaimPayoutFlow) {
          return prev;
        }
        return {
          kind: "success" as const,
          message:
            "Payout complete. The relayer finished paying the winner; their USDC balance should update shortly.",
          ...(payoutHash ? { txHash: payoutHash } : {}),
        };
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    gameState?.payoutCompleted,
    gameState?.claimed,
    gameState?.lastPlayerAddress,
    gameState?.potRaw,
    walletState.address,
  ]);

  useEffect(() => {
    void refreshWalletState(false);
    void refreshGameState();

    const intervalId = window.setInterval(() => {
      void refreshGameState();
    }, CONFIG.pollIntervalMs);

    const ethereum = getEthereum();
    if (!ethereum?.on) {
      return () => window.clearInterval(intervalId);
    }

    const handleAccountsChanged = () => {
      setIsWalletDisconnected(false);
      void refreshWalletState(false);
    };

    const handleChainChanged = () => {
      setIsWalletDisconnected(false);
      void refreshWalletState(false);
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.clearInterval(intervalId);
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [refreshGameState, refreshWalletState]);

  async function connectWallet() {
    setWalletError(null);
    setIsConnecting(true);
    setIsWalletDisconnected(false);
    setActionState({
      kind: "pending",
      message: "Connecting your wallet and checking your Tezos X balances…",
    });
    let willAirdrop = false;
    let needsUsdcAirdrop = false;
    let needsXtzAirdrop = false;
    try {
      const connectedWallet = await refreshWalletState(true);
      if (!connectedWallet?.address) {
        setActionState({
          kind: "idle",
          message: "Connect your wallet, then press the button to send 1 USDC into the escrow.",
        });
        return;
      }

      if (connectedWallet.chainId !== CONFIG.chainId) {
        setActionState({
          kind: "error",
          message: TEZOS_X_EVM_WALLET_HINT,
        });
        return;
      }

      needsUsdcAirdrop =
        connectedWallet.usdcBalanceRaw == null || connectedWallet.usdcBalanceRaw === 0n;
      needsXtzAirdrop =
        connectedWallet.xtzBalanceRaw == null || connectedWallet.xtzBalanceRaw === 0n;
      willAirdrop = needsUsdcAirdrop || needsXtzAirdrop;

      if (willAirdrop) {
        setActionState({
          kind: "pending",
          message: "Your wallet is low on starter funds, so we're preparing an airdrop…",
        });
        await requestAirdrop(connectedWallet.address, {
          xtz: needsXtzAirdrop,
          usdc: needsUsdcAirdrop,
        });
        await refreshWalletState(false);
        pushEventLog(airdropDeliveredLogMessage(needsUsdcAirdrop, needsXtzAirdrop), "success");
      }

      pushEventLog(
        "You're on Tezos X with funds to play — opening a round (if needed) and depositing 1 USDC into the pot.",
        "info",
      );

      let latestGameState = await refreshGameState();
      if (!latestGameState) {
        setActionState({
          kind: "error",
          message: "Could not load game state. Refresh and try again.",
        });
        return;
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const hasActiveSession = latestGameState.sessionEnd > nowSec && !latestGameState.claimed;

      if (!hasActiveSession) {
        setActionState({
          kind: "pending",
          message: "No active session is running, so we're opening a fresh round for you…",
        });
        const started = await startNewSession();
        if (!started) return;
        const active = await waitForActiveRound();
        if (!active) {
          setActionState({
            kind: "error",
            message:
              "New session was started, but Michelson-interface storage has not caught up yet. Wait a few seconds and press Play again.",
          });
          return;
        }
        latestGameState = active;
      }

      await pressButton();

      if (willAirdrop) {
        setAirdropModalState({
          open: true,
          xtz: needsXtzAirdrop,
          usdc: needsUsdcAirdrop,
        });
      }
    } catch (error) {
      if (error instanceof Error && (error.message === "AIRDROP_NOT_CONFIGURED" || error.message.startsWith("AIRDROP_FAILED:"))) {
        setActionState({ kind: "error", message: formatAirdropError(error) });
      } else {
        throw error;
      }
    } finally {
      setIsConnecting(false);
    }
  }

  async function disconnectWallet() {
    const ethereum = getEthereum();
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
    setIsWalletDisconnected(true);
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

  async function switchNetwork() {
    const ethereum = getEthereum();
    if (!ethereum) return;

    try {
      await ethereum.request?.({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CONFIG.chainIdHex }],
      });
    } catch (error) {
      const switchError = error as { code?: number };

      if (switchError.code === 4902) {
        await ethereum.request?.({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CONFIG.chainIdHex,
              chainName: "TezosX EVM",
              rpcUrls: [CONFIG.evmRpc],
              nativeCurrency: {
                name: "XTZ",
                symbol: "XTZ",
                decimals: 18,
              },
            },
          ],
        });
      } else {
        throw error;
      }
    }

    await refreshWalletState(false);
  }

  async function waitForGameStateUpdate(
    previousState: GameState,
    stepDefs: FlowStepDef[],
    depositTxHash: string,
  ) {
    const deadline = Date.now() + CONFIG.gameStateWaitTimeoutMs;
    const t0 = Date.now();

    const updateGameSyncProgress = () => {
      const elapsed = Math.floor((Date.now() - t0) / 1000);
      setActionState({
        kind: "pending",
        message: `Relayer is calling the NAC gateway on the EVM side to reach Tezlink and update the Michelson-interface storage with your deposit… (${elapsed}s)`,
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
      let nextState: GameState;
      try {
        nextState = await fetchGameState();
      } catch {
        throw new Error("GAME_SERVICE_UNAVAILABLE");
      }
      setGameState(nextState);
      setGameStateError(null);

      if (BigInt(nextState.potRaw) > BigInt(previousState.potRaw)) {
        return nextState;
      }
      if (Date.now() >= deadline) {
        throw new Error("GAME_STATE_RELAYER_TIMEOUT");
      }
    }
  }

  async function pressButton() {
    const ethereum = getEthereum();
    if (!ethereum) {
      setActionState({ kind: "error", message: "No browser wallet is available in this browser." });
      return;
    }

    // Read balances/address from the wallet RPC, not from React state: connectWallet can call this
    // immediately after refreshWalletState(), before a re-render commits walletState.
    const latestWallet = await refreshWalletState(false);
    if (!latestWallet.address) {
      setActionState({ kind: "error", message: "Connect your wallet before pressing the button." });
      return;
    }

    if (latestWallet.chainId !== CONFIG.chainId) {
      setActionState({ kind: "error", message: "Switch your wallet to TezosX EVM first." });
      return;
    }

    setIsSubmitting(true);
    const approvalNeeded =
      latestWallet.usdcAllowance !== null && latestWallet.usdcAllowance < PRESS_AMOUNT_UNITS;
    const depositSteps = pressStepDefs(approvalNeeded);

    setActionState({
      kind: "pending",
      message: "Loading game state from the Michelson interface…",
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
        throw new Error("This round was already claimed.");
      }

      if (currentState.sessionEnd <= Math.floor(Date.now() / 1000)) {
        throw new Error("This round has ended.");
      }

      if (approvalNeeded) {
        setActionState({
          kind: "pending",
          message: "Approve USDC when your wallet asks.",
          steps: markFlowSteps(depositSteps, "approve"),
        });
        const usdc = new ethers.Contract(CONFIG.usdcAddress, ERC20_ABI, signer);
        const approveTx = await usdc.approve(CONFIG.potAddress, PRESS_AMOUNT_UNITS);
        setActionState({
          kind: "pending",
          message: "Waiting for your approval transaction to confirm on Tezos X EVM…",
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
        message: "Waiting for your deposit transaction to confirm on Tezos X EVM…",
        steps: markFlowSteps(depositSteps, "evm_confirm"),
        txHash: tx.hash,
      });

      await tx.wait();

      await waitForGameStateUpdate(currentState, depositSteps, tx.hash);
      await refreshWalletState(false);

      setDepositFxId((id) => id + 1);
      setActionState({
        kind: "success",
        message: "Done. Your deposit is in and the Michelson-interface storage is updated.",
        txHash: tx.hash,
        steps: completeFlowSteps(depositSteps),
      });
    } catch (error) {
      setActionState({ kind: "error", message: formatPressButtonError(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function claimContract() {
    const ethereum = getEthereum();
    if (!ethereum) {
      setActionState({ kind: "error", message: "No browser wallet is available in this browser." });
      return;
    }

    if (!walletState.address) {
      setActionState({ kind: "error", message: "Connect your wallet before claiming." });
      return;
    }

    if (!onExpectedNetwork) {
      setActionState({ kind: "error", message: "Switch your wallet to TezosX EVM first." });
      return;
    }

    setIsClaiming(true);
    setActionState({
      kind: "pending",
      message: "Checking if you can claim…",
      steps: markFlowSteps(CLAIM_STEP_DEFS, "check"),
    });

    try {
      const currentState = await refreshGameState();
      if (currentState?.claimed) {
        const payoutHash = await fetchPayoutTxHash(walletState.address);
        setActionState({
          kind: "success",
          message: payoutHash
            ? "Winnings have already been claimed. Payout transaction below."
            : "Winnings have already been claimed.",
          txHash: payoutHash ?? undefined,
        });
        setIsClaiming(false);
        return;
      }

      // Pre-flight: compare EVM addresses directly - no RPC call needed now that
      // last_player_evm is stored in the contract.
      if (currentState?.lastPlayerAddress && walletState.address) {
        if (walletState.address.toLowerCase() !== currentState.lastPlayerAddress.toLowerCase()) {
          setActionState({
            kind: "error",
            message: `Only the last person who pressed can claim. Expected ${currentState.lastPlayerAddress}, but this wallet is ${walletState.address}.`,
          });
          setIsClaiming(false);
          return;
        }
      }

      setActionState({
        kind: "pending",
        message: "Confirm the claim in your wallet.",
        steps: markFlowSteps(CLAIM_STEP_DEFS, "wallet_claim"),
      });

      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const gateway = new ethers.Contract(CONFIG.cracPrecompile, GATEWAY_ABI, signer);

      const tx = await gateway.callMichelson(
        CONFIG.gameContract,
        "claim",
        `0x${CLAIM_PARAM_HEX}`,
        { value: 0n, gasLimit: 2_000_000n }
      );

      setActionState({
        kind: "pending",
        message: "Waiting for your claim transaction to confirm on Tezos X EVM…",
        steps: markFlowSteps(CLAIM_STEP_DEFS, "evm_claim"),
        txHash: tx.hash,
      });

      await tx.wait();
      await refreshGameState();

      setActionState({
        kind: "success",
        message: "Your claim transaction is confirmed on Tezos X EVM.",
        txHash: tx.hash,
        steps: completeFlowSteps(CLAIM_STEP_DEFS),
      });

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      setActionState({
        kind: "pending",
        message: "A small relayer is calling the NAC gateway to pay out the winner…",
        txHash: tx.hash,
        steps: completeFlowSteps(CLAIM_STEP_DEFS),
      });
    } catch (error) {
      console.error("[claim] error:", error);
      const err = error as { code?: string; message?: string; shortMessage?: string };
      const isRevert =
        err?.code === "CALL_EXCEPTION" ||
        err?.message?.toLowerCase().includes("reverted") ||
        err?.shortMessage?.toLowerCase().includes("reverted");

      if (isRevert) {
        const fresh = await refreshGameState();
        if (fresh?.claimed) {
          const payoutHash = await fetchPayoutTxHash(
            fresh.lastPlayerAddress ?? walletState.address ?? null,
          );
          setActionState({
            kind: "success",
            message:
              "Already claimed. Winnings went to the last player."
              + (payoutHash ? " See payout transaction below." : ""),
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
      setIsClaiming(false);
    }
  }

  async function startNewSession() {
    const ethereum = getEthereum();
    if (!ethereum) {
      setActionState({ kind: "error", message: "Connect your wallet and switch to TezosX EVM." });
      return false;
    }
    setIsStartingSession(true);
    setActionState({
      kind: "pending",
      message: "Confirm the new session in your wallet.",
      steps: markFlowSteps(START_SESSION_STEP_DEFS, "wallet_start"),
    });
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = (await provider.send("eth_accounts", [])) as string[];
      const network = await provider.getNetwork();
      if (accounts.length === 0 || network.chainId !== CONFIG.chainId) {
        setActionState({ kind: "error", message: "Connect your wallet and switch to TezosX EVM." });
        return false;
      }
      const signer = await provider.getSigner();
      const gateway = new ethers.Contract(CONFIG.cracPrecompile, GATEWAY_ABI, signer);
      const durationBytes = encodeMichelineInt(DEFAULT_SESSION_DURATION_SEC);
      const tx = await gateway.callMichelson(
        CONFIG.gameContract,
        "start_session",
        durationBytes,
        { value: 0n, gasLimit: 2_000_000n },
      );
      setActionState({
        kind: "pending",
        message: "Waiting for your session transaction to confirm on Tezos X EVM…",
        steps: markFlowSteps(START_SESSION_STEP_DEFS, "evm_start"),
        txHash: tx.hash,
      });
      await tx.wait();
      await refreshGameState();
      setActionState({
        kind: "success",
        message: `New session started (${DEFAULT_SESSION_DURATION_SEC / 60} min). Click Play to deposit ${CONFIG.pressAmount} USDC into the pot.`,
        txHash: tx.hash,
        steps: completeFlowSteps(START_SESSION_STEP_DEFS),
      });
      return true;
    } catch (error) {
      const err = error as { code?: string; message?: string; shortMessage?: string };
      const isRevert =
        err?.code === "CALL_EXCEPTION" ||
        err?.message?.toLowerCase().includes("reverted") ||
        err?.shortMessage?.toLowerCase().includes("reverted");
      setActionState({
        kind: "error",
        message: isRevert
          ? "Could not start a new session. Refresh, check you are on Tezos X EVM, and try again."
          : formatGatewayError(error, "start_session"),
      });
      return false;
    } finally {
      setIsStartingSession(false);
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

  const onPotClick = useCallback(async () => {
    if (potUiState === "connect") {
      await connectWallet();
      return;
    }
    if (potUiState === "wrong-net") {
      await switchNetwork();
      return;
    }
    if (potUiState === "idle") {
      const started = await startNewSession();
      if (!started) return;
      const active = await waitForActiveRound();
      if (active) {
        await pressButton();
      } else {
        setActionState({
          kind: "error",
          message:
            "New session was started, but Michelson-interface storage has not caught up yet. Wait a few seconds and press Play again.",
        });
      }
      return;
    }
    if (potUiState === "play") {
      await pressButton();
      return;
    }
    if (potUiState === "won") {
      const started = await startNewSession();
      if (!started) return;
      const active = await waitForActiveRound();
      if (active) {
        await pressButton();
      } else {
        setActionState({
          kind: "error",
          message:
            "New session was started, but Michelson-interface storage has not caught up yet. Wait a few seconds and press Play again.",
        });
      }
    }
  }, [potUiState, connectWallet, switchNetwork, startNewSession, pressButton, waitForActiveRound]);

  const potCopy = useMemo(() => {
    switch (potUiState) {
      case "connect":
        return { label: "Connect", sub: "wallet to play" };
      case "wrong-net":
        return { label: "Add Tezos X", sub: "network" };
      case "idle":
        return { label: "Play", sub: null };
      case "play":
        return { label: "Play", sub: `${CONFIG.pressAmount} USDC` };
      case "depositing":
        return { label: "…", sub: "working" };
      case "won":
        return { label: "Play", sub: null };
    }
  }, [potUiState, CONFIG.pressAmount]);

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
    Boolean(walletError) ||
    Boolean(gameStateError) ||
    Boolean(gameState?.claimed && !gameState?.payoutCompleted);

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
                href={TEZOS_X_TESTNET_DASHBOARD_URL}
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
                Native Atomic Composability
                <span className="landing-sub-h">comes to Tezos X.</span>
              </h1>
              <p className="landing-blurb">
                <PotzLuckMark /> is a simple game that helps you understand the power of NAC on Tezos X. You deposit
                into a pot on the EVM interface and watch game state update on the Tezlink interface without switching
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
              href={TEZOS_X_TESTNET_DASHBOARD_URL}
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
                <div className="stat-l">Pot size</div>
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
              {canClaim ? (
                <button
                  type="button"
                  className="btn primary sm claim-under-ends"
                  onClick={() => void claimContract()}
                  disabled={!canClaim}
                >
                  {isClaiming ? "Claiming..." : "Claim Winnings"}
                </button>
              ) : null}
              <div className={`session-state ${sessionActive ? "active" : ""}`}>
                <span className="dot" />
                {sessionActive ? "Session active" : "No active session"}
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
                <NetworkHelpPotz onAdd={() => void switchNetwork()} />
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
              {walletError ? (
                walletError === TEZOS_X_EVM_WALLET_HINT ? (
                  <p className="side-note" style={{ color: "var(--amber)" }}>
                    {TEZOS_X_EVM_WALLET_HINT}{" "}
                    <a
                      href={NETWORK_INFO.dashboardUrl}
                      className="explorer-link"
                      onClick={(e) => {
                        e.preventDefault();
                        setNetworkInfoOpen(true);
                      }}
                    >
                      See network information
                    </a>
                    .
                  </p>
                ) : (
                  <p className="side-note" style={{ color: "var(--amber)" }}>
                    {walletError}
                  </p>
                )
              ) : null}
              {gameState?.claimed &&
                walletState.address &&
                gameState.lastPlayerAddress &&
                walletState.address.toLowerCase() !== gameState.lastPlayerAddress.toLowerCase() ? (
                <p className="side-note" style={{ color: "var(--amber)" }}>
                  Only the last person who pressed can claim. Winner wallet:{" "}
                  <ExplorableAddress address={gameState.lastPlayerAddress} />.
                </p>
              ) : gameState?.claimed && !gameState?.payoutCompleted ? (
                <p className="side-note">
                  Waiting for payout. A service sends USDC to the winner. If nothing moves after a minute, refresh your
                  balance or check that the relayer is running.
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
