import { NextResponse } from "next/server";
import { ethers } from "ethers";

/** Public testnet faucet: allow any browser origin (no credentials). */
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonWithCors(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: corsHeaders(),
  });
}

const rpcUrl = process.env.EVM_RPC;
const tokenAddress = process.env.AIRDROP_TOKEN_ADDRESS;
const tokenSymbol = process.env.AIRDROP_TOKEN_SYMBOL ?? "USDC";
const tokenDecimals = Number(process.env.AIRDROP_TOKEN_DECIMALS ?? "6");
const tokenAmount = process.env.AIRDROP_AMOUNT ?? "10";
const nativeSymbol = process.env.NATIVE_AIRDROP_SYMBOL ?? "XTZ";
const nativeAmount = process.env.NATIVE_AIRDROP_AMOUNT ?? "5";
const explorerBaseUrl = process.env.EXPLORER_TX_URL_BASE ?? null;
const gasReserve = ethers.parseEther(process.env.AIRDROP_GAS_RESERVE ?? "0.001");
const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
];
type AirdropAsset = "usdc" | "xtz";
type TransferRequest = {
  asset: AirdropAsset;
  amount: string;
};

type AirdropRequestBody = {
  walletAddress?: string;
  asset?: AirdropAsset;
  xtz?: boolean;
  usdc?: boolean;
  /** Optional per-request amount (string or number). Capped by env default (see NATIVE_AIRDROP_MAX / AIRDROP_AMOUNT_MAX). */
  xtzAmount?: string | number;
  usdcAmount?: string | number;
};

function getPrivateKeys() {
  const source = process.env.AIRDROP_PRIVATE_KEYS ?? process.env.PRIVATE_KEYS ?? "";

  return source
    .split(/[,\n]/)
    .map((key) => key.trim())
    .filter(Boolean);
}

function getProvider() {
  if (!rpcUrl) {
    throw new Error("Missing EVM_RPC environment variable.");
  }

  return new ethers.JsonRpcProvider(rpcUrl);
}

function getTokenContract(providerOrSigner: ethers.JsonRpcProvider | ethers.Wallet) {
  if (!tokenAddress) {
    throw new Error("Missing AIRDROP_TOKEN_ADDRESS environment variable.");
  }

  if (!ethers.isAddress(tokenAddress)) {
    throw new Error("AIRDROP_TOKEN_ADDRESS is not a valid EVM address.");
  }

  return new ethers.Contract(tokenAddress, erc20Abi, providerOrSigner);
}

async function getAvailableTokenWallet(
  provider: ethers.JsonRpcProvider,
  amountUnits: bigint,
) {
  const privateKeys = getPrivateKeys();

  if (privateKeys.length === 0) {
    throw new Error("No private keys configured. Set AIRDROP_PRIVATE_KEYS in your env.");
  }

  for (const privateKey of privateKeys) {
    const wallet = new ethers.Wallet(privateKey, provider);
    const nativeBalance = await provider.getBalance(wallet.address);
    const token = getTokenContract(wallet);
    const tokenBalance = (await token.balanceOf(wallet.address)) as bigint;

    if (nativeBalance >= gasReserve && tokenBalance >= amountUnits) {
      return wallet;
    }
  }

  throw new Error(
    `No funded wallet has enough ${tokenSymbol} and native gas balance to cover the airdrop.`,
  );
}

