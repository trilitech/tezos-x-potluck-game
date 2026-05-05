import type { Eip1193Provider } from "ethers";

export type SelectedEthereumProvider = Eip1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export const selectedEvmProviderRef: { current: SelectedEthereumProvider | null } = { current: null };

export function getEvmProvider(): SelectedEthereumProvider | undefined {
  return selectedEvmProviderRef.current ?? undefined;
}

export function setSelectedEvmProvider(provider: SelectedEthereumProvider | null) {
  selectedEvmProviderRef.current = provider;
}
