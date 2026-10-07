// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GSMCredit} from "./GSMCredit.sol";

/// @dev Test-only: proves an upgrade keeps balances. Not for deployment.
/// @custom:oz-upgrades-unsafe-allow missing-initializer missing-initializer-call
contract GSMCreditV2Mock is GSMCredit {
    function version() external pure override returns (string memory) {
        return "2";
    }
}
