import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tezos X EVM Faucet",
  description:
    "Tezos X Testnet Faucet — fixed USDC or native XTZ payouts on Tezos X EVM.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
