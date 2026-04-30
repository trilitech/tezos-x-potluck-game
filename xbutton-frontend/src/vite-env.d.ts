/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TEZOSX_NETWORK?: string;

  readonly VITE_PREVIEWNET_USDC_ADDRESS?: string;
  readonly VITE_PREVIEWNET_POT_ADDRESS?: string;
  readonly VITE_PREVIEWNET_GAME_CONTRACT?: string;
  readonly VITE_PREVIEWNET_CRAC_PRECOMPILE?: string;

  readonly VITE_TESTNET_USDC_ADDRESS?: string;
  readonly VITE_TESTNET_POT_ADDRESS?: string;
  readonly VITE_TESTNET_GAME_CONTRACT?: string;
  readonly VITE_TESTNET_CRAC_PRECOMPILE?: string;

  readonly VITE_USDC_ADDRESS?: string;
  readonly VITE_POT_ADDRESS?: string;
  readonly VITE_GAME_CONTRACT?: string;
  readonly VITE_CRAC_PRECOMPILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
