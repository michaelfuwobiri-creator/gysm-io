// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";

/**
 * @title GYSM Credit (GSM)
 * @notice An access credit used to boost content in GYSM.
 *
 * No redemption for fiat at this time. Credits are for platform access only.
 *
 * Design notes (read before relying on this):
 *  - Standard ERC-20. Transferable between wallets. Transferability does not
 *    create any right to a market, a price, or a buyer.
 *  - The whole supply is minted once, in `initialize`. There is NO mint
 *    function, no pause, no blacklist and no transfer fee in this version.
 *  - The contract sits behind a UUPS proxy so a later version can add features
 *    (for example a licensed partner's contract) without migrating balances.
 *    That also means whoever holds UPGRADER_ROLE can change the rules,
 *    including adding a mint or freeze. That key MUST be a multisig behind a
 *    timelock before any mainnet use, and this power must be disclosed to users.
 *  - Holders can burn their own credits (spending credits in GYSM burns them
 *    or moves them to the platform, a product decision for a later version).
 */
contract GSMCredit is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @param admin   Gets DEFAULT_ADMIN_ROLE and UPGRADER_ROLE. Use a multisig.
     * @param treasury Receives the entire initial supply.
     * @param initialSupply Total supply in base units (18 decimals).
     */
    function initialize(address admin, address treasury, uint256 initialSupply) external initializer {
        require(admin != address(0) && treasury != address(0), "zero address");
        require(initialSupply > 0, "zero supply");
        __ERC20_init("GYSM Credit", "GSM");
        __ERC20Burnable_init();
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _mint(treasury, initialSupply);
    }

    /// @dev Only UPGRADER_ROLE may authorise an implementation change.
    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    /// @notice Contract version, bumped by each implementation.
    function version() external pure virtual returns (string memory) {
        return "1";
    }
}
