// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title Reserve
 * @notice 1:1 time-slot booking with a cancellation cutoff.
 * Hosts open resources with a fixed slot length, price, and cancellation cutoff.
 * Bookers pick aligned slots up to 60 days in advance and pay up front.
 * Cancel before the cutoff for a full pull refund; after cutoff deposits are non-refundable.
 * After slot begins, the host (or anyone) collects the revenue to the host's till.
 */
contract Reserve {
    // --- Constants ---
    uint32 public constant MIN_SLOT_SECS = 900;       // 15 minutes
    uint32 public constant MAX_SLOT_SECS = 86400;     // 24 hours
    uint32 public constant MAX_CUTOFF_SECS = 604800;   // 7 days
    uint64 public constant HORIZON_SECS = 5184000;     // 60 days
    uint256 public constant MAX_NAME = 40;            // 40 bytes
    uint256 public constant MAX_SLOTS_WINDOW = 96;     // 96 slots
    uint256 public constant MAX_LATEST = 50;           // 50 resources

    // --- Enums and Structs ---
    enum Status {
        None,
        Booked,
        Cancelled,
        Collected
    }

    struct Resource {
        address host;
        uint128 price;
        uint32 slotSecs;
        uint32 cutoffSecs;
        string name;
    }

    struct Booking {
        address booker;
        Status status;
    }

    // --- Storage ---
    mapping(uint256 => Resource) private _resources;
    mapping(uint256 => mapping(uint64 => Booking)) private _bookings;
    mapping(address => uint256) public pending;
    uint256 public resourceCount;
    mapping(address => uint256[]) private _hostResources;

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    // --- Events ---
    event Opened(
        uint256 indexed id,
        address indexed host,
        uint128 price,
        uint32 slotSecs,
        uint32 cutoffSecs,
        string name
    );
    event Booked(uint256 indexed id, uint64 indexed start, address indexed booker);
    event Cancelled(uint256 indexed id, uint64 indexed start, address indexed booker, bool byHost);
    event Collected(uint256 indexed id, uint64 indexed start, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    // --- Errors ---
    error ZeroPrice();
    error BadSlotLength();
    error BadCutoff();
    error NameTooLong();
    error NoSuchResource();
    error MisalignedSlot();
    error SlotOutOfRange();
    error Taken();
    error WrongPayment(uint256 required);
    error HostCannotBook();
    error NotBooker();
    error NotHost();
    error NotBooked();
    error PastCutoff(uint64 latest);
    error AlreadyStarted();
    error NotStarted();
    error NothingToWithdraw();
    error TransferFailed();
    error WindowTooLarge();
    error ReentrancyGuardReentrantCall();

    modifier nonReentrant() {
        if (_reentrancyStatus == _ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    constructor() {
        _reentrancyStatus = _NOT_ENTERED;
    }

    // --- Core Functions ---

    /**
     * @notice Opens a new bookable resource.
     * @param name Resource name (1..40 bytes).
     * @param price Cost in wei per slot (> 0).
     * @param slotSecs Slot duration (15m..24h, must divide 86400).
     * @param cutoffSecs Cancellation cutoff before start (0..7 days).
     */
    function open(
        string calldata name,
        uint128 price,
        uint32 slotSecs,
        uint32 cutoffSecs
    ) external returns (uint256 id) {
        if (price == 0) revert ZeroPrice();
        if (bytes(name).length == 0 || bytes(name).length > MAX_NAME) revert NameTooLong();
        if (
            slotSecs < MIN_SLOT_SECS ||
            slotSecs > MAX_SLOT_SECS ||
            (86400 % slotSecs != 0)
        ) revert BadSlotLength();
        if (cutoffSecs > MAX_CUTOFF_SECS) revert BadCutoff();

        id = ++resourceCount;
        _resources[id] = Resource({
            host: msg.sender,
            price: price,
            slotSecs: slotSecs,
            cutoffSecs: cutoffSecs,
            name: name
        });
        _hostResources[msg.sender].push(id);

        emit Opened(id, msg.sender, price, slotSecs, cutoffSecs, name);
    }

    /**
     * @notice Books an aligned time slot on a resource.
     * @param id The resource ID.
     * @param start Unix timestamp of the slot start (multiple of slotSecs).
     */
    function book(uint256 id, uint64 start) external payable {
        Resource storage r = _resources[id];
        if (r.host == address(0)) revert NoSuchResource();
        if (msg.sender == r.host) revert HostCannotBook();
        if (start % r.slotSecs != 0) revert MisalignedSlot();
        if (start <= block.timestamp || start > block.timestamp + HORIZON_SECS) {
            revert SlotOutOfRange();
        }

        Booking storage b = _bookings[id][start];
        if (b.status == Status.Booked || b.status == Status.Collected) {
            revert Taken();
        }
        if (msg.value != r.price) revert WrongPayment(r.price);

        b.booker = msg.sender;
        b.status = Status.Booked;

        emit Booked(id, start, msg.sender);
    }

    /**
     * @notice Booker cancels their booking before the cutoff deadline for a full refund.
     * @param id The resource ID.
     * @param start The slot start timestamp.
     */
    function cancel(uint256 id, uint64 start) external {
        Resource storage r = _resources[id];
        if (r.host == address(0)) revert NoSuchResource();

        Booking storage b = _bookings[id][start];
        if (b.status != Status.Booked) revert NotBooked();
        if (msg.sender != b.booker) revert NotBooker();

        uint64 cutoff = uint64(r.cutoffSecs);
        if (block.timestamp + cutoff > start) {
            uint64 latestCancel = start >= cutoff ? start - cutoff : 0;
            revert PastCutoff(latestCancel);
        }

        b.status = Status.Cancelled;
        pending[msg.sender] += r.price;

        emit Cancelled(id, start, msg.sender, false);
    }

    /**
     * @notice Host cancels an active booking before slot start, refunding booker in full.
     * @param id The resource ID.
     * @param start The slot start timestamp.
     */
    function hostCancel(uint256 id, uint64 start) external {
        Resource storage r = _resources[id];
        if (r.host == address(0)) revert NoSuchResource();
        if (msg.sender != r.host) revert NotHost();

        Booking storage b = _bookings[id][start];
        if (b.status != Status.Booked) revert NotBooked();
        if (block.timestamp >= start) revert AlreadyStarted();

        address booker = b.booker;
        b.status = Status.Cancelled;
        pending[booker] += r.price;

        emit Cancelled(id, start, booker, true);
    }

    /**
     * @notice Collects payment for the host once a booked slot has started.
     * @param id The resource ID.
     * @param start The slot start timestamp.
     */
    function collect(uint256 id, uint64 start) external {
        Resource storage r = _resources[id];
        if (r.host == address(0)) revert NoSuchResource();

        Booking storage b = _bookings[id][start];
        if (b.status != Status.Booked) revert NotBooked();
        if (block.timestamp < start) revert NotStarted();

        b.status = Status.Collected;
        pending[r.host] += r.price;

        emit Collected(id, start, r.price);
    }

    /**
     * @notice Pull payment withdrawal for accumulated refunds and collected host earnings.
     */
    function withdraw() external nonReentrant {
        uint256 amount = pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pending[msg.sender] = 0;

        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    // --- Views ---

    function resourceOf(uint256 id) external view returns (Resource memory) {
        if (id == 0 || id > resourceCount) revert NoSuchResource();
        return _resources[id];
    }

    function bookingOf(uint256 id, uint64 start) external view returns (Booking memory) {
        return _bookings[id][start];
    }

    function slots(
        uint256 id,
        uint64 fromStart,
        uint256 count
    ) external view returns (Booking[] memory) {
        Resource storage r = _resources[id];
        if (r.host == address(0)) revert NoSuchResource();
        if (count > MAX_SLOTS_WINDOW) revert WindowTooLarge();
        if (fromStart % r.slotSecs != 0) revert MisalignedSlot();

        Booking[] memory result = new Booking[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = _bookings[id][fromStart + uint64(i * r.slotSecs)];
        }
        return result;
    }

    function latest(
        uint256 offset,
        uint256 count
    )
        external
        view
        returns (
            Resource[] memory resources,
            uint256[] memory ids,
            uint256 total
        )
    {
        total = resourceCount;
        if (count > MAX_LATEST) count = MAX_LATEST;
        if (offset >= total) {
            return (new Resource[](0), new uint256[](0), total);
        }

        uint256 available = total - offset;
        uint256 n = count < available ? count : available;

        resources = new Resource[](n);
        ids = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            uint256 rid = total - offset - i;
            ids[i] = rid;
            resources[i] = _resources[rid];
        }

        return (resources, ids, total);
    }

    function byHost(address addr) external view returns (uint256[] memory) {
        return _hostResources[addr];
    }
}
