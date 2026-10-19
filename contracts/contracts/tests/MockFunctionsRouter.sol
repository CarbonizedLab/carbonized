// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev TEST-ONLY Chainlink Functions router double. Never deploy to a live network: production
 * contracts must be wired to the real FunctionsRouter of the target chain.
 * - request ids are unique (nonce based),
 * - every request is recorded exactly as the client sent it (`requests(id)`: subscription, CBOR payload,
 *   data version, callback gas limit, DON id) so tests can decode and assert what a real DON would receive,
 * - `fulfillRequest` delivers the answer to the requesting client through `handleOracleFulfillment`
 *   (like the real router does) and bubbles up a client revert so tests can assert on it.
 */
contract MockFunctionsRouter {
    struct Request {
        address client;
        uint64 subscriptionId;
        bytes data;
        uint16 dataVersion;
        uint32 callbackGasLimit;
        bytes32 donId;
    }

    uint256 public nonce;
    mapping(bytes32 => bool) public pendingRequests;
    mapping(bytes32 => address) public requestClient;
    mapping(bytes32 => Request) public requests;
    bytes32 public lastRequestId;

    event RequestSent(bytes32 indexed requestId);
    event RequestFulfilled(bytes32 indexed requestId);

    function sendRequest(
        uint64 subscriptionId,
        bytes memory data,
        uint16 dataVersion,
        uint32 callbackGasLimit,
        bytes32 donId
    ) external returns (bytes32 requestId) {
        requestId = keccak256(abi.encode(address(this), msg.sender, ++nonce));
        pendingRequests[requestId] = true;
        requestClient[requestId] = msg.sender;
        requests[requestId] = Request(msg.sender, subscriptionId, data, dataVersion, callbackGasLimit, donId);
        lastRequestId = requestId;
        emit RequestSent(requestId);
        return requestId;
    }

    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) external {
        require(pendingRequests[requestId], "Request not found");
        pendingRequests[requestId] = false;
        (bool ok, bytes memory ret) = requestClient[requestId].call(
            abi.encodeWithSignature("handleOracleFulfillment(bytes32,bytes,bytes)", requestId, response, err)
        );
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        emit RequestFulfilled(requestId);
    }
}
