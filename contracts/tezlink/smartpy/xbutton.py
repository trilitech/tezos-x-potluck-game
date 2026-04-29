# SPDX-License-Identifier: MIT
# SmartPy 1.x — same logic as ``../ligo/xbutton.mligo`` / ``xbutton.tz``.
# Class must be inside ``@sp.module def main():`` (see ``smartpy/README.md``).
# ``record_deposit`` parameter: ``pair address (pair bytes nat)``.
# pyright: reportMissingImports=false
import smartpy as sp  # type: ignore


@sp.module
def main():
    class XButton(sp.Contract):
        def __init__(self):
            self.data.last_player = sp.cast(None, sp.option[sp.address])
            self.data.last_player_evm = sp.cast(None, sp.option[sp.bytes])
            self.data.pot = sp.cast(0, sp.nat)
            self.data.session_end = sp.timestamp(0)
            self.data.claim_requested = False
            self.data.payout_completed = False

        @sp.entrypoint
        def start_session(self, duration):
            self.data.last_player = sp.cast(None, sp.option[sp.address])
            self.data.last_player_evm = sp.cast(None, sp.option[sp.bytes])
            self.data.pot = sp.cast(0, sp.nat)
            self.data.session_end = sp.add_seconds(sp.now, duration)
            self.data.claim_requested = False
            self.data.payout_completed = False

        @sp.entrypoint
        def record_deposit(self, p):
            player = sp.fst(p)
            inner = sp.snd(p)
            player_evm = sp.fst(inner)
            amount = sp.snd(inner)
            assert sp.now <= self.data.session_end, "SESSION_ENDED"
            assert not self.data.claim_requested, "CLAIM_ALREADY_REQUESTED"
            self.data.last_player = sp.Some(player)
            self.data.last_player_evm = sp.Some(player_evm)
            self.data.pot = self.data.pot + amount

        @sp.entrypoint
        def claim(self):
            assert self.data.session_end <= sp.now, "SESSION_ACTIVE"
            assert not self.data.claim_requested, "CLAIM_ALREADY_REQUESTED"
            assert 0 < self.data.pot, "EMPTY_POT"
            winner = self.data.last_player.unwrap_some(error="NO_LAST_PLAYER")
            assert winner == sp.sender, "NOT_LAST_PLAYER"
            self.data.claim_requested = True

        @sp.entrypoint
        def mark_paid(self):
            assert self.data.claim_requested, "NO_CLAIM_REQUESTED"
            assert not self.data.payout_completed, "ALREADY_PAID"
            self.data.payout_completed = True


if "main" in __name__:
    @sp.add_test()
    def _smoke() -> None:
        sc = sp.test_scenario("XButton smoke")
        c = main.XButton()
        sc.h1("originate")
        sc += c
