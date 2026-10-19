// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./CarbonCreditNFT.sol";

/**
 * @title CarbonCreditToken (CCT)
 * @notice ERC-20 wrapper for carbon credit NFTs to enable AMM trading
 * @dev NFTs are locked in this contract → CCT minted 1:1 by CO2 tonnes
 *
 * Key Features:
 * - 1 CCT = 1 tonne CO2 offset
 * - NFTs remain locked until unwrapped
 * - Separate pools for different methodologies (ICM/Verra/Gold Standard)
 * - Transparent backing - users can query which NFTs back their tokens
 *
 * Backing invariants (enforced by construction):
 * - `totalSupply() == totalTonnesWrapped` at all times: the token is NOT burnable by
 *   holders (no ERC20Burnable); CCT is only minted by wrapping and only burned by
 *   unwrapping, so the 1:1 backing cannot be broken by a stray burn.
 * - Pool homogeneity: only fully verified credits (non-empty registry serial, non-zero
 *   oracle proof, matching methodology, not retired) can be wrapped, so every NFT that can
 *   be redeemed from the pool meets the same minimum quality bar and a junk credit can
 *   never be swapped for a verified one. Within a pool, credits are treated as fungible
 *   per tonne (vintage / project may differ).
 * - Redemption is O(1): wrapped NFTs are tracked explicitly (per-tonnes buckets), with no
 *   dependence on NFT `totalSupply()` or id scanning.
 *
 * Roles: DEFAULT_ADMIN_ROLE and PAUSER_ROLE are granted to the deployer, which SHOULD
 * `grantRole` both to a multisig and renounce its own. WRAPPER_ROLE is not checked by any
 * function (wrapping is permissionless for eligible credits) and is kept only for
 * deployment-script compatibility.
 */
