import smartpy as sp  # type: ignore


@sp.module
def main():
    class CounterNacTutorial(sp.Contract):
        def __init__(self):
            self.data.counter = 0

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
        sc += c

        c.increment()
        c.increment()
        sc.verify(c.data.counter == 2)

        c.decrement()
        sc.verify(c.data.counter == 1)

        c.reset()
        sc.verify(c.data.counter == 0)

        c.decrement(_valid=False, _exception="at zero")
