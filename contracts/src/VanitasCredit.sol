// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VanitasCredit
/// @notice The platform's credit ledger: balances are held here, and every
///         change to them is authorised **off-chain** with an EIP-712
///         signature that anyone may submit.
///
///         Why off-chain authorisation? The platform wants to top up or bill
///         a user's credit without that user holding ETH, and without the
///         backend broadcasting a transaction itself for each action. The
///         backend signs a typed-data message; any relayer (or the user, or
///         a cron job) submits it and pays the gas. The contract only checks
///         that the signature is the one it expected for that exact action,
///         on this exact chain, in this exact contract.
///
///         Three operations, each with its own expected signer:
///
///         | op          | expected signer | meaning                          |
///         |-------------|-----------------|----------------------------------|
///         | `CREDIT`    | `operator`      | platform grants credit           |
///         | `DEBIT`     | `operator`      | platform bills credit            |
///         | `TRANSFER`  | the account     | the user moves their own credit  |
///
///         `execute` is therefore **permissionless on purpose** — `msg.sender`
///         is never part of the authorisation. That is what makes it gasless
///         for the user; it is also why the checks below are the only thing
///         standing between a stranger and somebody's balance.
///
///         Trust assumption (documented, not hidden): the `operator` key can
///         credit and debit any account arbitrarily. It is the platform's
///         billing key. Rotate it with `setOperator` if it is ever exposed;
///         `pause` is the circuit breaker while you investigate.
contract VanitasCredit {
    // ---------------------------------------------------------------- errors

    error NotOwner();
    error ZeroAddress();
    error ZeroAmount();
    error IsPaused();
    error UnknownOperation(bytes32 op);
    error NotAuthorisedSigner(address expected, address recovered);
    error SignatureExpired(uint256 deadline);
    error NonceMismatch(uint256 expected, uint256 supplied);
    error InvalidSignature();
    error InsufficientBalance(uint256 available, uint256 requested);
    error LengthMismatch(uint256 actions, uint256 signatures);

    // ---------------------------------------------------------------- events

    event CreditExecuted(address indexed account, uint256 amount, uint256 newBalance, uint256 nonce);
    event DebitExecuted(address indexed account, uint256 amount, uint256 newBalance, uint256 nonce);
    event TransferExecuted(address indexed from, address indexed to, uint256 amount, uint256 nonce);
    event OperatorRotated(address indexed previous, address indexed current);
    event OwnershipTransferred(address indexed previous, address indexed current);
    event PausedSet(bool paused);

    // ----------------------------------------------------------- EIP-712 types

    /// @dev One struct for all three operations, with `op` inside the signed
    ///      payload. Putting `op` in the struct (rather than using three
    ///      different typehashes) is what stops a signed CREDIT from being
    ///      replayed as a DEBIT: changing the field invalidates the signature
    ///      just as surely as changing the amount would.
    ///
    ///      `account` is the nonce holder — the user for TRANSFER, the
    ///      beneficiary for CREDIT/DEBIT. `to` is the TRANSFER recipient and
    ///      `address(0)` otherwise.
    bytes32 public constant ACTION_TYPEHASH =
        keccak256("Action(bytes32 op,address account,address to,uint256 amount,uint256 nonce,uint256 deadline)");

    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 public constant OP_CREDIT = keccak256("CREDIT");
    bytes32 public constant OP_DEBIT = keccak256("DEBIT");
    bytes32 public constant OP_TRANSFER = keccak256("TRANSFER");

    struct Action {
        bytes32 op;
        address account;
        address to;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
    }

    // ------------------------------------------------------------------ state

    /// Fixed in the domain separator, so they cannot be changed after the
    /// fact and signatures stay verifiable forever.
    string public constant NAME = "VanitasCredit";
    string public constant VERSION = "1";

    address public owner;
    address public operator;
    bool public paused;

    mapping(address => uint256) public balanceOf;

    /// One sequence per account, consumed by every action that names it.
    /// Shared across operations on purpose: an authorisation is a use of the
    /// account's nonce slot, and mixing them would let two pending signatures
    /// race for the same slot.
    mapping(address => uint256) public nonces;

    /// Sum of every balance. TRANSFER moves it around but never changes it.
    uint256 public totalSupply;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert IsPaused();
        _;
    }

    constructor(address initialOperator) {
        if (initialOperator == address(0)) revert ZeroAddress();
        owner = msg.sender;
        operator = initialOperator;
        emit OwnershipTransferred(address(0), msg.sender);
        emit OperatorRotated(address(0), initialOperator);
    }

    // --------------------------------------------------------- EIP-712 hashing

    /// @dev Computed on every call rather than cached at construction: a
    ///      cached separator goes stale on a chain fork, where `block.chainid`
    ///      changes but the contract address does not. Costs a little gas;
    ///      buys correctness on every chain without redeployment.
    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(NAME)), keccak256(bytes(VERSION)), block.chainid, address(this))
        );
    }

    /// @dev The struct hash, exposed so tests and off-chain tooling can build
    ///      the digest without re-deriving the type string by hand.
    function hashAction(Action memory action) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ACTION_TYPEHASH, action.op, action.account, action.to, action.amount, action.nonce, action.deadline
            )
        );
    }

    /// @notice The digest a wallet must sign (EIP-712 `signTypedData_v4`).
    function hashTypedData(Action memory action) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), hashAction(action)));
    }

    // -------------------------------------------------------------- execution

    /// @notice Submit one authorised action. Permissionless by design — the
    ///         signature is the authorisation, not `msg.sender`.
    function execute(Action calldata action, bytes calldata signature) external whenNotPaused {
        _execute(action, signature);
    }

    /// @notice Submit several actions in one transaction — the platform
    ///         crediting a thousand users pays one transaction's worth of gas
    ///         instead of a thousand.
    ///
    ///         All-or-nothing: a single bad action reverts the whole batch,
    ///         because a partially-applied billing run is worse than a failed
    ///         one.
    function executeBatch(Action[] calldata actions, bytes[] calldata signatures) external whenNotPaused {
        if (actions.length != signatures.length) {
            revert LengthMismatch(actions.length, signatures.length);
        }
        for (uint256 i = 0; i < actions.length; i++) {
            _execute(actions[i], signatures[i]);
        }
    }

    function _execute(Action calldata action, bytes calldata signature) internal {
        if (action.amount == 0) revert ZeroAmount();
        // Guards every operation: TRANSFER names the sender as `account`, so
        // this single check covers crediting and debiting address(0) too.
        if (action.account == address(0)) revert ZeroAddress();
        // A deadline is a window of hours, not of seconds: a validator can
        // skew `block.timestamp` by a little, and that cannot turn an
        // unexpired authorisation into an expired one in any way that
        // matters. This is the standard Permit-style check — the only real
        // alternative is no deadline at all, which leaves a signature valid
        // forever. Strictly worse.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > action.deadline) revert SignatureExpired(action.deadline);
        if (action.nonce != nonces[action.account]) {
            revert NonceMismatch(nonces[action.account], action.nonce);
        }

        address expected = _expectedSigner(action);
        address recovered = _recover(hashTypedData(action), signature);
        if (recovered == address(0)) revert InvalidSignature();
        if (recovered != expected) revert NotAuthorisedSigner(expected, recovered);

        // Checks done — now effects. No external calls anywhere in this
        // contract, so there is no reentrancy surface to reason about.
        unchecked {
            nonces[action.account] = action.nonce + 1;
        }

        if (action.op == OP_CREDIT) {
            balanceOf[action.account] += action.amount;
            totalSupply += action.amount;
            // `reentrancy-events` reads `_recover` above as an external call.
            // It is `ecrecover` — a stateless precompile that cannot be
            // re-entered and touches nothing. This contract makes no external
            // calls at all (see the class docstring), so the CEI concern has
            // nothing to bite on.
            //
            // These three emits must stay on ONE line each: Foundry matches
            // the suppression comment by line number, and silently ignores it
            // when the diagnostic spans several lines. `[fmt] line_length`
            // below is set wide enough that `forge fmt` will not rewrap them.
            // forge-lint: disable-next-line(reentrancy-events)
            emit CreditExecuted(action.account, action.amount, balanceOf[action.account], action.nonce);
        } else if (action.op == OP_DEBIT) {
            uint256 available = balanceOf[action.account];
            if (available < action.amount) {
                revert InsufficientBalance(available, action.amount);
            }
            unchecked {
                balanceOf[action.account] = available - action.amount;
                totalSupply -= action.amount;
            }
            // See the note on CreditExecuted: `ecrecover` is stateless, and
            // this emit must stay on one line for the same reason.
            // forge-lint: disable-next-line(reentrancy-events)
            emit DebitExecuted(action.account, action.amount, balanceOf[action.account], action.nonce);
        } else if (action.op == OP_TRANSFER) {
            if (action.to == address(0)) revert ZeroAddress();
            uint256 available = balanceOf[action.account];
            if (available < action.amount) {
                revert InsufficientBalance(available, action.amount);
            }
            unchecked {
                // Safe: `available >= amount` was just checked, so the source
                // cannot underflow; the destination can only overflow if the
                // whole sum exceeded 2**256, which `totalSupply <= 2**256-1`
                // and the debit above already rule out.
                balanceOf[action.account] = available - action.amount;
                balanceOf[action.to] += action.amount;
            }
            // totalSupply unchanged — value moved, none was created.
            // See the note on CreditExecuted: `ecrecover` is stateless, and
            // this emit must stay on one line for the same reason.
            // forge-lint: disable-next-line(reentrancy-events)
            emit TransferExecuted(action.account, action.to, action.amount, action.nonce);
        } else {
            // Unreachable in this build, and knowingly so — `_expectedSigner`
            // runs first and reverts on any op it does not recognise, so an
            // unknown op can never reach this dispatch. `forge coverage` shows
            // this line as uncovered for exactly that reason.
            //
            // Kept anyway, deliberately: the property being defended is "an
            // operation this build does not implement is never silently
            // ignored", and that property should not depend on two distant
            // `if` chains staying in a particular order. If someone extends
            // `_expectedSigner` to grant a signer for a new op without adding
            // the branch here, this revert is what stands between them and a
            // transaction that consumes a nonce and changes nothing.
            revert UnknownOperation(action.op);
        }
    }

    /// @dev Whose signature must accompany this action.
    function _expectedSigner(Action calldata action) internal view returns (address) {
        if (action.op == OP_CREDIT || action.op == OP_DEBIT) return operator;
        if (action.op == OP_TRANSFER) return action.account;
        // Fail before looking at the signature: an unknown op has no valid
        // signer, and saying so is cheaper and clearer than a generic
        // signature failure.
        revert UnknownOperation(action.op);
    }

    // ------------------------------------------------------------------- ECDSA

    /// @dev Returns `address(0)` for anything malformed instead of reverting,
    ///      so every caller funnels into one place and the distinction between
    ///      "unparseable" and "parsed but wrong" stays a single comparison.
    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            // `signature.offset` is the start of the bytes payload in calldata.
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        // EIP-2 malleability: for every valid (r, s, v) there exists a second
        // equally-valid (r, n - s, v'). Accepting both would let one signature
        // be submitted twice under two different hashes. Rejecting high-s
        // pins each authorisation to a single canonical encoding — the nonce
        // would catch a replay anyway, but not needing to rely on that is
        // better.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }
        // Only 27/28. A `v` of 0 or 1 is a different (EIP-2098) packing this
        // code never produces, so it would be guessing.
        if (v != 27 && v != 28) return address(0);

        address signer = ecrecover(digest, v, r, s);
        // `ecrecover` returns address(0) on failure rather than reverting;
        // address(0) is never a valid signer (see _expectedSigner), but the
        // explicit check keeps the failure path obvious to a reader.
        return signer == address(0) ? address(0) : signer;
    }

    // ----------------------------------------------------------------- admin

    /// @notice Rotate the billing key. Takes effect for the very next
    ///         signature checked — pending actions signed by the old key
    ///         become invalid immediately, which is the point.
    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        emit OperatorRotated(operator, newOperator);
        operator = newOperator;
    }

    /// @notice The circuit breaker. Deliberately callable while paused — the
    ///         owner must always be able to un-pause, or a paused contract is
    ///         an unrecoverable one.
    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PausedSet(value);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
