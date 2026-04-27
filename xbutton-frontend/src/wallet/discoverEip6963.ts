/**
 * EIP-6963: announce providers on request; fall back to window.ethereum when no wallet announces
 * (older extensions). https://eips.ethereum.org/EIPS/eip-6963
 */
import type { Eip1193Provider } from "ethers";

export type Eip6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

export type Eip6963ProviderDetail = {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
};

const RDNS_KEY = "potzluck_eip6963_rdns_v1";
const UUID_FALLBACK = "io.legacy.window-ethereum";

function dedupeByProvider(details: Eip6963ProviderDetail[]): Eip6963ProviderDetail[] {
  const seen = new Set<unknown>();
  return details.filter((d) => {
    if (seen.has(d.provider)) return false;
    seen.add(d.provider);
    return true;
  });
}

export function getSavedWalletRdns(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(RDNS_KEY);
  } catch {
    return null;
  }
}

export function saveWalletRdns(rdns: string) {
  try {
    localStorage.setItem(RDNS_KEY, rdns);
  } catch {
    /* ignore */
  }
}

export function clearSavedWalletRdns() {
  try {
    localStorage.removeItem(RDNS_KEY);
  } catch {
    /* ignore */
  }
}

export function findDetailBySavedRdns(
  details: Eip6963ProviderDetail[],
  saved: string,
): Eip6963ProviderDetail | undefined {
  return details.find((d) => d.info.rdns === saved) || details.find((d) => d.info.uuid === saved);
}

export function discoverEip6963Wallets(): Promise<Eip6963ProviderDetail[]> {
  if (typeof window === "undefined") {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    const byRdns = new Map<string, Eip6963ProviderDetail>();

    const onAnnounce = (event: Event) => {
      const d = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      if (d?.info && d?.provider) {
        const k = d.info.rdns || d.info.uuid;
        if (!byRdns.has(k)) {
          byRdns.set(k, d);
        }
      }
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      const from6963 = dedupeByProvider([...byRdns.values()]);

      const w = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
      const hasSameAsWindow = w ? from6963.some((x) => x.provider === w) : true;

      const out: Eip6963ProviderDetail[] = [...from6963];
      if (w && !hasSameAsWindow) {
        out.push({
          info: {
            uuid: "eip-1193-legacy",
            name: "Default browser extension (window.ethereum)",
            icon: "",
            rdns: UUID_FALLBACK,
          },
          provider: w,
        });
      }
      if (out.length === 0 && w) {
        out.push({
          info: {
            uuid: "eip-1193-legacy",
            name: "Browser extension (window.ethereum)",
            icon: "",
            rdns: UUID_FALLBACK,
          },
          provider: w,
        });
      }

      resolve(dedupeByProvider(out));
    }, 300);
  });
}
