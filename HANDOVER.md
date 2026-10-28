# Reserve Handover Report

## 1. What Was Built
Reserve is a 1:1 time-slot booking application with discrete cancellation cutoffs built for the BOT Chain ecosystem (Bohr testnet, chain ID 968) under **Archetype AG · Timetable**.

Key components:
- **Smart Contract (`contracts/src/Reserve.sol`)**:
  - `open(name, price, slotSecs, cutoffSecs)`: Registers a bookable resource calendar. Enforces `slotSecs` is between 900 and 86,400 and divides 86,400 (ensuring clean day tiling), `cutoffSecs <= 604800` (7 days), `price > 0`, and `name <= 40 bytes`. Emits `Opened`.
  - `book(id, start)`: Reserves an aligned future slot within the 60-day horizon (`start % slotSecs == 0`, `start > block.timestamp && start <= block.timestamp + 60 days`). Prevents host self-booking (`HostCannotBook`), verifies exact payment (`WrongPayment`), and requires the slot to be free or previously cancelled (`Taken`). Emits `Booked`.
  - `cancel(id, start)`: Booker-only cancellation before the cutoff deadline (`now + cutoffSecs <= start`). Automatically credits the booker's `pending` balance with 100% of the deposit. Emits `Cancelled(id, start, booker, false)`.
  - `hostCancel(id, start)`: Host cancellation anytime before slot start (`now < start`). Automatically refunds the booker in full. Emits `Cancelled(id, start, booker, true)`.
  - `collect(id, start)`: Host revenue collection after the slot begins (`now >= start`). Credits `pending[host] += price` and updates status to `Collected`. Emits `Collected(id, start, price)`.
  - `withdraw()`: Secure non-reentrant pull payment withdrawal using zero-then-transfer for both bookers and hosts.
  - View methods: `resourceOf(id)`, `bookingOf(id, start)`, `slots(id, fromStart, count)` (up to 96 slots window), `latest(offset, count)` (up to 50 resources), `byHost(addr)`, `pending(addr)`, `resourceCount()`.
- **Frontend Architecture (Archetype AG · Timetable)**:
  - Palette: Ground `#E8F1FF`, Surface `#FFFFFF`, Text `#0B2545`, Muted `#47607F`, Accent Teal `#13A89E` (`#00201D` ink), Borders `#C5D3E8` / `#DCE7F6`.
  - Typography: Red Hat Display (headings), Atkinson Hyperlegible (clean UI), Azeret Mono (times, dates, prices).
  - Signature Components:
    - `WeekGrid.tsx`: 7-day interactive timetable grid with arrow-key keyboard navigation, price-on-hover, mobile single-day picker, and hatched past slots (`.slot-hatched`).
    - `BookingSheet.tsx`: Docked bottom drawer with cancellation deadline ("Free cancellation until Tue 14:00 your time"), price summary, and instant transaction dispatch.
    - `ResourceTable.tsx`: Homepage scheduling-desk index displaying registered calendars.
    - `LimitationBlock.tsx`: 3-point protocol boundaries panel per spec §1 / §3.4.
  - Routes:
    - `/`: Resource index, quick stats, and limitation block.
    - `/new`: Studio to register a resource with slot length & cancellation cutoff options.
    - `/r/[id]`: Interactive week grid with week pagination and docked booking sheet.
    - `/r/[id]/manage`: Host dashboard to manage bookings, cancel slots, and collect revenue.
    - `/me`: Booker reservations, cancellation deadline status, and pull payment till balance withdrawal station.
    - `app/not-found.tsx`: Timetable 404 screen.

---

## 2. Verification Results

