# Getting Started with Native Atomic Composability in Tezos X

Tezos X introduces a simple but powerful idea: developers can build applications that use both an EVM interface and a Michelson interface in the same system.

If you already know Solidity, MetaMask, Rabby, ethers, and how to deploy to EVM testnets, Tezos X lets you keep that workflow while also reaching Michelson contracts and Michelson-side storage.

This is made possible through Native Atomic Composability.

In this tutorial, we’ll use a very simple example to understand how that works. We’ll build a counter where:

- a user signs a transaction on the EVM interface
- a Solidity contract forwards the action through a Tezos X gateway precompile, which is the EVM-side entrypoint for Native Atomic Composability
- the **counter itself lives on the Michelson interface** (one place to read the truth)
- `**increment()`** and `**decrement()**` are both ordinary EVM-wallet calls, but each one forwards through the gateway to the **same** Michelson counter—so there is a single number to read on the Michelson side, not two independent tallies on two runtimes

By the end, you will have followed concrete steps: originate Michelson, deploy Solidity, call functions, read explorers, read logs, and see what happens when something fails (which is where atomicity shows up).

---

## Official documentation and network values (read this first)

**Canonical docs (RPCs, chain IDs, explorers, faucet):** [Link TBD — Tezos X network & tooling documentation]().

The hosted stack you use (for example a public testnet, previewnet, or a future dashboard) will publish the values you must paste into MetaMask, Rabby, Temple, and your scripts. **Do not hard-code URLs from this file** until you have replaced them from the doc above or from your dashboard.


| What you need               | Where to get it          | Notes                                                     |
| --------------------------- | ------------------------ | --------------------------------------------------------- |
| EVM RPC URL                 | Official doc / dashboard | Tentative until you paste the current value               |
| EVM chain ID                | Official doc / dashboard | Same                                                      |
| Tezos X Tezlink RPC URL    | Official doc / dashboard | Used for Temple, SmartPy IDE deployment, and `curl` storage checks |
| EVM block explorer          | Official doc / dashboard | Often a Blockscout-style host; the dashboard will name it |
| Michelson explorer          | Official doc / dashboard | Used to inspect `KT1` storage                             |
| Faucet                      | Official doc / dashboard | For both sides if applicable                              |


This tutorial’s screenshots and wording assume you already have those strings in a scratch pad before you start.

---

## What is Tezos X?

Tezos X is designed as an integrated system with multiple execution interfaces, including an EVM interface and a Michelson interface, while still benefiting from the broader Tezos security and governance model (Tezos X, Blockchain designed to evolve: the road to Tezos X).

For developers, the practical takeaway is:

- the EVM interface is where Solidity contracts and EIP-1193 wallet interactions live
- the Michelson interface is where Michelson contracts and Michelson storage live
- Native Atomic Composability is what allows those two interfaces to work together

That means a contract call that starts from the EVM side can trigger logic on the Michelson side, and a contract call that starts from the Michelson side can trigger logic on the EVM side, **in the same EVM transaction**, in the same spirit as calling another contract on the same chain: you are not asked here to bolt on a separate bridge project, wire relayers, or split trust across two asynchronous steps. (If you later use patterns that *do* split EVM observation from Michelson updates, that is a different architecture; this tutorial stays on the single-transaction path.)

On the EVM side, the system exposes a **fixed gateway address** (a precompile). This gateway is the contract-like system entrypoint your Solidity code uses to invoke Native Atomic Composability. Your Solidity code treats it like any other contract: you hold an `INativeAtomicGateway` at that address and call `callMichelson(...)`.

---

## Why should Solidity developers care?

If you already build on EVM, the interesting part of Tezos X is that you do not need to abandon the tools and patterns you already know.

You still get to use all of the EVM tools you’re used to working with.

At the same time, you can also reach the Michelson side of Tezos X.

That is useful when:

- part of your app should stay EVM-shaped for users and developers
- part of your app logic or storage is better represented on the Michelson side
- you want one application story across both interfaces

---

## What are we building?

We’re going to build a small counter example.

The application has two pieces:

- a Michelson contract on the Tezos X Michelson interface — it holds the **actual** counter in storage
- a Solidity contract on the Tezos X EVM interface — it only **forwards** `increment` and `decrement` through the gateway; it does not try to be a second source of truth

When the user calls `increment()` or `decrement()` on the EVM contract:

- the Solidity contract calls the gateway for Native Atomic Composability
- the gateway routes the call to the Michelson contract’s matching entrypoint
- the Michelson storage changes

