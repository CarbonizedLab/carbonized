// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStakingLike {
    function stake(uint256 amount) external;
    function unstake(uint256 amount) external;
    function tierOf(address account) external view returns (uint256);
    function discountBps(address user) external view returns (uint256);
}

/**
 * @title FlashStaker (TEST ONLY)
 * @notice Models a flash-loan attacker: inside ONE transaction it stakes `amount` CARB it just received and reads
 *         its tier / fee discount. CarbStaking must report no uplift.
 */
contract FlashStaker {
    function attack(IERC20 carb, IStakingLike staking, uint256 amount)
        external
        returns (uint256 tierBefore, uint256 tierAfter, uint256 discountAfter)
    {
        carb.transferFrom(msg.sender, address(this), amount);
        carb.approve(address(staking), amount);

        tierBefore = staking.tierOf(address(this));
        staking.stake(amount);
        tierAfter = staking.tierOf(address(this));
        discountAfter = staking.discountBps(address(this));
    }

    function stakeOnly(IERC20 carb, IStakingLike staking, uint256 amount) external {
        carb.transferFrom(msg.sender, address(this), amount);
        carb.approve(address(staking), amount);
        staking.stake(amount);
    }

    function unstake(IStakingLike staking, uint256 amount) external {
        staking.unstake(amount);
    }
}
