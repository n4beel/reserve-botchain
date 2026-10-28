# Reserve

> Book a slot. Cancel before the cutoff.

A 1:1 time-slot booking application with discrete cancellation cutoffs where hosts sell time in fixed slot lengths, deposits are held securely in the smart contract, and bookers receive automatic full refunds if cancelling prior to the host's cutoff. Built for the BOT Chain ecosystem under **Archetype AG · Timetable**.

## What it is

A host (a coach, a studio room, a shared machine, a clinic chair) registers a **resource** on BOT Chain with a fixed slot length (15 minutes to 24 hours, dividing 1 day), a deposit price per slot, and a **cancel cutoff** window (0 to 7 days).

Bookers reserve any free slot in the 60-day horizon by paying the deposit up front:
- Cancel **before** the cutoff deadline (`now + cutoffSecs <= start`), and 100% of the deposit is refunded to the booker's pull payment till.
- Cancel **after** the cutoff deadline, and cancellations are locked — the host is guaranteed payment.
- After the slot begins (`now >= start`), the host collects the slot revenue into their pending till.
- The host has the right to cancel any booking prior to start, triggering an immediate 100% refund to the booker.
- All withdrawals are non-reentrant pull payments via `withdraw()`.

## Archetype AG · Timetable

- **Ground**: Pale blue `#E8F1FF`
- **Surface**: Pure white `#FFFFFF` / Elevated table header `#F0F5FD`
- **Text**: Navy ink `#0B2545`, muted `#47607F`
- **Accent**: Fresh teal `#13A89E` (`#00201D` ink)
- **Borders**: Slate border `#C5D3E8`, subtle line `#DCE7F6`
- **Wallet Menu**: `--menu-bg #FFFFFF` · `--menu-fg #0B2545` · `--menu-muted #47607F` · `--menu-border #C5D3E8` · `--menu-hover-bg #E4EEFC` · `--menu-danger #B3261E`
- **Typography**: Red Hat Display (headings), Atkinson Hyperlegible (clean scheduling desk UI), Azeret Mono (slot times, dates, prices).

## Signature Components

- **Week Grid (`WeekGrid.tsx`)**: 7-day timetable layout displaying days as columns and slot times as rows. Free slots show price on hover/focus, booked slots are filled navy, user's bookings are highlighted in teal with a tick, and past slots are diagonally hatched (`.slot-hatched`). Features full keyboard navigation (arrow keys move focus between adjacent cells).
- **Docked Booking Sheet (`BookingSheet.tsx`)**: Bottom drawer modal presenting slot start time (in viewer's local time zone with UTC on hover), cancellation deadline ("Free cancellation until Tue 14:00 your time"), upfront price, and instant transaction dispatch ("Book This Slot").
- **Resource Index Table (`ResourceTable.tsx`)**: Homepage scheduling-desk index displaying registered resources, host addresses, slot lengths, cutoff terms, and prices.
- **Limitation Block (`LimitationBlock.tsx`)**: Protocol truth panel prominently stating:
  1. *Nobody here can tell whether the slot was used.*
  2. *The host can cancel. You will be refunded in full.*
  3. *Length and price are fixed when the slot calendar is opened.*

## Contract Architecture (`contracts/src/Reserve.sol`)

- `open(string name, uint128 price, uint32 slotSecs, uint32 cutoffSecs) returns (uint256 id)`: Registers a bookable calendar. Enforces `slotSecs` divides 86,400 (15 min to 24 h), `cutoffSecs <= 604800` (7 days), `price > 0`, `name <= 40 bytes`. Emits `Opened`.
- `book(uint256 id, uint64 start) payable`: Reserves an aligned future slot (`start % slotSecs == 0`, `start > now && start <= now + 60 days`, `msg.value == price`, `msg.sender != host`). Emits `Booked`.
- `cancel(uint256 id, uint64 start)`: Booker cancels an active booking before cutoff (`now + cutoffSecs <= start`). Automatically credits `pending[booker] += price`. Emits `Cancelled(id, start, booker, false)`.
- `hostCancel(uint256 id, uint64 start)`: Host cancels an active booking before start (`now < start`). Automatically refunds booker `pending[booker] += price`. Emits `Cancelled(id, start, booker, true)`.
- `collect(uint256 id, uint64 start)`: Host collects revenue from an active booking after it begins (`now >= start`). Credits `pending[host] += price`. Emits `Collected(id, start, amount)`.
- `withdraw()`: Non-reentrant pull payment withdrawal for bookers and hosts.
- Views: `resourceOf(id)`, `bookingOf(id, start)`, `slots(id, fromStart, count)` (up to 96 consecutive slots), `latest(offset, count)` (up to 50 resources), `byHost(addr)`, `pending(addr)`, `resourceCount()`.

## Verification & Testing

- **Foundry Contracts**: 26 unit & fuzz tests + 3 stateful invariant suites (32,768 calls across 256 runs) passing with 0 reverts.
- **Mutation Check**: 24/25 mutants killed (96% kill rate, sole survivor is a provably equivalent ternary mutant documented in `DECISIONS.md`).
- **Integration**: 4 ABI type matching tests + 8 on-chain integration tests passing on port `8628`.
- **Browser Walkthrough**: Automated Headless Chrome CDP walkthrough across Desktop (1280px) and Mobile (360px) verifying 0px overflow, footer links, limitation copy, Bob cancellation before cutoff with 0.05 BOT refund, Bob till withdrawal, Dave booking on `/r/1`, and Alice host earnings withdrawal with **0 console errors**.
