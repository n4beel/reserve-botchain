// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Reserve.sol";

contract Attacker {
    Reserve public reserve;
    bool public attacked;
    bool public reentrancyRevertedWithGuard;

    constructor(Reserve _reserve) {
        reserve = _reserve;
    }

    function bookSlot(uint256 id, uint64 start) external payable {
        reserve.book{value: msg.value}(id, start);
    }

    function cancelSlot(uint256 id, uint64 start) external {
        reserve.cancel(id, start);
    }

    function withdraw() external {
        reserve.withdraw();
    }

    receive() external payable {
        if (!attacked) {
            attacked = true;
            // Attempt reentrant call to withdraw, catching the revert
            (bool ok, bytes memory data) = address(reserve).call(abi.encodeWithSignature("withdraw()"));
            if (!ok && data.length >= 4) {
                bytes4 sel;
                assembly {
                    sel := mload(add(data, 32))
                }
                if (sel == Reserve.ReentrancyGuardReentrantCall.selector) {
                    reentrancyRevertedWithGuard = true;
                }
            }
        }
    }
}

contract ReentrantAttackerOnBook {
    Reserve public reserve;
    uint256 public resId;
    uint64 public slotStart;

    constructor(Reserve _reserve) {
        reserve = _reserve;
    }

    function setSlot(uint256 _id, uint64 _start) external {
        resId = _id;
        slotStart = _start;
    }

    receive() external payable {
        // Attempt to book during receive
        reserve.book{value: msg.value}(resId, slotStart);
    }
}

