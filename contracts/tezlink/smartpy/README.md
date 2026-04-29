# XButton (SmartPy)

- **Source:** `xbutton.py` — mirrors `../ligo/xbutton.mligo` and the layout of `../ligo/xbutton.tz` (`record_deposit` = `pair address (pair bytes nat)`). Types use `sp.address`, `sp.bytes`, and `sp.nat` (not `TAddress` / `TBytes` / `TNat` in the version that was tested).

Use **SmartPy 1.x** with the contract class **inside** ``@sp.module def main(): …`` (same pattern as the official “Store value” template). A top-level ``class …(sp.Contract)`` with ``@sp.entrypoint`` will fail: ``@sp.entrypoint`` is not defined until the class lives under ``main``.

Compile and originate using the SmartPy and Octez versions your team supports; the exact CLI flags change between releases.

**Initial storage** (same values as the CameLIGO README, encoded with SmartPy’s storage export when you run tests or the compiler on this contract).

The canonical compiled artifact in this folder remains the **LIGO** output (`xbutton.tz`) until you add a release step that compiles the SmartPy version and compares to it.
