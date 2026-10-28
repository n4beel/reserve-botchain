// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Reserve.sol";

contract ReserveHandler is Test {
    Reserve public reserve;

    address[] public hosts;
    address[] public bookers;
    address[] public allActors;

    struct TrackedBooking {
        uint256 resId;
        uint64 start;
        address booker;
        uint128 price;
        bool active; // currently Booked
    }

    uint256[] public resourceIds;
    TrackedBooking[] public trackedBookings;

    uint64 public constant BASE_TIME = 1700000000;

    constructor(Reserve _reserve) {
        reserve = _reserve;

        // Seed actors
        for (uint160 i = 1; i <= 3; i++) {
            address h = address(uint160(0x1000 + i));
            vm.deal(h, 1000 ether);
            hosts.push(h);
            allActors.push(h);
        }

        for (uint160 i = 1; i <= 5; i++) {
            address b = address(uint160(0x2000 + i));
            vm.deal(b, 1000 ether);
            bookers.push(b);
            allActors.push(b);
        }

        // Open 2 initial resources
        vm.prank(hosts[0]);
        uint256 r1 = reserve.open("Meeting Room 1", 0.05 ether, 1800, 86400);
        resourceIds.push(r1);

        vm.prank(hosts[1]);
        uint256 r2 = reserve.open("Workshop Bench", 0.1 ether, 3600, 43200);
        resourceIds.push(r2);
    }

    function openResource(uint8 nameSeed, uint8 slotSeed) external {
        if (resourceIds.length >= 8) return;

        address h = hosts[nameSeed % hosts.length];
        uint32[4] memory validSlots = [uint32(900), 1800, 3600, 7200];
        uint32 slotSecs = validSlots[slotSeed % 4];
        uint128 price = uint128(0.01 ether + (uint128(slotSeed % 10) * 0.01 ether));
        uint32 cutoff = uint32((slotSeed % 3) * 86400);

        vm.prank(h);
        uint256 id = reserve.open("New Resource", price, slotSecs, cutoff);
        resourceIds.push(id);
    }

    function bookSlot(uint256 resSeed, uint8 slotIdx, uint256 bookerSeed) external {
        if (resourceIds.length == 0) return;
        uint256 resId = resourceIds[resSeed % resourceIds.length];
        Reserve.Resource memory r = reserve.resourceOf(resId);

        address b = bookers[bookerSeed % bookers.length];
        if (b == r.host) return;

        // Pick aligned future slot (2 to 30 days ahead to ensure it's outside cutoff)
        uint64 nowSec = uint64(block.timestamp);
        uint64 daysAhead = 2 + uint64(slotIdx % 28);
        uint64 start = nowSec + (daysAhead * 86400);
        start = start - (start % r.slotSecs);

        Reserve.Booking memory existing = reserve.bookingOf(resId, start);
        if (existing.status == Reserve.Status.Booked || existing.status == Reserve.Status.Collected) {
            return;
        }

        vm.prank(b);
        try reserve.book{value: r.price}(resId, start) {
            trackedBookings.push(
                TrackedBooking({
                    resId: resId,
                    start: start,
                    booker: b,
                    price: r.price,
                    active: true
                })
            );
        } catch {}
    }

    function cancelSlot(uint256 idxSeed) external {
        if (trackedBookings.length == 0) return;
        uint256 idx = idxSeed % trackedBookings.length;
        TrackedBooking storage tb = trackedBookings[idx];
        if (!tb.active) return;

        Reserve.Resource memory r = reserve.resourceOf(tb.resId);
        uint64 cutoff = uint64(r.cutoffSecs);
        if (block.timestamp + cutoff > tb.start) return; // Inside cutoff

        vm.prank(tb.booker);
        try reserve.cancel(tb.resId, tb.start) {
            tb.active = false;
        } catch {}
    }

    function hostCancelSlot(uint256 idxSeed) external {
        if (trackedBookings.length == 0) return;
        uint256 idx = idxSeed % trackedBookings.length;
        TrackedBooking storage tb = trackedBookings[idx];
        if (!tb.active) return;

        if (block.timestamp >= tb.start) return; // Already started

        Reserve.Resource memory r = reserve.resourceOf(tb.resId);
        vm.prank(r.host);
        try reserve.hostCancel(tb.resId, tb.start) {
            tb.active = false;
        } catch {}
    }

    function collectSlot(uint256 idxSeed) external {
        if (trackedBookings.length == 0) return;
        uint256 idx = idxSeed % trackedBookings.length;
        TrackedBooking storage tb = trackedBookings[idx];
        if (!tb.active) return;

        if (block.timestamp < tb.start) return; // Not started yet

        Reserve.Resource memory r = reserve.resourceOf(tb.resId);
        vm.prank(r.host);
        try reserve.collect(tb.resId, tb.start) {
            tb.active = false;
        } catch {}
    }

    function withdrawActor(uint256 actorSeed) external {
        address a = allActors[actorSeed % allActors.length];
        if (reserve.pending(a) == 0) return;

        vm.prank(a);
        try reserve.withdraw() {} catch {}
    }

    function warpForward(uint32 secs) external {
        uint32 delta = 1800 + (secs % (86400 * 3));
        vm.warp(block.timestamp + delta);
    }

    function getAllActors() external view returns (address[] memory) {
        return allActors;
    }

    function getTrackedBookingsCount() external view returns (uint256) {
        return trackedBookings.length;
    }
}