contract ReserveTest is Test {
    Reserve public reserve;

    address public host = address(0x1111);
    address public alice = address(0x2222);
    address public bob = address(0x3333);
    address public charlie = address(0x4444);

    uint128 public constant PRICE = 0.05 ether;
    uint32 public constant SLOT_30M = 1800; // 30 minutes (divides 86400)
    uint32 public constant CUTOFF_24H = 86400; // 24 hours

    uint256 public res1;
    uint64 public baseStart;

    function setUp() public {
        reserve = new Reserve();

        vm.deal(host, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);

        // Advance to a clean day aligned boundary
        vm.warp(1700000000);
        uint64 nowSec = uint64(block.timestamp);
        baseStart = nowSec + (SLOT_30M - (nowSec % SLOT_30M)) + (86400 * 2);

        vm.prank(host);
        res1 = reserve.open("Studio Room A", PRICE, SLOT_30M, CUTOFF_24H);
    }

    function test_OpenResourceValid() public {
        vm.prank(host);
        uint256 id = reserve.open("Coaching Desk", 0.1 ether, 3600, 3600 * 12);
        assertEq(id, 2);

        Reserve.Resource memory r = reserve.resourceOf(id);
        assertEq(r.host, host);
        assertEq(r.price, 0.1 ether);
        assertEq(r.slotSecs, 3600);
        assertEq(r.cutoffSecs, 3600 * 12);
        assertEq(r.name, "Coaching Desk");

        uint256[] memory hostRes = reserve.byHost(host);
        assertEq(hostRes.length, 2);
        assertEq(hostRes[0], res1);
        assertEq(hostRes[1], id);
    }

    function test_OpenResourceRevertsZeroPrice() public {
        vm.expectRevert(Reserve.ZeroPrice.selector);
        reserve.open("Zero Price Room", 0, SLOT_30M, CUTOFF_24H);
    }

    function test_OpenResourceRevertsBadName() public {
        vm.expectRevert(Reserve.NameTooLong.selector);
        reserve.open("", PRICE, SLOT_30M, CUTOFF_24H);

        string memory tooLong = "12345678901234567890123456789012345678901"; // 41 bytes
        vm.expectRevert(Reserve.NameTooLong.selector);
        reserve.open(tooLong, PRICE, SLOT_30M, CUTOFF_24H);
    }

    function test_OpenResourceRevertsBadSlotLength() public {
        // Less than 15 mins (899)
        vm.expectRevert(Reserve.BadSlotLength.selector);
        reserve.open("Too Short", PRICE, 899, CUTOFF_24H);

        // Greater than 24 hours (86401)
        vm.expectRevert(Reserve.BadSlotLength.selector);
        reserve.open("Too Long", PRICE, 86401, CUTOFF_24H);

        // Does not divide 86400 (e.g. 1000 secs: 86400 % 1000 = 400 != 0)
        vm.expectRevert(Reserve.BadSlotLength.selector);
        reserve.open("Indivisible", PRICE, 1000, CUTOFF_24H);
    }

    function test_OpenResourceRevertsBadCutoff() public {
        // Greater than 7 days (604801)
        vm.expectRevert(Reserve.BadCutoff.selector);
        reserve.open("Cutoff Too Long", PRICE, SLOT_30M, 604801);
    }

    function test_BookAlignedSlot() public {
        vm.prank(alice);
        reserve.book{value: PRICE}(res1, baseStart);

        Reserve.Booking memory b = reserve.bookingOf(res1, baseStart);
        assertEq(b.booker, alice);
        assertTrue(b.status == Reserve.Status.Booked);
        assertEq(address(reserve).balance, PRICE);
    }

    function test_MisalignedReverts() public {
        uint64 misaligned = baseStart + 1; // not a multiple of 1800
        vm.prank(alice);
        vm.expectRevert(Reserve.MisalignedSlot.selector);
        reserve.book{value: PRICE}(res1, misaligned);
    }

    function test_PastOrTooFarReverts() public {
        // Past slot
        uint64 pastSlot = uint64(block.timestamp) - SLOT_30M;
        pastSlot = pastSlot - (pastSlot % SLOT_30M);
        vm.prank(alice);
        vm.expectRevert(Reserve.SlotOutOfRange.selector);
        reserve.book{value: PRICE}(res1, pastSlot);

        // Past 60 days
        uint64 farSlot = uint64(block.timestamp) + 5184000 + SLOT_30M;
        farSlot = farSlot - (farSlot % SLOT_30M);
        vm.prank(alice);
        vm.expectRevert(Reserve.SlotOutOfRange.selector);
        reserve.book{value: PRICE}(res1, farSlot);
    }

    function test_DoubleBookReverts_ThenRebookAfterCancel() public {
        vm.prank(alice);
        reserve.book{value: PRICE}(res1, baseStart);

        // Bob tries to double book the same slot
        vm.prank(bob);
        vm.expectRevert(Reserve.Taken.selector);
        reserve.book{value: PRICE}(res1, baseStart);

        // Alice cancels before cutoff
        vm.prank(alice);
        reserve.cancel(res1, baseStart);

        Reserve.Booking memory b = reserve.bookingOf(res1, baseStart);
        assertTrue(b.status == Reserve.Status.Cancelled);

        // Now Bob rebooks the slot successfully
        vm.prank(bob);
        reserve.book{value: PRICE}(res1, baseStart);

        Reserve.Booking memory b2 = reserve.bookingOf(res1, baseStart);
        assertEq(b2.booker, bob);
        assertTrue(b2.status == Reserve.Status.Booked);
    }

    function test_CancelBeforeCutoffRefunds() public {
        vm.prank(alice);
        reserve.book{value: PRICE}(res1, baseStart);

        assertEq(reserve.pending(alice), 0);

        vm.prank(alice);
        reserve.cancel(res1, baseStart);

        assertEq(reserve.pending(alice), PRICE);

        // Alice withdraws
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        reserve.withdraw();
        assertEq(alice.balance, balBefore + PRICE);
        assertEq(reserve.pending(alice), 0);
    }

    function test_CancelAfterCutoffReverts_ArgsLatest() public {
        vm.prank(alice);
        reserve.book{value: PRICE}(res1, baseStart);

        // Cutoff is 24 hours (86400) before baseStart
        uint64 latestAllowed = baseStart - CUTOFF_24H;

        // Warp past the cutoff deadline (e.g., baseStart - 12 hours)
        vm.warp(baseStart - 43200);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Reserve.PastCutoff.selector, latestAllowed));
        reserve.cancel(res1, baseStart);
    }

    function test_HostCancelRefundsAnytimeBeforeStart() public {
        vm.prank(alice);
        reserve.book{value: PRICE}(res1, baseStart);

        // Warp past booker's cutoff (e.g. 2 hours before start)
        vm.warp(baseStart - 7200);

        // Booker cannot cancel
        vm.prank(alice);
        vm.expectRevert();
        reserve.cancel(res1, baseStart);

        // But host CAN cancel anytime before start
        vm.prank(host);
        reserve.hostCancel(res1, baseStart);

        assertEq(reserve.pending(alice), PRICE);

        Reserve.Booking memory b = reserve.bookingOf(res1, baseStart);
        assertTrue(b.status == Reserve.Status.Cancelled);
    }

    function test_HostCancelRevertsAfterStart() public {
        vm.prank(alice);
        reserve.book{value: PRICE}(res1, baseStart);

        // Warp to slot start
        vm.warp(baseStart);

        vm.prank(host);
        vm.expectRevert(Reserve.AlreadyStarted.selector);
        reserve.hostCancel(res1, baseStart);
    }

    function test_CollectAfterStartOnly() public {
        vm.prank(alice);
        reserve.book{value: PRICE}(res1, baseStart);

        // Try collecting before start
        vm.prank(host);
        vm.expectRevert(Reserve.NotStarted.selector);
        reserve.collect(res1, baseStart);

        // Warp to start
        vm.warp(baseStart);

        // Anyone can trigger collect, payment goes to host
        vm.prank(charlie);
        reserve.collect(res1, baseStart);

        assertEq(reserve.pending(host), PRICE);
        Reserve.Booking memory b = reserve.bookingOf(res1, baseStart);
        assertTrue(b.status == Reserve.Status.Collected);

        // Double collect reverts
        vm.prank(host);
        vm.expectRevert(Reserve.NotBooked.selector);
        reserve.collect(res1, baseStart);

        // Host withdraws
        uint256 hostBalBefore = host.balance;
        vm.prank(host);
        reserve.withdraw();
        assertEq(host.balance, hostBalBefore + PRICE);
    }

    function test_HostCannotBook() public {
        vm.prank(host);
        vm.expectRevert(Reserve.HostCannotBook.selector);
        reserve.book{value: PRICE}(res1, baseStart);
    }

    function test_WrongPaymentReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Reserve.WrongPayment.selector, PRICE));
        reserve.book{value: PRICE - 1}(res1, baseStart);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Reserve.WrongPayment.selector, PRICE));
        reserve.book{value: PRICE + 1}(res1, baseStart);
    }

    function test_SlotsViewWindow() public {
        vm.prank(alice);
        reserve.book{value: PRICE}(res1, baseStart);

        uint64 secondSlot = baseStart + SLOT_30M;
        vm.prank(bob);
        reserve.book{value: PRICE}(res1, secondSlot);

        Reserve.Booking[] memory win = reserve.slots(res1, baseStart, 4);
        assertEq(win.length, 4);
        assertEq(win[0].booker, alice);
        assertTrue(win[0].status == Reserve.Status.Booked);
        assertEq(win[1].booker, bob);
        assertTrue(win[1].status == Reserve.Status.Booked);
        assertEq(win[2].booker, address(0));
        assertTrue(win[2].status == Reserve.Status.None);
        assertEq(win[3].booker, address(0));
        assertTrue(win[3].status == Reserve.Status.None);
    }

    function test_LatestView() public {
        (Reserve.Resource[] memory resList, uint256[] memory ids, uint256 total) = reserve.latest(0, 10);
        assertEq(total, 1);
        assertEq(resList.length, 1);
        assertEq(ids.length, 1);
        assertEq(ids[0], 1);
        assertEq(resList[0].name, "Studio Room A");

        // Open 2 more
        vm.prank(host);
        reserve.open("Room B", 0.02 ether, 3600, 0);
        vm.prank(host);
        reserve.open("Room C", 0.03 ether, 3600, 0);

        (resList, ids, total) = reserve.latest(0, 2);
        assertEq(total, 3);
        assertEq(resList.length, 2);
        assertEq(ids[0], 3);
        assertEq(ids[1], 2);

        // Offset 1
        (resList, ids, total) = reserve.latest(1, 2);
        assertEq(resList.length, 2);
        assertEq(ids[0], 2);
        assertEq(ids[1], 1);

        // Offset beyond total
        (resList, ids, total) = reserve.latest(5, 2);
        assertEq(resList.length, 0);
    }

    function test_ReentrantWithdrawBlocked() public {
        Attacker attacker = new Attacker(reserve);
        vm.deal(address(attacker), 10 ether);

        attacker.bookSlot{value: PRICE}(res1, baseStart);
        attacker.cancelSlot(res1, baseStart);

        assertEq(reserve.pending(address(attacker)), PRICE);

        // Attacker attempts reentrant withdraw and verifies inner revert was guarded
        attacker.withdraw();
        assertTrue(attacker.reentrancyRevertedWithGuard());
        assertEq(reserve.pending(address(attacker)), 0);
    }

    function test_WithdrawZeroReverts() public {
        vm.prank(alice);
        vm.expectRevert(Reserve.NothingToWithdraw.selector);
        reserve.withdraw();
    }

    function testFuzz_Conservation(uint8 numBookings) public {
        vm.assume(numBookings >= 1 && numBookings <= 20);

        uint256 totalDeposited = 0;
        uint256 totalPendingExpected = 0;

        for (uint8 i = 0; i < numBookings; i++) {
            uint64 slot = baseStart + uint64(i * SLOT_30M);
            address user = address(uint160(0x5000 + i));
            vm.deal(user, 1 ether);

            vm.prank(user);
            reserve.book{value: PRICE}(res1, slot);
            totalDeposited += PRICE;

            if (i % 3 == 0) {
                // Booker cancel
                vm.prank(user);
                reserve.cancel(res1, slot);
                totalPendingExpected += PRICE;
            } else if (i % 3 == 1) {
                // Host cancel
                vm.prank(host);
                reserve.hostCancel(res1, slot);
                totalPendingExpected += PRICE;
            }
            // else remain booked
        }

        assertEq(address(reserve).balance, totalDeposited);
    }

    function testFuzz_OnlyOneActiveBookingPerSlot(uint8 cancelMethod) public {
        // 0: booker cancel, 1: host cancel
        vm.prank(alice);
        reserve.book{value: PRICE}(res1, baseStart);

        if (cancelMethod % 2 == 0) {
            vm.prank(alice);
            reserve.cancel(res1, baseStart);
        } else {
            vm.prank(host);
            reserve.hostCancel(res1, baseStart);
        }

        // Must be cancelled
        Reserve.Booking memory b = reserve.bookingOf(res1, baseStart);
        assertTrue(b.status == Reserve.Status.Cancelled);

        // Rebookable by bob
        vm.prank(bob);
        reserve.book{value: PRICE}(res1, baseStart);

        Reserve.Booking memory b2 = reserve.bookingOf(res1, baseStart);
        assertEq(b2.booker, bob);
        assertTrue(b2.status == Reserve.Status.Booked);
    }

    function test_OpenResourceWithMinSlotSecs() public {
        vm.prank(host);
        uint256 id = reserve.open("15 Min Slots", PRICE, reserve.MIN_SLOT_SECS(), CUTOFF_24H);
        Reserve.Resource memory r = reserve.resourceOf(id);
        assertEq(r.slotSecs, reserve.MIN_SLOT_SECS());
    }

    function test_SlotsMaxWindowBoundary() public {
        // count == 96 succeeds
        Reserve.Booking[] memory win96 = reserve.slots(res1, baseStart, 96);
        assertEq(win96.length, 96);

        // count == 97 reverts
        vm.expectRevert(Reserve.WindowTooLarge.selector);
        reserve.slots(res1, baseStart, 97);
    }

    function test_StartExactlyNowReverts() public {
        uint64 nowSec = uint64(block.timestamp);
        uint64 alignedNow = nowSec - (nowSec % SLOT_30M);
        vm.warp(alignedNow);

        vm.prank(alice);
        vm.expectRevert(Reserve.SlotOutOfRange.selector);
        reserve.book{value: PRICE}(res1, alignedNow);
    }

    function test_CancelExactlyAtCutoffBoundary() public {
        vm.prank(alice);
        reserve.book{value: PRICE}(res1, baseStart);

        // Warp exactly to cutoff: block.timestamp + cutoff == baseStart
        vm.warp(baseStart - CUTOFF_24H);

        // Should succeed because now + cutoffSecs <= start
        vm.prank(alice);
        reserve.cancel(res1, baseStart);

        Reserve.Booking memory b = reserve.bookingOf(res1, baseStart);
        assertTrue(b.status == Reserve.Status.Cancelled);
        assertEq(reserve.pending(alice), PRICE);
    }
}
