# Tezos X Previewnet Guide For Agents

This file is a generic working guide for AI agents building smart contracts and cross-runtime systems on Tezos X Previewnet.

It is intentionally not tied to one specific repo or product architecture. Use it when you need to reason about:

- the EVM interface and the Michelson interface together
- cross-runtime execution through the NAC / CRAC gateway
- Tezos X Previewnet network configuration
- contract deployment, storage authority, and cross-runtime debugging

## What Tezos X is

Tezos X exposes multiple execution interfaces in one system.

- The EVM interface is where Solidity contracts, EVM wallets, ERC-20 flows, and Ethereum-style RPC calls live.
- The Michelson interface is where Michelson contracts and Michelson-side storage live.
- Native Atomic Composability, often abbreviated NAC, is the mechanism that allows one interface to invoke logic on the other.

Agents should not think of this as “two unrelated chains with a bridge” by default. In many Tezos X workflows, the key idea is:

- a call starts from one interface
- execution reaches the other interface
- the result is still part of one coherent system flow

## Previewnet network parameters

Use these values for Tezos X Previewnet unless the user or project provides newer official values.

### EVM wallet parameters

- Network name: `Tezos X Previewnet`
- RPC URL: `https://evm.previewnet.tezosx.nomadic-labs.com`
- Chain ID: `128064`
- Currency symbol: `XTZ`
- Block explorer: `https://blockscout.previewnet.tezosx.nomadic-labs.com`

### Michelson wallet / RPC parameters

- RPC URL: `https://michelson.previewnet.tezosx.nomadic-labs.com`
- Chain ID: `NetXY2oPPzkxUW1`
- Block explorer: `https://previewnet.tezosx.tzkt.io`

## Important Tezos X runtime details

### Michelson Previewnet RPC shape

On Previewnet, the Michelson RPC is the host root itself, not a `/rpc/tezlink` suffix.

Examples:

- `https://michelson.previewnet.tezosx.nomadic-labs.com/chains/main/blocks/head/context/contracts/<KT1>/storage`
- `https://michelson.previewnet.tezosx.nomadic-labs.com/chains/main/blocks/head/helpers/scripts/run_operation`

If a project uses `.../rpc/tezlink`, verify whether that is for another stack, another environment, or outdated config.

### NAC / CRAC gateway precompile

Projects on Tezos X commonly use a fixed EVM precompile as the gateway into Michelson-side execution.

For Previewnet in this workspace, the expected address is:

- `0xff00000000000000000000000000000000000007`

Agents should verify local project config before changing code, but this is the common default to expect.

### Gateway call shape

From the EVM side, agents should expect a call pattern like:

`callMichelson(string destination, string entrypoint, bytes data)`

Where:

- `destination` is usually a Michelson contract address like `KT1...`
- `entrypoint` is the Michelson entrypoint name
- `data` is the Micheline-encoded parameter bytes

## How agents should reason about Tezos X

### 1. Separate EVM-side truth from Michelson-side truth

Always ask:

- where is the authoritative state for this feature?
- is the EVM side the source of truth?
- is Michelson storage the source of truth?
- or is EVM only the transport / funding layer while Michelson is the game / app state authority?

Do not assume the interface the user touches is the same place where the app’s authoritative state lives.

### 2. Distinguish direct gateway calls from optional off-chain coordination

The core Tezos X contract pattern is direct cross-runtime execution:

- an EVM-side contract or caller invokes the NAC / CRAC gateway
- the gateway reaches a Michelson contract
- Michelson logic runs with the encoded parameter

Examples:

- a Solidity contract forwarding `increment()` to a Michelson counter
- an EVM-side game contract or caller starting a Michelson-side session
- an EVM-side claim call invoking a Michelson entrypoint

Some systems may additionally choose to use an off-chain service that observes events and then calls the gateway. Agents should treat that as an architectural choice, not as the definition of Tezos X.

When debugging, first determine whether the intended design is:

- direct contract-to-gateway cross-runtime execution
- or a two-step architecture where off-chain software performs the gateway call later

### 3. Treat address identity carefully

Tezos X systems may need to map between:

- EVM addresses: `0x...`
- Tezos implicit addresses: `tz1...`
- Tezos contract addresses: `KT1...`

Agents should not assume these are interchangeable.

Common useful RPC:

- `tez_getEthereumTezosAddress`

Use it when you need the Tezos-side identity that corresponds to an EVM wallet, especially when Michelson-side authorization depends on `Tezos.get_sender()`.