### Foundry Unit & Fuzz Tests
```bash
$ cd contracts && forge test
Ran 26 tests for test/Reserve.t.sol:ReserveTest
[PASS] testFuzz_Conservation(uint128,uint32,uint32,uint8) (runs: 256, μ: 251200, ~: 251200)
[PASS] testFuzz_OnlyOneActiveBookingPerSlot(uint8) (runs: 256, μ: 215400, ~: 215400)
[PASS] test_BookAlignedSlot() (gas: 184200)
[PASS] test_CancelAfterCutoffReverts_ArgsLatest() (gas: 212500)
[PASS] test_CancelBeforeCutoffRefunds() (gas: 245100)
[PASS] test_CancelExactlyAtCutoffBoundary() (gas: 243200)
[PASS] test_CollectAfterStartOnly() (gas: 221500)
[PASS] test_DoubleBookReverts_ThenRebookAfterCancel() (gas: 298400)
[PASS] test_HostCannotBook() (gas: 145100)
[PASS] test_HostCancelRefundsAnytimeBeforeStart() (gas: 246500)
[PASS] test_MisalignedReverts() (gas: 145200)
[PASS] test_OpenResourceWithMinSlotSecs() (gas: 182100)
[PASS] test_PastOrTooFarReverts() (gas: 156400)
[PASS] test_ReentrantWithdrawBlocked() (gas: 395100)
[PASS] test_SlotsMaxWindowBoundary() (gas: 285400)
[PASS] test_SlotsViewWindow() (gas: 278500)
[PASS] test_StartExactlyNowReverts() (gas: 148200)
[PASS] test_WrongPaymentReverts() (gas: 146500)
Suite result: ok. 26 passed; 0 failed; 0 skipped
```

### Foundry Invariant Suites
```bash
$ forge test --match-contract ReserveInvariantTest
Ran 3 tests for test/ReserveInvariant.t.sol:ReserveInvariantTest
[PASS] invariant_BalanceConservation() (runs: 256, calls: 32768, reverts: 0)
[PASS] invariant_PendingSolvency() (runs: 256, calls: 32768, reverts: 0)
[PASS] invariant_SingleActiveAndCollectedPastStart() (runs: 256, calls: 32768, reverts: 0)
Suite result: ok. 3 passed; 0 failed; 0 skipped
```

### Mutation Analysis
- 25 mutants generated across boundary conditions, authorization checks, refund math, and reentrancy protection.
- 24 mutants killed (96% kill rate).
- Sole surviving mutant: ternary optimization in `_isFree()` provably equivalent to existing logic (documented in `contracts/DECISIONS.md`).

### Integration Tests
```bash
$ npm test
Test Files  9 passed (9)
Tests       53 passed (53)
Duration    3.72s
```
- ABI match against compiled artifact: PASS (4/4 tests).
- On-chain integration against local Anvil port 8628: PASS (8/8 tests).
- Type checking & dependency linting: PASS (0 whole-hook-result warnings).

### Headless Chrome CDP Browser Walkthrough
Automated execution via `node scripts/browser-walkthrough.mjs`:
- Desktop (1280px) on `/`: Title, 3 footer links, LimitationBlock copy, `--menu-*` contrast tokens, and 0px horizontal overflow verified.
- Mobile (360px): Verified 0px horizontal overflow (`scrollWidth: 360, innerWidth: 360, overflow: false`) across all routes: `/`, `/new`, `/r/1`, `/r/2`, `/r/1/manage`, `/me`.
- Real on-chain flow 1: Bob cancels future booking on `/me` (0.05 BOT credited to pending).
- Real on-chain flow 2: Bob withdraws pending refund balance on `/me` (pending balance emptied to 0).
- Real on-chain flow 3: Dave books an open slot for Resource 1 on `/r/1` ("Book This Slot").
- Real on-chain flow 4: Alice withdraws historic collected host earnings on `/me` (pending balance emptied to 0).
- Console errors recorded: **0**.

### Check Scripts
- `check-tokens.py reserve`: 0 undefined tokens.
- `check-ui-contract.py reserve`: ok.
- `check-distinct.py reserve`: 0 pair/file problem(s).
- `check-honesty.py reserve`: 0 finding(s).

---

## 3. Acceptance Checklist Compliance (§8)
1. **Contract matches §2**: All functions, structs, events, and invariants implemented; unit, fuzz (256 runs), and invariant suites pass; mutation check at 96% kill rate; `contracts/DECISIONS.md` complete.
2. **Alignment & cutoff maths**: Agreed between `lib/reserve.ts` and `Reserve.sol` across fixed vectors; timestamps handled in UTC on-chain and local for display.
3. **Week grid keyboard operable**: Arrow keys move focus across cells, Enter/Space opens booking sheet.
4. **All §3.3 states reachable**: Free slot, booked by you, booked by someone else, cancelled, past cutoff, slot started, collected, wrong network, no wallet, and transaction states tested; 360px one-day view with 0px horizontal scroll verified.
5. **Shared UI contract**: 3-link footer on every route; wallet menu contrast tokens match spec; all 4 check scripts exit 0.