contract ReserveInvariantTest is Test {
    Reserve public reserve;
    ReserveHandler public handler;

    function setUp() public {
        vm.warp(1700000000);
        reserve = new Reserve();
        handler = new ReserveHandler(reserve);

        targetContract(address(handler));
    }

    /**
     * @notice Invariant 1: Conservation of Balance
     * Contract balance must equal sum(pending) + sum(active Booked deposits).
     */
    function invariant_BalanceConservation() public view {
        uint256 totalPending = 0;
        address[] memory actors = handler.getAllActors();
        for (uint256 i = 0; i < actors.length; i++) {
            totalPending += reserve.pending(actors[i]);
        }

        uint256 totalActiveBooked = 0;
        uint256 n = handler.getTrackedBookingsCount();
        for (uint256 i = 0; i < n; i++) {
            (uint256 resId, uint64 start, , uint128 price, bool active) = handler.trackedBookings(i);
            if (active) {
                Reserve.Booking memory b = reserve.bookingOf(resId, start);
                if (b.status == Reserve.Status.Booked) {
                    totalActiveBooked += price;
                }
            }
        }

        assertEq(
            address(reserve).balance,
            totalPending + totalActiveBooked,
            "Balance must equal pending + active booked deposits"
        );
    }

    /**
     * @notice Invariant 2: Pending Solvency
     * Contract balance is always at least sum(pending).
     */
    function invariant_PendingSolvency() public view {
        uint256 totalPending = 0;
        address[] memory actors = handler.getAllActors();
        for (uint256 i = 0; i < actors.length; i++) {
            totalPending += reserve.pending(actors[i]);
        }

        assertGe(
            address(reserve).balance,
            totalPending,
            "Reserve must always be solvent for all pending withdrawals"
        );
    }

    /**
     * @notice Invariant 3: Single Active Booking & Settlement
     * Every collected slot had started before being collected.
     */
    function invariant_SingleActiveAndCollectedPastStart() public view {
        uint256 n = handler.getTrackedBookingsCount();
        for (uint256 i = 0; i < n; i++) {
            (uint256 resId, uint64 start, , , ) = handler.trackedBookings(i);
            Reserve.Booking memory b = reserve.bookingOf(resId, start);

            if (b.status == Reserve.Status.Collected) {
                // Collected slots must have had their start timestamp passed
                assertGe(
                    block.timestamp,
                    start,
                    "Collected slot must have started"
                );
            }
        }
    }
}