Do not assume reverse mapping from `KT1` or from arbitrary Tezos-side aliases is always available or reliable.

### 4. Expect Micheline encoding concerns

When an EVM-side caller invokes Michelson entrypoints, parameters are often encoded as raw Micheline bytes.

Agents should verify:

- whether the target entrypoint expects `unit`, `nat`, `int`, `bytes`, `address`, or nested `pair`
- whether the project expects packed Michelson bytes or raw Micheline expression bytes
- whether helper functions in the codebase already implement the correct encoding

Do not rewrite encoding logic casually if a project already has working helpers.

### 5. Treat Michelson RPC JSON as shape-sensitive

Tezos / Michelson RPC JSON can encode structures in ways that are easy to parse incorrectly.

Agents should expect:

- Michelson `list` values as `Cons/Nil` trees or plain arrays, depending on tooling or endpoint
- maps represented as arrays of `Elt`-style nodes
- nested `Pair` structures with positional `args`
- `Some` / `None` options

When a storage parse looks wrong, inspect a real RPC payload before changing business logic.

## Previewnet debugging checklist

When an app is failing on Tezos X Previewnet, agents should verify these in order.

### Network layer

- Is the EVM-side caller or tooling actually targeting chain ID `128064`?
- Is the project using the Previewnet EVM RPC?
- Is the Michelson RPC set to `https://michelson.previewnet.tezosx.nomadic-labs.com`?

### Cross-runtime configuration

- Is the CRAC / NAC precompile address correct?
- Is the destination Michelson contract address correct?
- Are the entrypoint names spelled exactly as the Michelson contract expects?
- Is the Micheline parameter encoding correct for the entrypoint?

### Contract execution flow

For a direct cross-runtime call:

- Did the EVM transaction confirm?
- Did the EVM-side contract actually call the gateway?
- Did the gateway call reach the intended Michelson contract and entrypoint?
- Did Michelson-side storage change as expected?

If the architecture also includes off-chain coordination:

- Did the off-chain service observe the triggering event?
- Did it call the gateway with the intended parameter encoding?
- Did it write the expected Michelson-side state?

### Explorer verification

Check both sides separately:

- EVM explorer for the user transaction, event logs, and contract calls
- Michelson explorer for the contract storage and operation history

## Deployment reasoning for agents

On Tezos X projects with both EVM and Michelson contracts, the usual order is:

1. deploy or identify the Michelson-side contract if its address is needed by the EVM-side constructor
2. deploy or identify the EVM-side contract that will call the gateway
3. configure any supporting tooling or optional off-chain components
4. verify at least one end-to-end cross-runtime action

Agents should expect configuration to live in one or more of:

- contract deployment env files
- script env files
- deployment JSON files
- network preset modules
- docs describing current canonical contract addresses

## What to verify before changing code

Before making logic changes, agents should confirm:

- the project is actually pointed at the intended Previewnet contracts
- the wrong behavior is not just an env mismatch
- the observed Michelson storage shape matches the parser assumptions
- whether the intended fix belongs in the EVM contract, Michelson contract, deployment config, or optional off-chain tooling

## Good agent habits on Tezos X projects

- Prefer reading current RPC payloads over assuming storage layout.
- Prefer reusing existing Micheline encoding helpers over writing new ones from scratch.
- Treat cross-runtime bugs as multi-surface bugs until proven otherwise.
- When a flow spans EVM and Michelson, describe the EVM-side contract call and Michelson-side state change separately.
- Verify the exact network and contract addresses before concluding business logic is broken.
- If the task is about “latest” Previewnet parameters, confirm them from project config or current official docs rather than memory.

## Generic command patterns agents will often need

These vary by project, but common categories are:

- compile Solidity contracts
- compile Michelson / LIGO contracts
- inspect current env values
- inspect current Michelson storage from RPC
- verify deployed contract addresses
- run deployment scripts

Examples of useful command intent:

- “compile the Solidity contract for Previewnet”
- “compile the Michelson contract”
- “read current KT1 storage from Previewnet”
- “check the configured Previewnet contract addresses”

Use the project’s own scripts and docs first instead of inventing new workflows.

## Portable mental model

If you remember only one thing, use this:

Tezos X lets contracts on one interface invoke contracts and state on another interface. Agents must reason about gateway calls, contract authority, parameter encoding, and runtime-specific data formats together, not in isolation.
