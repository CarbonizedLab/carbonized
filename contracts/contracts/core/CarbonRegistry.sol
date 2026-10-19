// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title CarbonRegistry
 * @notice Onchain source of truth for company and trader profiles on Carbonized.
 * @dev
 * - One profile per wallet: a wallet is either a company or a trader, never both, and never twice.
 * - Companies report Scope 1/2/3 emissions (tonnes of CO2e, 18 decimals like the credit NFT) and may
 *   update them; every update is emitted as an event so history can be rebuilt from logs.
 * - PRIVACY: raw e-mail / phone numbers are NEVER stored or emitted. Callers pass a salted commitment
 *   `contactHash = keccak256(abi.encode(email, phone, salt))` computed off-chain (the salt stays with
 *   the user / the Carbonized backend). A verifier that receives the preimage off-chain can recompute it
 *   and compare it to `getCompanyData(...).contactHash`.
 * - KYB verification is role gated (VERIFIER_ROLE) and bound to the exact profile that was reviewed:
 *   `setCompanyVerified(company, true, expectedProfileHash)` only succeeds if the onchain profile
 *   still hashes to `expectedProfileHash` (no verify-after-edit race), and ANY later change of name,
 *   legal ID, contact commitment or emissions automatically resets `verified` to false.
 * - A legal ID can be KYB-verified for at most ONE wallet at a time (first verified wins). Plain
 *   registration is permissionless and therefore cannot be unique (it would be squattable); uniqueness
 *   is enforced where it carries trust: at verification.
 * - This contract does NOT mint or hold anything. There is no starter-credit faucet and no dependency
 *   on the credit NFT or on ISSUER_ROLE.
 * - Roles use OpenZeppelin AccessControl. DEFAULT_ADMIN_ROLE / PAUSER_ROLE / VERIFIER_ROLE are granted
 *   to the deployer-supplied `admin` and can be granted to (and the admin renounced in favour of) a
 *   multisig with `grantRole` / `renounceRole`.
 */
