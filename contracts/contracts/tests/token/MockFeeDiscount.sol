// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockFeeDiscount (TEST ONLY - never part of a deployment)
 * @notice Configurable IFeeDiscount provider used to exercise the marketplace's defensive `staticcall`:
 *         normal answers, reverts, gas burning, oversized / short return data, and values above the 50% cap.
 */
contract MockFeeDiscount {
    enum Mode {
        Fixed,        // return `value`
        PerUser,      // return `userValue[user]`
        Revert,       // revert
        BurnGas,      // loop until out of gas
        ShortReturn,  // return 4 bytes
        HugeReturn,   // return 16 KiB (first word = value): extra return data must be ignored
        Empty         // return nothing
    }

    Mode public mode;
    uint256 public value;
    mapping(address => uint256) public userValue;

    function set(Mode mode_, uint256 value_) external {
        mode = mode_;
        value = value_;
    }

    function setUser(address user, uint256 v) external {
        userValue[user] = v;
    }

    // solhint-disable no-inline-assembly
    function discountBps(address user) external view returns (uint256) {
        Mode m = mode;
        if (m == Mode.Fixed) return value;
        if (m == Mode.PerUser) return userValue[user];
        if (m == Mode.Revert) revert("provider broken");
        if (m == Mode.BurnGas) {
            uint256 i;
            while (i < type(uint256).max) {
                unchecked { ++i; }
            }
            return i;
        }
        uint256 v = value;
        if (m == Mode.ShortReturn) {
            assembly {
                mstore(0, 0x11223344)
                return(28, 4)
            }
        }
        if (m == Mode.HugeReturn) {
            assembly {
                mstore(0, v)
                return(0, 16384)
            }
        }
        assembly {
            return(0, 0)
        }
    }
}