We’ll also emit an **event** on the EVM side so you can inspect the transaction in the EVM explorer’s **Logs** tab (same idea as any other Solidity event).

---

## What do you need before starting?

You do not need access to any private repository to follow this tutorial.

You do need:

- MetaMask, Rabby, or another EIP-1193 wallet for the EVM interface
- Temple Wallet for the Michelson interface
- test funds from the faucet linked in the official doc / dashboard
- a Solidity workflow such as Remix, Hardhat, or Foundry
- the **SmartPy IDE**, which is a web-based IDE for writing Tezos smart contracts in SmartPy, a Python-flavored language for Tezos. If you already know Remix, the SmartPy IDE plays a similar role on the Tezos side: write the contract, run it, connect a wallet, and deploy from the browser
- a wallet on the Michelson side that is funded with enough **XTZ** to pay gas fees when you deploy the contract. You can get test XTZ from the faucet linked in the table at the start of this tutorial

---

## Understanding the gateway call

On the Tezos X EVM network you target, the gateway / precompile address for Native Atomic Composability will be published next to the other network values. A typical form looks like this (verify against the official doc):

`0xff00000000000000000000000000000000000007`

The gateway exposes a function that, from Solidity’s point of view, looks like this:

```solidity
interface INativeAtomicGateway {
    function callMichelson(
        string calldata destination,
        string calldata entrypoint,
        bytes calldata data
    ) external payable;
}
```

The parameters mean:

- **destination:** the Michelson contract address, usually a `KT1`… A `KT1` address is the standard Tezos smart contract address format on the Michelson side
- **entrypoint:** the Michelson entrypoint name, for example `"increment"` or `"decrement"`
- **data:** the Michelson parameter encoded as bytes

For a Michelson entrypoint that accepts unit, the encoded parameter is:

`0x030b`

We will use that value for both `increment` and `decrement` in this example.

---

## Part A — Michelson counter (do this first)

### A.1 Why Michelson comes first

You need the `KT1` address before you deploy the Solidity contract’s constructor. A `KT1` address is a Tezos smart contract address on the Michelson side. Doing Michelson first also matches how you’ll verify storage: you establish the baseline, then you change it from the EVM side.

### A.2 Write the contract in SmartPy

Small counter with **`decrement`** (so the EVM flow is not only “add one”) and **`reset`** to re-run the demo. Storage is one int starting at **`0`**.

