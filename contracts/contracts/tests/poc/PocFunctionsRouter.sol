// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev AUDIT-ONLY helper (never deploy). Emulates the parts of the real Chainlink
 * FunctionsRouter that matter for callback safety:
 *  - unique request ids per request,
 *  - the commitment is deleted BEFORE the callback (no retry on failure),
 *  - the client callback `handleOracleFulfillment` is executed with exactly the
 *    `callbackGasLimit` the client asked for; a failing/out-of-gas callback is
 *    swallowed (real router => FulfillResult.USER_CALLBACK_ERROR) and returned as `false`.
 */
contract PocFunctionsRouter {
    struct Pending {
        address client;
        uint32 callbackGasLimit;
        bool exists;
    }

    uint256 public nonce;
    mapping(bytes32 => Pending) public pending;

    function sendRequest(
        uint64,
        bytes calldata,
        uint16,
        uint32 callbackGasLimit,
        bytes32
    ) external returns (bytes32 requestId) {
        requestId = keccak256(abi.encode(address(this), msg.sender, ++nonce));
        pending[requestId] = Pending(msg.sender, callbackGasLimit, true);
    }

    /// @return success false when the client callback reverted / ran out of its gas budget
    function fulfill(bytes32 requestId, bytes calldata response, bytes calldata err) external returns (bool success) {
        Pending memory p = pending[requestId];
        require(p.exists, "unknown request");
        delete pending[requestId]; // real router deletes the commitment before calling back
        (success, ) = p.client.call{gas: p.callbackGasLimit}(
            abi.encodeWithSignature("handleOracleFulfillment(bytes32,bytes,bytes)", requestId, response, err)
        );
    }

    /// @dev same as fulfill() but lets the test choose the gas forwarded (to measure real gas need).
    function fulfillWithGas(
        bytes32 requestId,
        bytes calldata response,
        bytes calldata err,
        uint256 gasForCallback
    ) external returns (bool success, uint256 gasUsed) {
        Pending memory p = pending[requestId];
        require(p.exists, "unknown request");
        delete pending[requestId];
        uint256 before = gasleft();
        (success, ) = p.client.call{gas: gasForCallback}(
            abi.encodeWithSignature("handleOracleFulfillment(bytes32,bytes,bytes)", requestId, response, err)
        );
        gasUsed = before - gasleft();
    }
}