contract CarbonCreditToken is
    ERC20,
    AccessControl,
    Pausable,
    ReentrancyGuard
{
    bytes32 public constant WRAPPER_ROLE = keccak256("WRAPPER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MAX_BATCH_WRAP = 50;

    // ============ STATE VARIABLES ============

    /// @notice Reference to underlying NFT contract
    CarbonCreditNFT public immutable nftContract;

    /// @notice Methodology filter (e.g., "VERRA_VCS" for CCT-VCS token)
    string public methodology;

    /// @notice Mapping of wrapped NFTs: tokenId => isWrapped
    mapping(uint256 => bool) public wrappedNFTs;

    /// @notice Tonnes (18 dec) locked for each wrapped NFT: tokenId => tonnes
    mapping(uint256 => uint256) public wrappedTonnes;

    /// @notice Original wrapper of each wrapped NFT: tokenId => wrapper
    mapping(uint256 => address) public wrapperOf;

    /// @notice User's wrapped NFT holdings: user => tokenIds[] (by original wrapper)
    mapping(address => uint256[]) private userWrappedNFTs;

    /// @notice Reverse lookup: tokenId => array index in userWrappedNFTs[wrapperOf[tokenId]]
    mapping(uint256 => uint256) private nftIndexInUserArray;

    /// @notice Wrapped NFT ids bucketed by tonnes: tonnes => tokenIds[] (O(1) `unwrapAny`)
    mapping(uint256 => uint256[]) private wrappedByTonnes;

    /// @notice Reverse lookup: tokenId => array index in wrappedByTonnes[wrappedTonnes[tokenId]]
    mapping(uint256 => uint256) private nftIndexInBucket;

    /// @notice Total number of NFTs wrapped
    uint256 public totalNFTsWrapped;

    /// @notice Total CO2 tonnes represented by this token
    uint256 public totalTonnesWrapped;

    // ============ EVENTS ============

    event CreditWrapped(
        address indexed user,
        uint256 indexed tokenId,
        uint256 co2Tonnes
    );

    event CreditUnwrapped(
        address indexed user,
        uint256 indexed tokenId,
        uint256 co2Tonnes
    );

    event BatchWrapped(
        address indexed user,
        uint256[] tokenIds,
        uint256 totalTonnes
    );

    // ============ CONSTRUCTOR ============

    /**
     * @param name_ Token name (e.g., "Carbonized Credit - Verra")
     * @param symbol_ Token symbol (e.g., "CCT-VCS")
     * @param nftContract_ Address of CarbonCreditNFT contract
     * @param methodology_ Carbon standard filter (e.g., "VERRA_VCS")
     */
    constructor(
        string memory name_,
        string memory symbol_,
        address nftContract_,
        string memory methodology_
    ) ERC20(name_, symbol_) {
        require(nftContract_ != address(0), "Invalid NFT contract");
        require(bytes(methodology_).length > 0, "Methodology required");

        nftContract = CarbonCreditNFT(nftContract_);
        methodology = methodology_;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(WRAPPER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    // ============ CORE FUNCTIONS ============

    /**
     * @notice Wrap a carbon credit NFT into fungible tokens
     * @dev NFT is transferred to this contract and locked. Only verified credits of this
     *      pool's methodology are accepted (see contract NatSpec).
     * @param tokenId NFT token ID to wrap
     * @return tonnesMinted Amount of CCT minted (equals NFT's co2Tonnes)
     */
    function wrapCredit(uint256 tokenId)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 tonnesMinted)
    {
        tonnesMinted = _wrap(tokenId);

        totalNFTsWrapped++;
        totalTonnesWrapped += tonnesMinted;

        // Mint ERC-20 tokens (1 tonne = 1e18 tokens)
        _mint(msg.sender, tonnesMinted);

        emit CreditWrapped(msg.sender, tokenId, tonnesMinted);

        return tonnesMinted;
    }

    /**
     * @notice Batch wrap multiple NFTs (gas-optimized)
     * @param tokenIds Array of NFT token IDs
     * @return totalMinted Total CCT tokens minted
     */
    function batchWrap(uint256[] calldata tokenIds)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 totalMinted)
    {
        require(tokenIds.length > 0 && tokenIds.length <= MAX_BATCH_WRAP, "Invalid batch size");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            totalMinted += _wrap(tokenIds[i]);
        }

        totalNFTsWrapped += tokenIds.length;
        totalTonnesWrapped += totalMinted;

        _mint(msg.sender, totalMinted);

        emit BatchWrapped(msg.sender, tokenIds, totalMinted);

        return totalMinted;
    }

    /**
     * @notice Unwrap fungible tokens back into a specific NFT
     * @dev Burns CCT tokens and returns the locked NFT. Any CCT holder may redeem any
     *      wrapped NFT of this pool (the pool is homogeneous, see contract NatSpec).
     * @param tokenId NFT token ID to unwrap
     * @return tonnesBurned Amount of CCT burned
     */
    function unwrapCredit(uint256 tokenId)
        external
        nonReentrant
        returns (uint256 tonnesBurned)
    {
        require(wrappedNFTs[tokenId], "NFT not wrapped");

        tonnesBurned = wrappedTonnes[tokenId];
        require(balanceOf(msg.sender) >= tonnesBurned, "Insufficient CCT balance");

        _burn(msg.sender, tonnesBurned);
        _release(tokenId, tonnesBurned);

        nftContract.transferFrom(address(this), msg.sender, tokenId);

        emit CreditUnwrapped(msg.sender, tokenId, tonnesBurned);

        return tonnesBurned;
    }

    /**
     * @notice Unwrap any available NFT (for users who bought CCT on AMM)
     * @dev Redeems the most recently wrapped NFT whose tonnes equal `amount` exactly (O(1)).
     * @param amount Amount of CCT to unwrap (must match an NFT's tonnes exactly)
     */
    function unwrapAny(uint256 amount)
        external
        nonReentrant
        returns (uint256 tokenId)
    {
        require(amount > 0, "Invalid amount");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        require(totalNFTsWrapped > 0, "No NFTs available");

        uint256[] storage bucket = wrappedByTonnes[amount];
        require(bucket.length > 0, "No matching NFT found");
        tokenId = bucket[bucket.length - 1];

        _burn(msg.sender, amount);
        _release(tokenId, amount);

        nftContract.transferFrom(address(this), msg.sender, tokenId);

        emit CreditUnwrapped(msg.sender, tokenId, amount);

        return tokenId;
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get all NFTs wrapped by a user (still locked in this contract)
     */
    function getUserWrappedNFTs(address user)
        external
        view
        returns (uint256[] memory)
    {
        return userWrappedNFTs[user];
    }

    /**
     * @notice Number of wrapped NFTs available for `unwrapAny(amount)`
     */
    function wrappedCountByTonnes(uint256 amount) external view returns (uint256) {
        return wrappedByTonnes[amount].length;
    }

    /**
     * @notice Get total backing (transparency check)
     */
    function getBackingInfo()
        external
        view
        returns (
            uint256 nftsLocked,
            uint256 tonnesLocked,
            uint256 tokensCirculating
        )
    {
        return (
            totalNFTsWrapped,
            totalTonnesWrapped,
            totalSupply()
        );
    }

    /**
     * @notice Verify 1:1 backing ratio
     */
    function isFullyBacked() external view returns (bool) {
        return totalSupply() == totalTonnesWrapped;
    }

    // ============ INTERNAL HELPERS ============

    /**
     * @dev Validates eligibility, pulls the NFT into the vault and records it in all
     *      tracking structures. Does NOT touch totals or mint CCT (callers do).
     */
    function _wrap(uint256 tokenId) private returns (uint256 tonnes) {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not NFT owner");
        require(!wrappedNFTs[tokenId], "Already wrapped");

        CarbonCreditNFT.CarbonCredit memory credit = nftContract.getCreditDetails(tokenId);

        // Verify methodology matches this token pool
        require(
            keccak256(bytes(credit.methodology)) == keccak256(bytes(methodology)),
            "Methodology mismatch"
        );
        require(!credit.isRetired, "Cannot wrap retired credit");

        // Quality gate: only verified credits may enter the fungible pool
        require(credit.co2Tonnes > 0, "Empty credit");
        require(bytes(credit.serialNumber).length > 0, "Unverified credit");
        require(credit.oracleProofHash != bytes32(0), "Unverified credit");

        tonnes = credit.co2Tonnes;

        // Transfer NFT to this contract (lock)
        nftContract.transferFrom(msg.sender, address(this), tokenId);

        wrappedNFTs[tokenId] = true;
        wrappedTonnes[tokenId] = tonnes;
        wrapperOf[tokenId] = msg.sender;

        uint256[] storage userList = userWrappedNFTs[msg.sender];
        nftIndexInUserArray[tokenId] = userList.length;
        userList.push(tokenId);

        uint256[] storage bucket = wrappedByTonnes[tonnes];
        nftIndexInBucket[tokenId] = bucket.length;
        bucket.push(tokenId);
    }

    /**
     * @dev Removes `tokenId` from every tracking structure and updates totals.
     *      Shared by `unwrapCredit` and `unwrapAny` so bookkeeping can never diverge.
     */
    function _release(uint256 tokenId, uint256 tonnes) private {
        // user list of the ORIGINAL wrapper (not the caller)
        address wrapper = wrapperOf[tokenId];
        uint256[] storage userList = userWrappedNFTs[wrapper];
        uint256 userIndex = nftIndexInUserArray[tokenId];
        uint256 lastUserId = userList[userList.length - 1];
        userList[userIndex] = lastUserId;
        nftIndexInUserArray[lastUserId] = userIndex;
        userList.pop();

        // tonnes bucket
        uint256[] storage bucket = wrappedByTonnes[tonnes];
        uint256 bucketIndex = nftIndexInBucket[tokenId];
        uint256 lastBucketId = bucket[bucket.length - 1];
        bucket[bucketIndex] = lastBucketId;
        nftIndexInBucket[lastBucketId] = bucketIndex;
        bucket.pop();

        delete nftIndexInUserArray[tokenId];
        delete nftIndexInBucket[tokenId];
        delete wrapperOf[tokenId];
        delete wrappedTonnes[tokenId];
        wrappedNFTs[tokenId] = false;

        totalNFTsWrapped--;
        totalTonnesWrapped -= tonnes;
    }

    // ============ ADMIN FUNCTIONS ============

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // Prevent transfers when paused
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    /**
     * @notice Decimals = 18 (1 token = 1 tonne CO2)
     */
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
