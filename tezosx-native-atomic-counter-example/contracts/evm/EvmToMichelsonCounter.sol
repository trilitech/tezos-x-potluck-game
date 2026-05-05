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
    address internal constant NAC_GATEWAY = 0xfF00000000000000000000000000000000000007;

    INativeAtomicGateway public immutable gateway;
    string public michelsonCounter;

    bytes internal constant UNIT = hex"030b";
    uint256 internal constant GATEWAY_GAS = 3_000_000;

    event CounterCalled(
        address indexed caller,
        string action,
        string michelsonCounter
    );

    constructor(string memory michelsonCounterAddress) {
        gateway = INativeAtomicGateway(NAC_GATEWAY);
        michelsonCounter = michelsonCounterAddress;
    }

    /// @dev Precompile: use low-level `.call` + selector encoding (high-level call can hit EXTCODESIZE).
    function _callMichelson(string memory entrypoint) private {
        bytes memory callData = abi.encodeWithSelector(
            INativeAtomicGateway.callMichelson.selector,
            michelsonCounter,
            entrypoint,
            UNIT
        );
        (bool ok, bytes memory ret) = address(gateway).call{gas: GATEWAY_GAS}(callData);
        if (!ok) {
            if (ret.length > 0) {
                assembly ("memory-safe") {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
            revert("NAC gateway call failed");
        }
    }

    function increment() external {
        _callMichelson("increment");
        emit CounterCalled(msg.sender, "increment", michelsonCounter);
    }

    function decrement() external {
        _callMichelson("decrement");
        emit CounterCalled(msg.sender, "decrement", michelsonCounter);
    }

    function reset() external {
        _callMichelson("reset");
        emit CounterCalled(msg.sender, "reset", michelsonCounter);
    }
}
