import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ethers } from "ethers";
import "./App.css";

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
const DEFAULT_TESTNET_FAUCET_URL = "https://tezosx-evm-usdc-airdrop.vercel.app/";
const faucetUrl =
  import.meta.env.VITE_FAUCET_URL?.trim() || DEFAULT_TESTNET_FAUCET_URL;

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

function evmAddressUrl(address: string) {
  return `${CONFIG.evmExplorerUrl}/address/${address}`;
}

function evmTokenUrl(address: string) {
  return `${CONFIG.evmExplorerUrl}/token/${address}`;
}

function evmTxUrl(txHash: string) {
  return `${CONFIG.evmExplorerUrl}/tx/${txHash}`;
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
      label: "Relayer is calling the cross-runtime gateway",
      detail:
        "The relayer is calling the cross-runtime gateway; Michelson-side game state is updating to match your deposit.",
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

function FlowProgress({ steps }: { steps: FlowStep[] }) {
  return (
    <ol className="flow-progress" aria-label="Steps">
      {steps.map((step, idx) => (
        <li
          key={step.id}
          className={`flow-step flow-step--${step.status}`}
          style={{ "--flow-step-index": idx } as CSSProperties}
          aria-current={step.status === "active" ? "step" : undefined}
        >
          <span className="flow-step-marker" aria-hidden />
          <div className="flow-step-body">
            <span className="flow-step-label">{step.label}</span>
            {step.detail ? <p className="flow-step-detail">{step.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

type JourneyPhase = "connect" | "network" | "ready";

function JourneyIntro({ phase }: { phase: JourneyPhase }) {
  return (
    <section className={`panel journey-intro journey-intro--${phase}`} aria-labelledby="journey-heading">
      <h2 id="journey-heading" className="journey-title">
        How this demo works
      </h2>
      {phase === "connect" ? (
        <>
          <p className="journey-lead">
            You use one <strong>Tezos X EVM</strong> wallet. USDC goes into the escrow pot on the <strong>EVM interface</strong>, while
            game state lives on the <strong>Michelson interface</strong>. <strong>Cross-runtime execution</strong> and a{" "}
            <strong>relayer</strong> keep the Michelson-side game in sync with your deposits, so no second wallet is needed.
          </p>
          <ul className="journey-bullets">
            <li>
              <strong>Tezos X EVM</strong>: USDC in the pot; deposits and payouts happen here.
            </li>
            <li>
              <strong>Michelson interface</strong>: tracks each 5-minute session. If you are the last depositor when a game session
              ends, you win.
            </li>
            <li>
              <strong>Cross-runtime execution</strong>: connects EVM actions to the Michelson game and carries your claim so the relayer can
              pay out the pot.
            </li>
          </ul>
          <p className="journey-hint">
            Sessions last 5 minutes. When one ends, click Start new session to begin another.
          </p>
        </>
      ) : phase === "network" ? (
        <p className="journey-lead">
          Please switch to <strong>Tezos X EVM</strong>. This app is wired for that network only, so cross-runtime execution can reach
          the game on the Michelson interface.
        </p>
      ) : (
        <>
          <p className="journey-lead">
            Connect your wallet on <strong>Tezos X EVM</strong>. Press the Button below to deposit into the escrow pot;{" "}
            <strong>cross-runtime execution</strong> then updates game state on the <strong>Michelson interface</strong>.
          </p>
          <ol className="journey-mini-steps">
            <li>To play, connect your wallet and click the start new session button.</li>
            <li>Press X button to deposit 1 USDC into the escrow/game pot from your wallet.</li>
            <li>
              The last depositor wins when the game session ends and can claim winnings from the pot using the wallet
              address they deposited with.
            </li>
          </ol>
        </>
      )}
    </section>
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

/** Tezos X testnet dashboard (RPC, chain ID, explorers). */
const TEZOS_X_TESTNET_DASHBOARD_URL = "https://demo.txpark.nomadic-labs.com/";

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
      "Your deposit went through, but the Michelson-side game view did not update in time. Wait a moment, refresh the page, " +
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

function App() {
  const [walletState, setWalletState] = useState<WalletState>({
    address: null,
    chainId: null,
    usdcBalance: null,
    usdcAllowance: null,
  });
  const [isWalletDisconnected, setIsWalletDisconnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameStateError, setGameStateError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [payoutTxHash, setPayoutTxHash] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>({
    kind: "idle",
    message: "Connect your wallet, then press the button to send 1 USDC into the escrow.",
  });

  const hasInjectedWallet = typeof window !== "undefined" && Boolean(getEthereum());
  const onExpectedNetwork = walletState.chainId === CONFIG.chainId;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sessionActive = gameState ? gameState.sessionEnd > nowSeconds : true;
  const needsApproval =
    walletState.address &&
    walletState.usdcAllowance !== null &&
    walletState.usdcAllowance < PRESS_AMOUNT_UNITS;
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

  const sessionLabel = useMemo(() => {
    if (!gameState) return "Loading...";
    return new Date(gameState.sessionEnd * 1000).toLocaleString();
  }, [gameState]);

  const journeyPhase = useMemo((): JourneyPhase => {
    if (!walletState.address) return "connect";
    if (!onExpectedNetwork) return "network";
    return "ready";
  }, [walletState.address, onExpectedNetwork]);

  const refreshWalletState = useCallback(async (requestAccounts = false) => {
    if (isWalletDisconnected && !requestAccounts) {
      setWalletState({ address: null, chainId: null, usdcBalance: null, usdcAllowance: null });
      return;
    }

    const ethereum = getEthereum();
    if (!ethereum) {
      setWalletState({ address: null, chainId: null, usdcBalance: null, usdcAllowance: null });
      setWalletError(null);
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = (await provider.send(
        requestAccounts ? "eth_requestAccounts" : "eth_accounts",
        [],
      )) as string[];

      if (accounts.length === 0) {
        setWalletState({ address: null, chainId: null, usdcBalance: null, usdcAllowance: null });
        setWalletError(null);
        return;
      }

      const address = ethers.getAddress(accounts[0]);
      const network = await provider.getNetwork();

      if (network.chainId !== CONFIG.chainId) {
        setWalletState({
          address,
          chainId: network.chainId,
          usdcBalance: null,
          usdcAllowance: null,
        });
        setWalletError(TEZOS_X_EVM_WALLET_HINT);
        return;
      }

      const usdc = new ethers.Contract(CONFIG.usdcAddress, ERC20_ABI, provider);
      try {
        const [balance, allowance] = await Promise.all([
          usdc.balanceOf(address) as Promise<bigint>,
          usdc.allowance(address, CONFIG.potAddress) as Promise<bigint>,
        ]);
        setWalletState({
          address,
          chainId: network.chainId,
          usdcBalance: formatTokenAmount(balance, CONFIG.usdcDecimals),
          usdcAllowance: allowance,
        });
        setWalletError(null);
      } catch (contractErr) {
        if (isBadContractRpcResultError(contractErr)) {
          setWalletError(TEZOS_X_EVM_WALLET_HINT);
        } else {
          setWalletError(
            contractErr instanceof Error ? contractErr.message : "Failed to load USDC balance.",
          );
        }
        setWalletState({
          address,
          chainId: network.chainId,
          usdcBalance: null,
          usdcAllowance: null,
        });
      }
    } catch (error) {
      if (isUserRejectedWalletError(error)) {
        setWalletError(null);
      } else if (isBadContractRpcResultError(error)) {
        setWalletError(TEZOS_X_EVM_WALLET_HINT);
      } else {
        setWalletError(error instanceof Error ? error.message : "Failed to connect wallet.");
      }
      setWalletState({ address: null, chainId: null, usdcBalance: null, usdcAllowance: null });
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

  // When payout completes (on load or after relayer syncs), fetch the payout tx hash and update UI.
  useEffect(() => {
    if (!gameState?.payoutCompleted) {
      setPayoutTxHash(null);
      return;
    }
    setActionState((prev) =>
      prev.message.toLowerCase().includes("waiting for payout")
        ? { kind: "success", message: "Payout complete. The winner has been paid." }
        : prev
    );
    void fetchPayoutTxHash(gameState.lastPlayerAddress ?? null).then((txHash) => {
      if (txHash) {
        setPayoutTxHash(txHash);
        setActionState((prev) =>
          prev.message.toLowerCase().includes("payout complete")
            ? { kind: "success", message: "Payout complete. The winner has been paid.", txHash }
            : prev
        );
      }
    });
  }, [gameState?.payoutCompleted, gameState?.lastPlayerAddress, gameState?.potRaw]);

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
    try {
      await refreshWalletState(true);
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
    setWalletState({ address: null, chainId: null, usdcBalance: null, usdcAllowance: null });
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
        message: `Relayer is calling the cross-runtime gateway and updating the Michelson interface… (${elapsed}s)`,
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

    if (!walletState.address) {
      setActionState({ kind: "error", message: "Connect your wallet before pressing the button." });
      return;
    }

    if (!onExpectedNetwork) {
      setActionState({ kind: "error", message: "Switch your wallet to TezosX EVM first." });
      return;
    }

    setIsSubmitting(true);
    const approvalNeeded = Boolean(needsApproval);
    const depositSteps = pressStepDefs(approvalNeeded);

    setActionState({
      kind: "pending",
      message: "Loading game state from the Michelson interface…",
      steps: markFlowSteps(depositSteps, "prepare"),
    });

    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const currentState = gameState ?? (await fetchGameState());

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
        message: "Waiting for confirmation…",
        steps: markFlowSteps(depositSteps, "evm_confirm"),
        txHash: tx.hash,
      });

      await tx.wait();

      await waitForGameStateUpdate(currentState, depositSteps, tx.hash);
      await refreshWalletState(false);

      setActionState({
        kind: "success",
        message: "Done. Your deposit is in and the Michelson-side view is updated.",
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
            ? "Winnings have already been claimed. Payout transfer below."
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
        message: "Waiting for confirmation…",
        steps: markFlowSteps(CLAIM_STEP_DEFS, "evm_claim"),
        txHash: tx.hash,
      });

      await tx.wait();
      await refreshGameState();

      setActionState({
        kind: "success",
        message: "Claim submitted. USDC goes to the winner next.",
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
              + (payoutHash ? " Payout transaction below." : ""),
            txHash: payoutHash ?? undefined,
          });
        } else {
          const notLast =
            err?.message?.includes("NOT_LAST_PLAYER") || err?.shortMessage?.includes("NOT_LAST_PLAYER");
          setActionState({
            kind: "error",
            message: notLast
              ? "Only the wallet that pressed last can claim. Switch wallet or wait until the round ends."
              : "Claim failed. Refresh the page and read the game state on the right.",
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
    if (!ethereum || !walletState.address || !onExpectedNetwork) {
      setActionState({ kind: "error", message: "Connect your wallet and switch to TezosX EVM." });
      return;
    }
    setIsStartingSession(true);
    setActionState({
      kind: "pending",
      message: "Confirm the new session in your wallet.",
      steps: markFlowSteps(START_SESSION_STEP_DEFS, "wallet_start"),
    });
    try {
      const provider = new ethers.BrowserProvider(ethereum);
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
        message: "Waiting for confirmation…",
        steps: markFlowSteps(START_SESSION_STEP_DEFS, "evm_start"),
        txHash: tx.hash,
      });
      await tx.wait();
      await refreshGameState();
      setActionState({
        kind: "success",
        message: `New session started (${DEFAULT_SESSION_DURATION_SEC / 60} min). Press the X button to play.`,
        txHash: tx.hash,
        steps: completeFlowSteps(START_SESSION_STEP_DEFS),
      });
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
    } finally {
      setIsStartingSession(false);
    }
  }

  return (
    <div className="app-shell">
      <main className="app app-layout">
        <div className="main-column">
          <header className="hero">
            <h1>XButton</h1>
            <p className="hero-copy">
              The XButton app uses a simple game to show cross-runtime execution and native atomic calls on Tezos.
            </p>
          </header>

          <JourneyIntro phase={journeyPhase} />

          <section className="panel wallet-panel">
            <div className="panel-header">
              <h2>Wallet</h2>
            <div className="wallet-actions">
              {!walletState.address ? (
                <button onClick={connectWallet} disabled={isConnecting || !hasInjectedWallet}>
                  {isConnecting ? "Connecting..." : "Connect wallet"}
                </button>
              ) : !onExpectedNetwork ? (
                <>
                  <button onClick={switchNetwork}>Switch to TezosX EVM</button>
                  <button className="secondary-button" onClick={disconnectWallet}>
                    Disconnect
                  </button>
                </>
              ) : (
                <>
                  <span className="chip success">Ready</span>
                  <button className="secondary-button" onClick={disconnectWallet}>
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid two">
            <div className="stat">
              <span>Wallet Address</span>
              <strong>
                <ExplorableAddress
                  address={walletState.address}
                  displayText={!walletState.address ? "Not connected" : undefined}
                />
              </strong>
            </div>
            <div className="stat">
              <span>YOUR USDC BALANCE</span>
              <strong>
                {walletState.usdcBalance ? `${walletState.usdcBalance} USDC` : "Unavailable"}
              </strong>
            </div>
          </div>

          <p className="inline-note faucet-hint">
            Need testnet funds? Get some from the{" "}
            <a
              href={faucetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="explorer-link"
            >
              faucet
            </a>
            .
          </p>

          {!hasInjectedWallet ? (
            <p className="inline-note error">No wallet add-on detected. Install something like MetaMask, then reload.</p>
          ) : null}
          {walletError ? (
            walletError === TEZOS_X_EVM_WALLET_HINT ? (
              <p className="inline-note error">
                {TEZOS_X_EVM_WALLET_HINT}{" "}
                <a
                  href={TEZOS_X_TESTNET_DASHBOARD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="explorer-link"
                >
                  See network information on the Tezos X testnet dashboard
                </a>
                .
              </p>
            ) : (
              <p className="inline-note error">{walletError}</p>
            )
          ) : null}
        </section>

        <section className="panel action-panel">
          <div className="panel-header">
            <h2>Press The Button</h2>
            {canStartNewSession ? (
              <button
                className="primary-button"
                onClick={startNewSession}
                disabled={!canStartNewSession || isStartingSession}
              >
                {isStartingSession ? "Starting..." : "Start new session"}
              </button>
            ) : (
              <span className="chip">{CONFIG.pressAmount} USDC</span>
            )}
          </div>

          <p className="action-copy">
            {canStartNewSession
              ? "Starts a new round and clears the game pot."
              : "Sends 1 USDC to the escrow. Approve USDC first if your wallet asks. The steps below explain each part in order."}
          </p>

          <div className="action-primary-buttons">
            <button className="primary-button" onClick={pressButton} disabled={!canPressButton}>
              {isSubmitting ? "Processing..." : "Press XButton"}
            </button>

            {canClaim ? (
              <button className="primary-button" onClick={claimContract} disabled={!canClaim}>
                {isClaiming ? "Claiming..." : "Claim Winnings"}
              </button>
            ) : null}
          </div>

          {!sessionActive && !gameState?.claimed ? (
            <p className="inline-note error">
              This round is over, so new deposits will not change the game. Start a new session to continue.
            </p>
          ) : null}
          {gameState?.payoutCompleted ? (
            <p className="inline-note">
              Payout complete. USDC has been sent to the winner.
              {" "}
              {payoutTxHash ? (
                <a href={evmTxUrl(payoutTxHash)} target="_blank" rel="noopener noreferrer" className="explorer-link">
                  View transfer
                </a>
              ) : (
                <a href={evmAddressUrl(CONFIG.potAddress)} target="_blank" rel="noopener noreferrer" className="explorer-link">
                  View escrow
                </a>
              )}
            </p>
          ) : gameState?.claimed &&
          walletState.address &&
          gameState.lastPlayerAddress &&
          walletState.address.toLowerCase() !== gameState.lastPlayerAddress.toLowerCase() ? (
            <p className="inline-note error">
              Only the last person who pressed can claim. Winner wallet:{" "}
              <ExplorableAddress address={gameState.lastPlayerAddress} />.
            </p>
          ) : gameState?.claimed ? (
            <p className="inline-note">
              Waiting for payout. A service sends USDC to the winner. If nothing moves after a minute, refresh your
              balance or check that the relayer is running.
            </p>
          ) : null}

          <div className={`status ${actionState.kind}`}>
            <span className="status-label">{actionState.kind.toUpperCase()}</span>
            <p className="status-message">{actionState.message}</p>
            {actionState.steps && actionState.steps.length > 0 ? (
              <FlowProgress steps={actionState.steps} />
            ) : null}
            {actionState.txHash ? (
              <p className="status-tx-link">
                <a
                  href={evmTxUrl(actionState.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="explorer-link"
                  title={actionState.txHash}
                >
                  See it on the explorer
                </a>
              </p>
            ) : null}
          </div>
        </section>
        </div>

        <aside className="network-sidebar" aria-label="Network and live game">
          <div className="sidebar-sticky">
            <h2 className="sidebar-heading">Game status & addresses</h2>
            <p className="sidebar-lead">
              Pulled from the Michelson interface (game contract) and from your wallet on the EVM interface (Tezos X EVM). Use it to sanity-check balances and addresses
              while you click through the demo.
            </p>
            <div className="sidebar-toolbar">
              <span className="chip">
                Polling about every{" "}
                {CONFIG.pollIntervalMs >= 1000 ? `${CONFIG.pollIntervalMs / 1000}s` : `${CONFIG.pollIntervalMs}ms`}
              </span>
            </div>

            <div className="sidebar-stats">
              <div className="stat">
                <span>Tezos X EVM chain ID</span>
                <strong>{CONFIG.chainId.toString()}</strong>
              </div>
              <div className="stat">
                <span>Pot balance (game)</span>
                <strong>{gameState ? `${gameState.potDisplay} USDC` : "Loading..."}</strong>
              </div>
              <div className="stat">
                <span>Last player</span>
                <strong>
                  {!gameState ? (
                    "Loading..."
                  ) : gameState.lastPlayerAddress ? (
                    <ExplorableAddress address={gameState.lastPlayerAddress} />
                  ) : gameState.lastPlayerTezos ? (
                    "Resolving…"
                  ) : (
                    "-"
                  )}
                </strong>
              </div>
              <div className="stat">
                <span>Session ends</span>
                <strong>{sessionLabel}</strong>
              </div>
              <div className="stat">
                <span>Claimed this round</span>
                <strong>{gameState ? (gameState.claimed ? "Yes" : "No") : "Loading..."}</strong>
              </div>
              <div className="stat">
                <span>EVM escrow (pot)</span>
                <strong>
                  <ExplorableAddress address={CONFIG.potAddress} />
                </strong>
              </div>
              <div className="stat">
                <span>Michelson game (KT1)</span>
                <strong>
                  <ExplorableAddress address={CONFIG.gameContract} />
                </strong>
              </div>
              <div className="stat">
                <span>Cross-runtime gateway (EVM)</span>
                <strong>
                  <ExplorableAddress address={CONFIG.cracPrecompile} />
                </strong>
              </div>
            </div>

            {gameState ? (
              <p className="inline-note sidebar-note">
                Last Michelson-side refresh: {new Date(gameState.fetchedAt).toLocaleTimeString()}
              </p>
            ) : null}
            {gameStateError ? <p className="inline-note error">{gameStateError}</p> : null}
          </div>
        </aside>
      </main>
    </div>
  );
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export default App;