contract CarbonRegistry is AccessControl, Pausable {
    // ============ ROLES ============
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ============ LIMITS ============
    uint256 public constant MAX_NAME_LENGTH = 100;
    uint256 public constant MAX_LEGAL_ID_LENGTH = 64;
    uint256 public constant MAX_COUNTRY_LENGTH = 64;
    /// @notice Upper bound per emission figure: 1 trillion tonnes (18 decimals).
    uint256 public constant MAX_EMISSION = 1e12 * 1e18;

    /// @dev keccak256("") - a legal ID made only of separator characters normalises to this and is rejected.
    bytes32 private constant EMPTY_LEGAL_ID_HASH = keccak256("");

    // ============ TYPES ============
    enum RegistrationType {
        None,
        Company,
        Trader
    }

    struct Company {
        string name;
        string legalId;
        bytes32 contactHash; // keccak256(abi.encode(email, phone, salt)), computed off-chain
        uint256 scope1;
        uint256 scope2;
        uint256 scope3;
        uint256 target; // annual reduction target in tonnes (18 decimals), 0 = unset
        bool verified;
        uint64 registeredAt;
        uint64 updatedAt;
    }

    struct Trader {
        string name;
        bytes32 contactHash;
        string country;
        uint64 registeredAt;
        bool active;
    }

    // ============ STATE ============
    mapping(address => Company) private _companies;
    mapping(address => Trader) private _traders;

    /// @notice Normalised legal-ID hash => wallet that currently holds the KYB verification for it.
    mapping(bytes32 => address) public verifiedLegalIdOwner;

    uint256 public totalCompanies;
    uint256 public totalTraders;

    // ============ EVENTS ============
    event CompanyRegistered(
        address indexed company,
        string name,
        string legalId,
        uint256 scope1,
        uint256 scope2,
        uint256 scope3
    );
    event CompanyProfileUpdated(address indexed company, string name, string legalId, bool verificationReset);
    event EmissionsUpdated(
        address indexed company,
        uint256 scope1,
        uint256 scope2,
        uint256 scope3,
        uint256 total,
        uint256 timestamp
    );
    event EmissionTargetSet(address indexed company, uint256 target);
    event TraderRegistered(address indexed trader, string name, string country);
    event CompanyVerified(address indexed company, bool verified, address indexed verifier);

    // ============ CONSTRUCTOR ============
    constructor(address admin) {
        require(admin != address(0), "Invalid admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
    }

    // ============ COMPANY ============

    /**
     * @notice Register the caller as a company.
     * @param scope1 Direct emissions, tonnes CO2e with 18 decimals
     * @param scope2 Indirect energy emissions, tonnes CO2e with 18 decimals
     * @param scope3 Other indirect emissions, tonnes CO2e with 18 decimals
     * @param contactHash keccak256(abi.encode(email, phone, salt)); never the raw contact data
     */
    function registerCompany(
        string calldata name,
        string calldata legalId,
        uint256 scope1,
        uint256 scope2,
        uint256 scope3,
        bytes32 contactHash
    ) external whenNotPaused {
        _requireUnregistered(msg.sender);
        _validateCompanyProfile(name, legalId, contactHash);
        _validateEmissions(scope1, scope2, scope3);

        Company storage c = _companies[msg.sender];
        c.name = name;
        c.legalId = legalId;
        c.contactHash = contactHash;
        c.scope1 = scope1;
        c.scope2 = scope2;
        c.scope3 = scope3;
        c.registeredAt = uint64(block.timestamp);
        c.updatedAt = uint64(block.timestamp);
        totalCompanies++;

        emit CompanyRegistered(msg.sender, name, legalId, scope1, scope2, scope3);
    }

    /// @notice Update name / legal ID / contact commitment. Any change resets KYB verification.
    function updateCompanyProfile(
        string calldata name,
        string calldata legalId,
        bytes32 contactHash
    ) external whenNotPaused {
        Company storage c = _companies[msg.sender];
        require(c.registeredAt != 0, "Not a company");
        _validateCompanyProfile(name, legalId, contactHash);

        bool changed = keccak256(bytes(c.name)) != keccak256(bytes(name))
            || keccak256(bytes(c.legalId)) != keccak256(bytes(legalId))
            || c.contactHash != contactHash;
        bool reset = changed && c.verified;
        if (reset) _clearVerification(msg.sender, c);

        c.name = name;
        c.legalId = legalId;
        c.contactHash = contactHash;
        c.updatedAt = uint64(block.timestamp);

        emit CompanyProfileUpdated(msg.sender, name, legalId, reset);
    }

    /// @notice Persist new emission totals (tonnes CO2e, 18 decimals). Company only. Resets KYB if changed.
    function updateEmissions(uint256 scope1, uint256 scope2, uint256 scope3) external whenNotPaused {
        Company storage c = _companies[msg.sender];
        require(c.registeredAt != 0, "Not a company");
        _validateEmissions(scope1, scope2, scope3);

        if (c.verified && (c.scope1 != scope1 || c.scope2 != scope2 || c.scope3 != scope3)) {
            _clearVerification(msg.sender, c);
        }
        c.scope1 = scope1;
        c.scope2 = scope2;
        c.scope3 = scope3;
        c.updatedAt = uint64(block.timestamp);

        emit EmissionsUpdated(msg.sender, scope1, scope2, scope3, scope1 + scope2 + scope3, block.timestamp);
    }

    /// @notice Set the annual emission reduction target (tonnes, 18 decimals). Company only.
    /// @dev A target is a goal, not a verified identity/emission claim, so it does not reset KYB.
    function setEmissionTarget(uint256 target) external whenNotPaused {
        Company storage c = _companies[msg.sender];
        require(c.registeredAt != 0, "Not a company");
        require(target <= MAX_EMISSION, "Target too large");

        c.target = target;
        c.updatedAt = uint64(block.timestamp);

        emit EmissionTargetSet(msg.sender, target);
    }

    /**
     * @notice Mark a company KYB-verified or revoke the verification. VERIFIER_ROLE only.
     * @param expectedProfileHash Must equal `profileHashOf(company)` when `verified == true`, so the
     *        verifier approves exactly the profile it reviewed (the company cannot swap data in between).
     *        Ignored when revoking.
     * @dev A legal ID can be verified for one wallet only; revoke the other wallet first to move it.
     */
    function setCompanyVerified(address company, bool verified, bytes32 expectedProfileHash)
        external
        onlyRole(VERIFIER_ROLE)
        whenNotPaused
    {
        Company storage c = _companies[company];
        require(c.registeredAt != 0, "Not a company");

        if (verified) {
            require(expectedProfileHash == _profileHash(c), "Profile changed");
            bytes32 idHash = _legalIdHash(c.legalId);
            address current = verifiedLegalIdOwner[idHash];
            require(current == address(0) || current == company, "Legal ID already verified");
            verifiedLegalIdOwner[idHash] = company;
            c.verified = true;
        } else {
            _clearVerification(company, c);
        }
        c.updatedAt = uint64(block.timestamp);

        emit CompanyVerified(company, verified, msg.sender);
    }

    // ============ TRADER ============

    /// @param contactHash keccak256(abi.encode(email, phone, salt)); never the raw contact data
    function registerTrader(string calldata name, bytes32 contactHash, string calldata country)
        external
        whenNotPaused
    {
        _requireUnregistered(msg.sender);
        _requireText(name, MAX_NAME_LENGTH, "Invalid name");
        require(contactHash != bytes32(0), "Invalid contact hash");
        _requireText(country, MAX_COUNTRY_LENGTH, "Invalid country");

        _traders[msg.sender] = Trader({
            name: name,
            contactHash: contactHash,
            country: country,
            registeredAt: uint64(block.timestamp),
            active: true
        });
        totalTraders++;

        emit TraderRegistered(msg.sender, name, country);
    }

    // ============ PAUSE ============
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ============ VIEWS ============

    function registrationTypeOf(address account) public view returns (RegistrationType) {
        if (_companies[account].registeredAt != 0) return RegistrationType.Company;
        if (_traders[account].registeredAt != 0) return RegistrationType.Trader;
        return RegistrationType.None;
    }

    function isCompany(address account) external view returns (bool) {
        return _companies[account].registeredAt != 0;
    }

    function isTrader(address account) external view returns (bool) {
        return _traders[account].registeredAt != 0;
    }

    /// @notice Full company profile. `registeredAt == 0` means the address is not a company.
    function getCompanyData(address company)
        external
        view
        returns (
            string memory name,
            string memory legalId,
            bytes32 contactHash,
            uint256 scope1,
            uint256 scope2,
            uint256 scope3,
            uint256 target,
            bool verified,
            uint256 registeredAt,
            uint256 updatedAt
        )
    {
        Company storage c = _companies[company];
        return (
            c.name,
            c.legalId,
            c.contactHash,
            c.scope1,
            c.scope2,
            c.scope3,
            c.target,
            c.verified,
            c.registeredAt,
            c.updatedAt
        );
    }

    function getCompanyEmissions(address company)
        external
        view
        returns (uint256 scope1, uint256 scope2, uint256 scope3, uint256 target)
    {
        Company storage c = _companies[company];
        return (c.scope1, c.scope2, c.scope3, c.target);
    }

    function getCompanyKyb(address company) external view returns (bool verified, uint256 registeredAt) {
        Company storage c = _companies[company];
        return (c.verified, c.registeredAt);
    }

    /// @notice Hash of everything a KYB approval covers: name, normalised legal ID, contact commitment, emissions.
    /// @dev Verifiers read this, review the profile off-chain, then pass it to `setCompanyVerified`.
    function profileHashOf(address company) external view returns (bytes32) {
        return _profileHash(_companies[company]);
    }

    /// @notice Trader profile. `registrationDate == 0` means the address is not a trader.
    function getTraderData(address trader)
        external
        view
        returns (
            string memory name,
            bytes32 contactHash,
            string memory country,
            uint256 registrationDate,
            bool isActive
        )
    {
        Trader storage t = _traders[trader];
        return (t.name, t.contactHash, t.country, t.registeredAt, t.active);
    }

    /// @notice Wallet that currently holds the KYB verification for `legalId` (zero if none).
    function verifiedOwnerOfLegalId(string calldata legalId) external view returns (address) {
        return verifiedLegalIdOwner[_legalIdHash(legalId)];
    }

    // ============ INTERNALS ============

    function _clearVerification(address company, Company storage c) private {
        if (!c.verified) return;
        c.verified = false;
        bytes32 idHash = _legalIdHash(c.legalId);
        if (verifiedLegalIdOwner[idHash] == company) delete verifiedLegalIdOwner[idHash];
        emit CompanyVerified(company, false, msg.sender);
    }

    function _profileHash(Company storage c) private view returns (bytes32) {
        return keccak256(
            abi.encode(c.name, _legalIdHash(c.legalId), c.contactHash, c.scope1, c.scope2, c.scope3)
        );
    }

    /// @dev Case/format-insensitive legal ID key: ASCII letters upper-cased, ' ', '-', '.', '/', '_' dropped.
    function _legalIdHash(string memory legalId) private pure returns (bytes32) {
        bytes memory raw = bytes(legalId);
        bytes memory out = new bytes(raw.length);
        uint256 n;
        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 ch = raw[i];
            if (ch == 0x20 || ch == 0x2D || ch == 0x2E || ch == 0x2F || ch == 0x5F) continue;
            if (ch >= 0x61 && ch <= 0x7A) ch = bytes1(uint8(ch) - 32);
            out[n++] = ch;
        }
        assembly {
            mstore(out, n)
        }
        return keccak256(out);
    }

    function _requireUnregistered(address account) private view {
        require(registrationTypeOf(account) == RegistrationType.None, "Already registered");
    }

    function _requireText(string calldata value, uint256 maxLength, string memory err) private pure {
        uint256 len = bytes(value).length;
        require(len > 0 && len <= maxLength, err);
    }

    function _validateCompanyProfile(string calldata name, string calldata legalId, bytes32 contactHash)
        private
        pure
    {
        _requireText(name, MAX_NAME_LENGTH, "Invalid name");
        _requireText(legalId, MAX_LEGAL_ID_LENGTH, "Invalid legal ID");
        require(_legalIdHash(legalId) != EMPTY_LEGAL_ID_HASH, "Invalid legal ID");
        require(contactHash != bytes32(0), "Invalid contact hash");
    }

    function _validateEmissions(uint256 scope1, uint256 scope2, uint256 scope3) private pure {
        require(scope1 <= MAX_EMISSION && scope2 <= MAX_EMISSION && scope3 <= MAX_EMISSION, "Emissions too large");
    }
}