function bodyAmountToString(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

/** Use body amount if valid; otherwise env default. Cap at `maxStr` (wei / units) to limit faucet drain. */
function resolveXtzAmountString(body: AirdropRequestBody): string {
  const fromBody = bodyAmountToString(body.xtzAmount);
  const base = fromBody || nativeAmount;
  const maxStr = process.env.NATIVE_AIRDROP_MAX ?? nativeAmount;
  const wei = ethers.parseEther(base);
  const maxWei = ethers.parseEther(maxStr);
  const finalWei = wei > maxWei ? maxWei : wei <= BigInt(0) ? BigInt(0) : wei;
  if (finalWei <= BigInt(0)) {
    throw new Error("Invalid XTZ amount.");
  }
  return ethers.formatEther(finalWei);
}

function resolveTokenAmountString(body: AirdropRequestBody): string {
  const fromBody = bodyAmountToString(body.usdcAmount);
  const base = fromBody || tokenAmount;
  const maxStr = process.env.AIRDROP_AMOUNT_MAX ?? tokenAmount;
  const units = ethers.parseUnits(base, tokenDecimals);
  const maxUnits = ethers.parseUnits(maxStr, tokenDecimals);
  const finalUnits = units > maxUnits ? maxUnits : units <= BigInt(0) ? BigInt(0) : units;
  if (finalUnits <= BigInt(0)) {
    throw new Error("Invalid token amount.");
  }
  return ethers.formatUnits(finalUnits, tokenDecimals);
}

async function getAvailableNativeWallet(
  provider: ethers.JsonRpcProvider,
  amountWei: bigint,
) {
  const privateKeys = getPrivateKeys();

  if (privateKeys.length === 0) {
    throw new Error("No private keys configured. Set AIRDROP_PRIVATE_KEYS in your env.");
  }

  for (const privateKey of privateKeys) {
    const wallet = new ethers.Wallet(privateKey, provider);
    const nativeBalance = await provider.getBalance(wallet.address);

    if (nativeBalance >= amountWei + gasReserve) {
      return wallet;
    }
  }

  throw new Error(
    `No funded wallet has enough ${nativeSymbol} balance to cover the airdrop and gas.`,
  );
}

function getTransferRequests(body: AirdropRequestBody): TransferRequest[] {
  const transfers: TransferRequest[] = [];

  if (body.usdc) {
    transfers.push({ asset: "usdc", amount: resolveTokenAmountString(body) });
  }

  if (body.xtz) {
    transfers.push({ asset: "xtz", amount: resolveXtzAmountString(body) });
  }

  if (transfers.length > 0) {
    return transfers;
  }

  const asset: AirdropAsset = body.asset === "xtz" ? "xtz" : "usdc";

  return [
    {
      asset,
      amount: asset === "xtz" ? resolveXtzAmountString(body) : resolveTokenAmountString(body),
    },
  ];
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AirdropRequestBody;
    const walletAddress = body.walletAddress?.trim();

    if (!walletAddress) {
      return jsonWithCors({ ok: false, message: "Wallet address is required." }, { status: 400 });
    }

    if (!ethers.isAddress(walletAddress)) {
      return jsonWithCors({ ok: false, message: "Wallet address is not a valid EVM address." }, { status: 400 });
    }

    const provider = getProvider();
    const transfers = getTransferRequests(body);
    const results: Array<{
      asset: AirdropAsset;
      amount: string;
      symbol: string;
      txHash: string;
      explorerUrl: string | null;
    }> = [];

    for (const transferRequest of transfers) {
      if (transferRequest.asset === "xtz") {
        const amountWei = ethers.parseEther(transferRequest.amount);
        const wallet = await getAvailableNativeWallet(provider, amountWei);
        const tx = await wallet.sendTransaction({
          to: walletAddress,
          value: amountWei,
          gasLimit: BigInt(10_000_000),
        });

        await tx.wait();
        results.push({
          asset: "xtz",
          amount: transferRequest.amount,
          symbol: nativeSymbol,
          txHash: tx.hash,
          explorerUrl: explorerBaseUrl ? `${explorerBaseUrl}${tx.hash}` : null,
        });
        continue;
      }

      const amountUnits = ethers.parseUnits(transferRequest.amount, tokenDecimals);
      const wallet = await getAvailableTokenWallet(provider, amountUnits);
      const token = getTokenContract(wallet);
      const tx = await token.transfer(walletAddress, amountUnits);

      await tx.wait();
      results.push({
        asset: "usdc",
        amount: transferRequest.amount,
        symbol: tokenSymbol,
        txHash: tx.hash,
        explorerUrl: explorerBaseUrl ? `${explorerBaseUrl}${tx.hash}` : null,
      });
    }

    const summary = results.map((result) => `${result.amount} ${result.symbol}`).join(" and ");

    return jsonWithCors({
      ok: true,
      message: `${summary} sent successfully to ${walletAddress}.`,
      txHash: results[0]?.txHash,
      amount: results[0]?.amount,
      explorerUrl: results[0]?.explorerUrl ?? null,
      transfers: results,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Airdrop request failed unexpectedly.";

    return jsonWithCors({ ok: false, message }, { status: 500 });
  }
}
