// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract XButtonEscrow {
    address public immutable usdc;
    address public authorizedCaller;
    uint256 public currentSessionId;
    uint256 public currentPot;

    event Deposited(address indexed player, uint256 amount);
    event PaidOut(address indexed winner, uint256 amount);
    event SessionStarted(uint256 indexed sessionId, uint256 startedAt);
    event SessionDeposit(uint256 indexed sessionId, address indexed player, uint256 amount, uint256 potAfter);
    event SessionCompleted(uint256 indexed sessionId, address indexed winner, uint256 potSize, uint256 paidOutAt);

    constructor(address _usdc, address _authorizedCaller) {
        usdc = _usdc;
        authorizedCaller = _authorizedCaller;
        currentSessionId = 1;
        emit SessionStarted(currentSessionId, block.timestamp);
    }

    modifier onlyAuthorized() {
        require(msg.sender == authorizedCaller, "NOT_AUTHORIZED");
        _;
    }

    function deposit(uint256 amount) external {
        require(
            IERC20(usdc).transferFrom(msg.sender, address(this), amount),
            "TRANSFER_FROM_FAILED"
        );
        currentPot += amount;
        emit Deposited(msg.sender, amount);
        emit SessionDeposit(currentSessionId, msg.sender, amount, currentPot);
    }

    function payout(address winner, uint256 amount) external onlyAuthorized {
        require(IERC20(usdc).transfer(winner, amount), "TRANSFER_FAILED");
        uint256 paidSessionId = currentSessionId;
        emit PaidOut(winner, amount);
        emit SessionCompleted(paidSessionId, winner, amount, block.timestamp);
        currentPot = 0;
        currentSessionId = paidSessionId + 1;
        emit SessionStarted(currentSessionId, block.timestamp);
    }

    function setAuthorizedCaller(address newCaller) external onlyAuthorized {
        authorizedCaller = newCaller;
    }
}