In the **[SmartPy IDE](https://smartpy.io/ide)**, replace the default template with:

**Contract**

```python
import smartpy as sp  # type: ignore

@sp.module
def main():
    class CounterNacTutorial(sp.Contract):
        def __init__(self):
            self.data.counter = 0  # storage is a simple int, starts at 0

        @sp.entrypoint
        def increment(self):
            self.data.counter += 1

        @sp.entrypoint
        def decrement(self):
            assert self.data.counter > 0, "at zero"
            self.data.counter -= 1

        @sp.entrypoint
        def reset(self):
            self.data.counter = 0


if "main" in __name__:

    @sp.add_test()
    def test():
        sc = sp.test_scenario("CounterNacTutorial", main)
        c = main.CounterNacTutorial()
        sc.h1("Originate")
        sc += c

        sc.h2("Increment twice")
        c.increment()
        c.increment()
        sc.verify(c.data.counter == 2)

        sc.h2("Decrement once")
        c.decrement()
        sc.verify(c.data.counter == 1)

        sc.h2("Reset")
        c.reset()
        sc.verify(c.data.counter == 0)

        sc.h2("Decrement at zero should fail")
        c.decrement(_valid=False, _exception="at zero")
```

Click **Run**, then originate on the Tezos X network (**A.4**).

**Entrypoints**

- **`increment`**: +1.
- **`decrement`**: −1, fails at 0 with `"at zero"`.
- **`reset`**: storage → 0.

Solidity will call these through the gateway as `"increment"`, `"decrement"`, and `"reset"`.

### A.3 Connect Temple

1. Open the official doc / dashboard and find the **Tezos X Tezlink RPC** URL.
2. In Temple → **Settings** → **Networks** → **Add network**, paste the RPC and the other fields exactly as documented.
3. Switch Temple to that network.
4. Use the faucet from the same doc / dashboard so Temple has test funds.

### A.4 Deploy the SmartPy contract from the SmartPy IDE

Deploy from [smartpy.io/ide](https://smartpy.io/ide) (same flow as Remix: edit → Run → Deploy).

1. Open [smartpy.io/ide](https://smartpy.io/ide).
2. Editor should contain the **A.2** contract.
3. Click `**Run**` to make sure the contract compiles successfully.
4. Click `**Deploy Contract**`, then click `**Continue**`.
5. In the deploy form, either paste the **Tezos X Tezlink RPC** value from earlier into the `**Node**` and `**Network**` input fields, or select `**Tezos X Previewnet**` from the network dropdown if it is already listed in the IDE.
6. Click `**Wallet**`, select an account, and use **Beacon** to connect a wallet you already have on the Tezos X Michelson network.
7. Make sure that wallet is funded with enough `**XTZ**` to pay gas fees. If it is not, use the faucet linked in the table at the start of this tutorial.
8. Click `**Estimate Cost**`. If fee estimation fails, enter a fee manually so you can continue.
9. Click `**Deploy Contract**`.
10. Wait for the success state. When deployment finishes, the IDE shows a `**Successful Deployment**` checkmark together with your new `**KT1`** contract address.

At the end you must have:

- the `**KT1` contract address** (from the SmartPy IDE deployment success screen)
- confirmation that **initial storage is `0`** (you will double-check in the next step via explorer or `curl`)

### A.5 Verify storage is 0 (before any EVM call)

**Option 1 — explorer**

1. Open the **Michelson-side explorer** URL from the official doc / dashboard (not the EVM explorer).
2. Paste your `KT1` into the search box.
3. Open the contract page and find **storage**.
4. Confirm it shows `**0`**.

**Option 2 — RPC (`curl`)**

1. Take the **Tezos X Tezlink RPC** base URL from the doc / dashboard (call it `{MICHELSON_RPC}`).
2. Run (replace `{KT1}`):

```bash
curl -s "{MICHELSON_RPC}/chains/main/blocks/head/context/contracts/{KT1}/storage"
```

1. Confirm the returned JSON still represents `**0**`.

Leave that terminal tab or browser tab open; you will come back to it after the EVM transaction.

---

## Part B — EVM contract and wallet interaction

### B.1 Connecting an EVM wallet

1. Open the official doc / dashboard.
2. Copy **EVM RPC**, **chain ID**, **currency symbol**, and **EVM explorer URL**.
3. In MetaMask, Rabby, or your preferred EIP-1193 wallet → **Settings** → **Networks** → **Add network**, paste those values.
4. Switch that wallet to the network.

### B.2 Writing the Solidity contract

Create a Solidity contract like this. The constructor takes the Michelson `KT1` as a string. `**increment`** and `**decrement**` both call `callMichelson`; the counter you care about is **only** on Michelson.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INativeAtomicGateway {
    function callMichelson(
        string calldata destination,
        string calldata entrypoint,
        bytes calldata data
    ) external payable;
}

contract EvmToMichelsonCounter {
    INativeAtomicGateway public immutable gateway;
    string public immutable michelsonCounter;

    bytes internal constant UNIT = hex"030b";

    event CounterCalled(
        address indexed caller,
        string action,
        string michelsonCounter
    );

    constructor(string memory michelsonCounterAddress) {
        gateway = INativeAtomicGateway(0xff00000000000000000000000000000000000007);
        michelsonCounter = michelsonCounterAddress;
    }

    function increment() external {
        gateway.callMichelson(michelsonCounter, "increment", UNIT);
        emit CounterCalled(msg.sender, "increment", michelsonCounter);
    }

    function decrement() external {
        gateway.callMichelson(michelsonCounter, "decrement", UNIT);
        emit CounterCalled(msg.sender, "decrement", michelsonCounter);
    }
}
```

**Important:** replace the gateway literal `0xff00000000000000000000000000000000000007` with the address published for **your** network if the official doc says otherwise.

### B.3 Deploying the Solidity contract

Deploy **`EvmToMichelsonCounter`** from **[Remix](https://remix.ethereum.org)** the way you would any other EVM testnet contract (this doc does not spell out Remix steps).

**Network:** use the **Tezos X EVM** RPC and chain ID from the official doc / the table at the top of this tutorial. Your wallet—and Remix’s selected environment—must be on that network before you deploy.

**Constructor:** one argument, the Michelson counter `KT1` string from Part A (e.g. `"KT1…"`).

You can deploy the same bytecode **locally** (Hardhat, Foundry, etc.) instead of Remix if you prefer; keep the same network and constructor argument.

### B.4 Calling `increment()` from your EVM wallet

1. In your EVM wallet, stay on the Tezos X EVM network.
2. Open your wallet’s contract interaction UI for the deployed `EvmToMichelsonCounter` (or use Remix’s “At Address” + ABI).
3. Call `**increment()`**.
4. Approve the transaction.
5. When it confirms, copy the **transaction hash**.

### B.5 Check the EVM explorer — receipt and logs

1. Open the **EVM explorer** from the official doc / dashboard (this is often a Blockscout-style UI; the dashboard will tell you the product name).
2. Paste the transaction hash into the search box.
3. Open the transaction page.
4. Confirm status **Success**.
5. Open the **Logs** (or **Events**) tab.
6. Find the `**CounterCalled`** event and check that `**action**` is `increment` and `**michelsonCounter**` matches your `KT1`.

That answers the “why don’t we use logs?” point: you now have a concrete place in the UI to look.

### B.6 Read Michelson storage again

Go back to **A.5** (explorer or `curl`).

If everything is wired correctly, storage should now be `**1`**.

### B.7 Call `decrement()` once

1. In your EVM wallet (same network), call `**decrement()**`.
2. Confirm the transaction.
3. On the EVM explorer, open the new transaction → **Logs** → confirm `**action`** is `decrement`.
4. Refresh Michelson storage.

Storage should be back to `**0**`.

---

## Part C — Atomicity: watch the whole transaction fail together

Native Atomic Composability here means: the Michelson step runs **as part of** the same EVM transaction as your contract logic. If Michelson rejects the call (for example `FAILWITH "at zero"` on `decrement` when storage is already `0`), the **EVM transaction reverts as a whole**. You should **not** see a successful EVM transaction with an unchanged Michelson counter in that failure mode.

Do this deliberately:

1. Make sure Michelson storage is `**0`** (use `%reset` from Temple or your tool, or deploy fresh, or `increment` then `decrement` until you land on `0`).
2. From your EVM wallet, call `**decrement()**` again.

**What you should see**

- Your EVM wallet / the RPC returns a **failed** or **reverted** transaction (wording depends on the wallet).
- On the EVM explorer, the transaction shows as **failed/reverted**, not success.
- On the Michelson side, storage is **still `0`**.

That is the teaching moment: you did not get an “EVM succeeded, Michelson ignored you” split for this path.

---

## Experimental feature: The Relayer

You can also use Temple alone by connecting your `tz1` wallet through a browser relayer that exposes `window.ethereum` and uses your Tezos X EVM alias (the mapped `0x` address for your `tz1` on the EVM interface). That lets you interact with Solidity contracts without installing MetaMask, though this path is still experimental.

When your team publishes a **relayer / Temple + EVM** guide, link it here: [Link TBD — browser relayer and Temple on Tezos X]().

---

## Further reading (optional)

A future extension of this tutorial could show how parameter **bytes** are produced from the Tezos transaction codec in a way that lines up with formally checked tooling (for example work from Paul Laforgue at Nomadic Labs). When a public link exists, it can be added beside the placeholder in the docs section at the top.

---

## Common mistakes

If the Michelson-side counter does not change the way you expect, check the following:

- the gateway address
- the Michelson entrypoint names (`"increment"` / `"decrement"` must match the Michelson annotations)
- the parameter encoding (`hex"030b"` for `Unit` on these entrypoints)
- the chain ID and RPC on **both** wallets
- the `KT1` destination contract
- you are reading **Michelson** storage, not assuming an old `evmCount`-style variable on the Solidity side (this tutorial removed that split-brain pattern)

For this example, the quickest things to confirm are:

- are you really calling `"increment"` / `"decrement"` as spelled in the Michelson contract?
- are you really passing `hex"030b"` for unit where the entrypoint takes `unit`?
- are you pointing at the intended Michelson counter contract?

---

## Summary

Tezos X allows Solidity applications on the EVM interface to interact natively with contracts and storage on the Michelson interface, using Native Atomic Composability instead of a separate bridge-heavy workflow (Tezos X, Spotlight article).

In this single walkthrough you:

- took network values from the official placeholder / dashboard
- originated the Michelson counter first and verified storage
- deployed an EVM contract that forwards `increment` and `decrement` through the gateway
- verified success using the **EVM explorer logs** and **Michelson storage**
- triggered a **revert** to see atomic failure behaviour

Your EVM wallet handles the user-facing transaction; no standalone relayer is required for the core story here.
