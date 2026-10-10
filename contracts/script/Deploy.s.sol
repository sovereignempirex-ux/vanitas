// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

import {VanitasCredit} from "../src/VanitasCredit.sol";

/// @notice Deploys [`VanitasCredit`](../src/VanitasCredit.sol).
///
///         Environment variables:
///
///         | var                          | required to broadcast | meaning                          |
///         |------------------------------|------------------------|----------------------------------|
///         | `CREDIT_DEPLOYER_PRIVATE_KEY`| yes                    | deployer's key                   |
///         | `PRIVATE_KEY`                | as an alias            | same thing, under its usual name |
///         | `CREDIT_OPERATOR`            | no                     | billing key that signs off-chain |
///
///         Both key names are accepted because this lives in a shared `.env`
///         next to `ADMIN_API_TOKEN` and friends: `CREDIT_DEPLOYER_PRIVATE_KEY`
///         is unambiguous there, while `PRIVATE_KEY` is what Foundry and every
///         tutorial already call it. A key already exported for `forge script`
///         elsewhere keeps working unchanged.
///
///         `CREDIT_OPERATOR` defaults to the deploying account. That is right
///         on a dev chain and almost certainly wrong on mainnet, where the
///         billing key should be its own rotated, access-controlled account —
///         set it explicitly for any real deployment.
///
///         A dry run needs neither variable:
///
///         ```sh
///         forge script script/Deploy.s.sol                    # local EVM, no key
///         forge script script/Deploy.s.sol \
///             --rpc-url "$CREDIT_RPC_URL" \
///             --private-key "$CREDIT_DEPLOYER_PRIVATE_KEY" --broadcast
///         ```
contract Deploy is Script {
    function run() external returns (VanitasCredit credit) {
        uint256 deployerKey = vm.envOr("CREDIT_DEPLOYER_PRIVATE_KEY", vm.envOr("PRIVATE_KEY", uint256(0)));

        // `msg.sender` before `startBroadcast` is Foundry's default sender, so
        // this is a real, non-zero address even on a keyless dry run.
        address operator = vm.envOr("CREDIT_OPERATOR", msg.sender);

        if (deployerKey != 0) {
            vm.startBroadcast(deployerKey);
        } else {
            vm.startBroadcast();
        }

        credit = new VanitasCredit(operator);

        vm.stopBroadcast();
    }
}
