// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {VanitasCredit} from "../src/VanitasCredit.sol";

/// @notice Off-chain authorisation, replay, batching and admin behaviour.
///
///         Everything runs on Foundry's in-process EVM: no RPC, no node, no
///         keys, no network. The three "keys" below are throwaway integers
///         fed straight into `vm.sign`, which never leaves the test process.
contract VanitasCreditTest is Test {
    VanitasCredit internal credit;

    // Throwaway private keys. `vm.addr` derives the matching address; nothing
    // about them is secret because nothing of value is ever signed with them.
    uint256 internal constant OPERATOR_PK = 0xA11CE;
    uint256 internal constant USER_PK = 0xB0B;
    uint256 internal constant STRANGER_PK = 0xF00D;

    address internal operator;
    address internal user;
    address internal stranger;

    /// secp256k1 group order — used to build the high-s twin of a signature.
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    uint256 internal deadline;

    function setUp() public {
        operator = vm.addr(OPERATOR_PK);
        user = vm.addr(USER_PK);
        stranger = vm.addr(STRANGER_PK);

        // A fixed clock: every deadline and every "expired" assertion below is
        // a pure function of it, so the suite cannot become time-dependent.
        vm.warp(1_700_000_000);
        deadline = block.timestamp + 1 days;

        credit = new VanitasCredit(operator);
    }

    // ------------------------------------------------------------- fixtures

    function _action(bytes32 op, address account, address to, uint256 amount, uint256 nonce)
        internal
        view
        returns (VanitasCredit.Action memory)
    {
        return VanitasCredit.Action(op, account, to, amount, nonce, deadline);
    }

    /// @dev Sign `action` with `pk` against THIS contract's domain.
    ///
    ///      Never call this inline as an argument to a statement guarded by
    ///      `vm.expectRevert`. `_signFor` performs an external call
    ///      (`target.hashTypedData(action)` — `target` is a contract-typed
    ///      variable, so that is a real CALL, not a jump), and `expectRevert`
    ///      latches onto the very next call. The signature would be what got
    ///      "expected to revert", and the assertion would silently be
    ///      checking the wrong thing. Always assign the result first.
    function _sign(uint256 pk, VanitasCredit.Action memory action) internal view returns (bytes memory) {
        return _signFor(credit, pk, action);
    }

    function _signFor(VanitasCredit target, uint256 pk, VanitasCredit.Action memory action)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = target.hashTypedData(action);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _credit(address to, uint256 amount) internal {
        VanitasCredit.Action memory action = _action(credit.OP_CREDIT(), to, address(0), amount, credit.nonces(to));
        credit.execute(action, _sign(OPERATOR_PK, action));
    }

    /// A signature built against the wrong contract or the wrong chain
    /// recovers to an address nobody can predict, so the exact `recovered`
    /// argument of `NotAuthorisedSigner` is unknowable. What must hold is the
    /// *shape* of the failure: either unparseable, or parsed-but-not-who-was
    /// expected — and never a silent success.
    function _assertAuthorisationFails(VanitasCredit.Action memory action, bytes memory sig) internal {
        try credit.execute(action, sig) {
            revert("authorisation should have failed");
        } catch (bytes memory reason) {
            bytes4 selector = bytes4(reason);
            assertTrue(
                selector == VanitasCredit.NotAuthorisedSigner.selector
                    || selector == VanitasCredit.InvalidSignature.selector,
                "expected an authorisation failure, got something else"
            );
        }
    }

    /// The (r, s, v) triple out of a 65-byte signature.
    ///
    /// Extracted in assembly rather than with array slices: Solidity has no
    /// explicit conversion from `bytes memory` to `bytesNN`, and the idiomatic
    /// slice form would not compile.
    function _splitSignature(bytes memory sig) internal pure returns (bytes32 r, uint256 s, uint8 v) {
        assembly ("memory-safe") {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }
    }

    // ----------------------------------------------------------- deployment

    function test_Deploy_SetsNameVersionOwnerAndOperator() public view {
        assertEq(credit.NAME(), "VanitasCredit");
        assertEq(credit.VERSION(), "1");
        assertEq(credit.owner(), address(this), "deployer owns the contract");
        assertEq(credit.operator(), operator);
        assertFalse(credit.paused());
        assertEq(credit.totalSupply(), 0);
    }

    function test_Deploy_RevertsOnZeroOperator() public {
        vm.expectRevert(VanitasCredit.ZeroAddress.selector);
        new VanitasCredit(address(0));
    }

    // ---------------------------------------------------------------- credit

    function test_Credit_CreditsBalanceAndTotalSupply() public {
        VanitasCredit.Action memory action = _action(credit.OP_CREDIT(), user, address(0), 500 ether, 0);
        bytes memory sig = _sign(OPERATOR_PK, action);

        vm.expectEmit(true, false, false, true);
        emit VanitasCredit.CreditExecuted(user, 500 ether, 500 ether, 0);

        credit.execute(action, sig);

        assertEq(credit.balanceOf(user), 500 ether);
        assertEq(credit.totalSupply(), 500 ether);
        assertEq(credit.nonces(user), 1, "one authorisation consumed one nonce");
    }

    /// The whole design rests on this: the submitter is irrelevant.
    function test_Credit_MayBeSubmittedByAnyone() public {
        VanitasCredit.Action memory action = _action(credit.OP_CREDIT(), user, address(0), 100, 0);
        bytes memory sig = _sign(OPERATOR_PK, action);

        vm.prank(stranger);
        credit.execute(action, sig);

        assertEq(credit.balanceOf(user), 100);
    }

    function test_Credit_AccumulatesAcrossSeparateAuthorisations() public {
        _credit(user, 100);
        _credit(user, 250);

        assertEq(credit.balanceOf(user), 350);
        assertEq(credit.totalSupply(), 350);
        assertEq(credit.nonces(user), 2);
    }

    function test_Credit_RevertsOnZeroAmount() public {
        VanitasCredit.Action memory action = _action(credit.OP_CREDIT(), user, address(0), 0, 0);
        bytes memory sig = _sign(OPERATOR_PK, action);

        vm.expectRevert(VanitasCredit.ZeroAmount.selector);
        credit.execute(action, sig);
    }

    function test_Credit_RevertsOnZeroAccount() public {
        VanitasCredit.Action memory action = _action(credit.OP_CREDIT(), address(0), address(0), 100, 0);
        bytes memory sig = _sign(OPERATOR_PK, action);

        vm.expectRevert(VanitasCredit.ZeroAddress.selector);
        credit.execute(action, sig);
    }

    // ----------------------------------------------------------------- debit

    function test_Debit_RemovesBalanceAndTotalSupply() public {
        _credit(user, 500);

        VanitasCredit.Action memory action = _action(credit.OP_DEBIT(), user, address(0), 200, credit.nonces(user));
        credit.execute(action, _sign(OPERATOR_PK, action));

        assertEq(credit.balanceOf(user), 300);
        assertEq(credit.totalSupply(), 300);
    }

    function test_Debit_BeyondBalanceRevertsAndConsumesNoNonce() public {
        _credit(user, 100);
        uint256 nonceBefore = credit.nonces(user);

        VanitasCredit.Action memory action = _action(credit.OP_DEBIT(), user, address(0), 101, nonceBefore);

        // available = 100, requested = 101
        bytes memory sig = _sign(OPERATOR_PK, action);
        vm.expectRevert(abi.encodeWithSelector(VanitasCredit.InsufficientBalance.selector, 100, 101));
        credit.execute(action, sig);

        assertEq(credit.balanceOf(user), 100, "balance untouched");
        assertEq(credit.nonces(user), nonceBefore, "a reverted action burns nothing");
    }

    // -------------------------------------------------------------- transfer

    function test_Transfer_MovesBalanceWithoutChangingTotalSupply() public {
        address other = vm.addr(0xCAFE);
        _credit(user, 500);

        VanitasCredit.Action memory action = _action(credit.OP_TRANSFER(), user, other, 200, credit.nonces(user));
        credit.execute(action, _sign(USER_PK, action));

        assertEq(credit.balanceOf(user), 300);
        assertEq(credit.balanceOf(other), 200);
        // Value moved; none was created or destroyed.
        assertEq(credit.totalSupply(), 500);
    }

    function test_Transfer_MustBeSignedByTheAccountItself() public {
        address other = vm.addr(0xCAFE);
        _credit(user, 500);

        VanitasCredit.Action memory action = _action(credit.OP_TRANSFER(), user, other, 200, credit.nonces(user));

        // The platform's billing key has no authority over a user's own funds.
        bytes memory sig = _sign(OPERATOR_PK, action);
        vm.expectRevert(abi.encodeWithSelector(VanitasCredit.NotAuthorisedSigner.selector, user, operator));
        credit.execute(action, sig);
    }

    function test_Transfer_ToZeroAddressReverts() public {
        _credit(user, 500);
        VanitasCredit.Action memory action = _action(credit.OP_TRANSFER(), user, address(0), 100, credit.nonces(user));
        bytes memory sig = _sign(USER_PK, action);

        vm.expectRevert(VanitasCredit.ZeroAddress.selector);
        credit.execute(action, sig);
    }

    function test_Transfer_BeyondBalanceReverts() public {
        _credit(user, 50);
        VanitasCredit.Action memory action = _action(credit.OP_TRANSFER(), user, stranger, 51, credit.nonces(user));
        bytes memory sig = _sign(USER_PK, action);

        vm.expectRevert(abi.encodeWithSelector(VanitasCredit.InsufficientBalance.selector, 50, 51));
        credit.execute(action, sig);
    }

    // -------------------------------------------------------- authorisation

    function test_StrangerSignatureIsRejected() public {
        VanitasCredit.Action memory action = _action(credit.OP_CREDIT(), user, address(0), 100, 0);
        bytes memory sig = _sign(STRANGER_PK, action);

        // Recovered is deterministic here: we know exactly who signed.
        vm.expectRevert(abi.encodeWithSelector(VanitasCredit.NotAuthorisedSigner.selector, operator, stranger));
        credit.execute(action, sig);
    }

    function test_ExpiredDeadlineIsRejected() public {
        // Captured before the warp via the cheatcode the linter asks for:
        // `getBlockTimestamp()` is an explicit snapshot, whereas a bare
        // `block.timestamp` read would be ambiguous about *which* instant it
        // reflects once the warp below lands.
        uint256 signedAt = vm.getBlockTimestamp();

        VanitasCredit.Action memory action =
            VanitasCredit.Action(credit.OP_CREDIT(), user, address(0), 100, 0, signedAt - 1);
        bytes memory sig = _sign(OPERATOR_PK, action);

        vm.warp(signedAt + 1 days);

        vm.expectRevert(abi.encodeWithSelector(VanitasCredit.SignatureExpired.selector, signedAt - 1));
        credit.execute(action, sig);
    }

    function test_ReplayIsRejectedByNonce() public {
        VanitasCredit.Action memory action = _action(credit.OP_CREDIT(), user, address(0), 100, 0);
        bytes memory sig = _sign(OPERATOR_PK, action);

        credit.execute(action, sig);
        assertEq(credit.balanceOf(user), 100);

        // Same action, same signature — the nonce has moved on.
        vm.expectRevert(abi.encodeWithSelector(VanitasCredit.NonceMismatch.selector, 1, 0));
        credit.execute(action, sig);

        assertEq(credit.balanceOf(user), 100, "no second credit");
    }

    function test_SignatureOverADifferentAmountIsRejected() public {
        VanitasCredit.Action memory signedAction = _action(credit.OP_CREDIT(), user, address(0), 100, 0);
        bytes memory sig = _sign(OPERATOR_PK, signedAction);

        VanitasCredit.Action memory forged = _action(credit.OP_CREDIT(), user, address(0), 1_000_000, 0);

        _assertAuthorisationFails(forged, sig);
        assertEq(credit.balanceOf(user), 0);
    }

    function test_SignedCreditCannotBeFlippedIntoADebit() public {
        _credit(user, 500);

        // Operator signs a CREDIT…
        VanitasCredit.Action memory credited = _action(credit.OP_CREDIT(), user, address(0), 500, credit.nonces(user));
        bytes memory creditSig = _sign(OPERATOR_PK, credited);

        // …and someone tries to replay it as a DEBIT of the same shape. `op`
        // is inside the signed struct, so changing it invalidates the
        // signature exactly like changing the amount would.
        VanitasCredit.Action memory asDebit = VanitasCredit.Action(
            credit.OP_DEBIT(), credited.account, credited.to, credited.amount, credited.nonce, credited.deadline
        );

        _assertAuthorisationFails(asDebit, creditSig);
        assertEq(credit.balanceOf(user), 500, "balance unchanged");
    }

    function test_TooShortSignatureIsRejected() public {
        VanitasCredit.Action memory action = _action(credit.OP_CREDIT(), user, address(0), 100, 0);

        vm.expectRevert(VanitasCredit.InvalidSignature.selector);
        credit.execute(action, hex"");
    }

    /// EIP-2: for every valid (r, s, v) there is a second valid (r, n-s, v').
    /// Accepting both would give one authorisation two encodings; rejecting
    /// high-s pins it to one canonical form.
    function test_HighSSignatureIsRejected() public {
        VanitasCredit.Action memory action = _action(credit.OP_CREDIT(), user, address(0), 100, 0);
        bytes memory canonical = _sign(OPERATOR_PK, action);

        (bytes32 r, uint256 s, uint8 v) = _splitSignature(canonical);

        uint256 highS = SECP256K1_N - s;
        uint8 flippedV = v == 27 ? 28 : 27;
        bytes memory malleable = abi.encodePacked(r, bytes32(highS), flippedV);

        // Guarded before ecrecover is even reached.
        vm.expectRevert(VanitasCredit.InvalidSignature.selector);
        credit.execute(action, malleable);

        assertEq(credit.balanceOf(user), 0);
    }

    function test_WrongChainIdIsRejected() public {
        VanitasCredit.Action memory action = _action(credit.OP_CREDIT(), user, address(0), 100, 0);
        bytes memory sig = _sign(OPERATOR_PK, action);

        // The same key, the same payload — but bound to another chain's
        // domain separator, so it must not work here.
        vm.chainId(999);

        _assertAuthorisationFails(action, sig);
        assertEq(credit.balanceOf(user), 0);
    }

    function test_SignatureForAnotherDeploymentIsRejected() public {
        // Deploy a second instance; a signature for it must be worthless here.
        VanitasCredit other = new VanitasCredit(operator);

        VanitasCredit.Action memory action = _action(credit.OP_CREDIT(), user, address(0), 100, 0);
        bytes memory sig = _signFor(other, OPERATOR_PK, action);

        _assertAuthorisationFails(action, sig);
        assertEq(credit.balanceOf(user), 0);
    }

    // -------------------------------------------------- EIP-712 mechanics

    /// The digest is a public contract with every wallet that will ever sign
    /// for this system, so it is asserted here as a composition of its parts
    /// rather than left implicit inside `hashTypedData`. If anyone edits the
    /// domain — a bumped version string, a reshuffled typehash — this fails,
    /// which is the cheap place for it to fail: every signature minted before
    /// the change would otherwise keep *looking* valid and only be rejected
    /// once real credit was on the line.
    function test_DigestIsTheStandardEip712Composite() public view {
        VanitasCredit.Action memory action = _action(credit.OP_CREDIT(), user, address(0), 100, 0);

        bytes32 rebuilt = keccak256(abi.encodePacked("\x19\x01", credit.domainSeparator(), credit.hashAction(action)));
        assertEq(credit.hashTypedData(action), rebuilt, "digest is not the EIP-712 composite");

        // …and the domain is the EIP-712 domain, in its published field order.
        // Permuting the same four fields would hash to something else entirely
        // while looking just as plausible to a reader.
        bytes32 expectedDomain = keccak256(
            abi.encode(
                credit.DOMAIN_TYPEHASH(),
                keccak256(bytes(credit.NAME())),
                keccak256(bytes(credit.VERSION())),
                block.chainid,
                address(credit)
            )
        );
        assertEq(credit.domainSeparator(), expectedDomain, "domain is not the standard one");
    }

    /// A signature minted on one chain, or against one deployment, must be
    /// worthless on another — the whole reason `chainId` and
    /// `verifyingContract` are in the domain at all.
    function test_DomainSeparatorBindsChainAndContract() public {
        bytes32 here = credit.domainSeparator();

        // Same code, different address → different domain.
        VanitasCredit other = new VanitasCredit(operator);
        assertTrue(credit.domainSeparator() != other.domainSeparator(), "two deployments share a domain");
        assertEq(credit.domainSeparator(), here, "reading another contract moved our domain");

        // Same contract, different chain → different domain.
        vm.chainId(999);
        assertTrue(credit.domainSeparator() != here, "chainId is not part of the domain");

        vm.chainId(31337);
        assertEq(credit.domainSeparator(), here, "domain did not survive a round trip");
    }

    function test_UnknownOperationIsRejected() public {
        // Signed by the operator correctly — but this build does not
        // implement the operation, so it is refused rather than ignored.
        bytes32 bogusOp = keccak256("MINT_THE_TREASURY");
        VanitasCredit.Action memory action = _action(bogusOp, user, address(0), 100, 0);
        bytes memory sig = _sign(OPERATOR_PK, action);

        vm.expectRevert(abi.encodeWithSelector(VanitasCredit.UnknownOperation.selector, bogusOp));
        credit.execute(action, sig);
    }

    // ----------------------------------------------------------------- batch

    function test_Batch_CreditsSeveralAccountsInOneTransaction() public {
        address a = vm.addr(0x1111);
        address b = vm.addr(0x2222);
        address c = vm.addr(0x3333);

        VanitasCredit.Action[] memory actions = new VanitasCredit.Action[](3);
        bytes[] memory sigs = new bytes[](3);

        address[3] memory recipients = [a, b, c];
        uint256[3] memory amounts = [uint256(10), 20, 30];

        for (uint256 i = 0; i < 3; i++) {
            actions[i] = _action(credit.OP_CREDIT(), recipients[i], address(0), amounts[i], 0);
            sigs[i] = _sign(OPERATOR_PK, actions[i]);
        }

        credit.executeBatch(actions, sigs);

        assertEq(credit.balanceOf(a), 10);
        assertEq(credit.balanceOf(b), 20);
        assertEq(credit.balanceOf(c), 30);
        assertEq(credit.totalSupply(), 60);
    }

    function test_Batch_LengthMismatchIsRejected() public {
        VanitasCredit.Action[] memory actions = new VanitasCredit.Action[](2);
        bytes[] memory sigs = new bytes[](1);

        vm.expectRevert(abi.encodeWithSelector(VanitasCredit.LengthMismatch.selector, 2, 1));
        credit.executeBatch(actions, sigs);
    }

    /// A partially applied billing run is worse than a failed one.
    function test_Batch_IsAtomic() public {
        _credit(user, 100);
        address other = vm.addr(0xCAFE);

        VanitasCredit.Action[] memory actions = new VanitasCredit.Action[](2);
        bytes[] memory sigs = new bytes[](2);

        actions[0] = _action(credit.OP_CREDIT(), other, address(0), 77, 0);
        sigs[0] = _sign(OPERATOR_PK, actions[0]);

        // The second action asks for more than the user holds.
        actions[1] = _action(credit.OP_DEBIT(), user, address(0), 1_000_000, credit.nonces(user));
        sigs[1] = _sign(OPERATOR_PK, actions[1]);

        vm.expectRevert(abi.encodeWithSelector(VanitasCredit.InsufficientBalance.selector, 100, 1_000_000));
        credit.executeBatch(actions, sigs);

        // Nothing from the batch survived.
        assertEq(credit.balanceOf(other), 0, "first action must roll back too");
        assertEq(credit.balanceOf(user), 100);
        assertEq(credit.totalSupply(), 100);
    }

    // ----------------------------------------------------------------- admin

    function test_SetOperatorRequiresOwner() public {
        address next = vm.addr(0x9999);

        vm.expectRevert(VanitasCredit.NotOwner.selector);
        vm.prank(stranger);
        credit.setOperator(next);
    }

    function test_SetOperatorTakesEffectImmediately() public {
        uint256 nextPk = 0xC0FFEE;
        address next = vm.addr(nextPk);

        credit.setOperator(next);

        assertEq(credit.operator(), next);

        // The old key is dead for the very next signature…
        VanitasCredit.Action memory withOld = _action(credit.OP_CREDIT(), user, address(0), 100, 0);
        bytes memory oldSig = _sign(OPERATOR_PK, withOld);
        vm.expectRevert(abi.encodeWithSelector(VanitasCredit.NotAuthorisedSigner.selector, next, operator));
        credit.execute(withOld, oldSig);

        // …and the new one works.
        VanitasCredit.Action memory withNew = _action(credit.OP_CREDIT(), user, address(0), 100, 0);
        credit.execute(withNew, _sign(nextPk, withNew));
        assertEq(credit.balanceOf(user), 100);
    }

    function test_PauseBlocksExecutionAndOwnerCanAlwaysUnpause() public {
        credit.setPaused(true);

        VanitasCredit.Action memory action = _action(credit.OP_CREDIT(), user, address(0), 100, 0);
        bytes memory sig = _sign(OPERATOR_PK, action);

        vm.expectRevert(VanitasCredit.IsPaused.selector);
        credit.execute(action, sig);

        // Un-pausing must work *while* paused — otherwise a paused contract
        // is an unrecoverable one.
        credit.setPaused(false);
        credit.execute(action, sig);
        assertEq(credit.balanceOf(user), 100);
    }

    function test_TransferOwnershipRequiresOwnerAndRejectsZero() public {
        vm.expectRevert(VanitasCredit.NotOwner.selector);
        vm.prank(stranger);
        credit.transferOwnership(stranger);

        vm.expectRevert(VanitasCredit.ZeroAddress.selector);
        credit.transferOwnership(address(0));
    }

    /// The two refusal paths above prove the lock; this proves the key
    /// actually changes hands — that the outgoing owner loses the admin
    /// functions, not merely that they once held them.
    function test_TransferOwnershipHandsOverControl() public {
        address nextOwner = vm.addr(0xFACE);
        credit.transferOwnership(nextOwner);

        assertEq(credit.owner(), nextOwner);

        // The outgoing owner keeps nothing…
        vm.expectRevert(VanitasCredit.NotOwner.selector);
        vm.prank(address(this));
        credit.setPaused(true);

        // …and the incoming one inherits the whole toolbox.
        vm.prank(nextOwner);
        credit.setPaused(true);
        assertTrue(credit.paused(), "new owner can pause");

        vm.prank(nextOwner);
        credit.setPaused(false);
        assertFalse(credit.paused(), "new owner can unpause");

        vm.prank(nextOwner);
        credit.setOperator(stranger);
        assertEq(credit.operator(), stranger, "new owner can rotate the billing key");
    }

    // ------------------------------------------------------------------ fuzz

    /// A full credit-then-debit round trip must land exactly where it started
    /// for any amount that fits — no rounding, no residue.
    ///
    /// Bounded away from zero: a credit of 0 is rejected by the contract by
    /// design (`ZeroAmount`), so zero would test the guard, not the round trip.
    function testFuzz_CreditThenDebitRoundTrip(uint96 raw) public {
        uint256 amount = bound(uint256(raw), 1, type(uint96).max);

        VanitasCredit.Action memory creditAction = _action(credit.OP_CREDIT(), user, address(0), amount, 0);
        credit.execute(creditAction, _sign(OPERATOR_PK, creditAction));
        assertEq(credit.balanceOf(user), amount);

        VanitasCredit.Action memory debitAction =
            _action(credit.OP_DEBIT(), user, address(0), amount, credit.nonces(user));
        credit.execute(debitAction, _sign(OPERATOR_PK, debitAction));

        assertEq(credit.balanceOf(user), 0, "round trip left a residue");
        assertEq(credit.totalSupply(), 0);
        assertEq(credit.nonces(user), 2);
    }

    /// The ledger's defining property: `totalSupply` is always exactly the sum
    /// of every balance. A transfer can move value around but never conjure
    /// or destroy any.
    ///
    /// Both balances are bounded away from zero for the same reason as the
    /// round-trip test: `ZeroAmount` would fire before any of this ran.
    function testFuzz_TransferPreservesTotalSupply(uint96 rawA, uint96 rawB, uint96 rawSend) public {
        uint256 a = bound(uint256(rawA), 1, type(uint96).max);
        uint256 b = bound(uint256(rawB), 1, type(uint96).max);
        address alice = vm.addr(0xA11A);
        address bob = vm.addr(0xB0B0);

        VanitasCredit.Action memory creditA = _action(credit.OP_CREDIT(), alice, address(0), a, 0);
        credit.execute(creditA, _sign(OPERATOR_PK, creditA));

        VanitasCredit.Action memory creditB = _action(credit.OP_CREDIT(), bob, address(0), b, 0);
        credit.execute(creditB, _sign(OPERATOR_PK, creditB));

        uint256 supplyBefore = credit.totalSupply();
        uint256 send = bound(uint256(rawSend), 0, a);

        if (send > 0) {
            VanitasCredit.Action memory move = _action(credit.OP_TRANSFER(), alice, bob, send, credit.nonces(alice));
            credit.execute(move, _sign(0xA11A, move));

            assertEq(credit.balanceOf(alice), a - send);
            assertEq(credit.balanceOf(bob), b + send);
        }

        assertEq(credit.totalSupply(), supplyBefore, "transfer changed the supply");
        assertEq(credit.balanceOf(alice) + credit.balanceOf(bob), supplyBefore);
    }
}
