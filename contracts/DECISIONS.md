# Reserve Contract Design Decisions

## 1. Architectural Decisions

### 1.1 Resource Creation & Fixed Slots
- A host opens a resource via `open(name, price, slotSecs, cutoffSecs)` with a human-readable title (up to 40 bytes) and a price per slot (`price > 0`).
- `slotSecs` is constrained between 15 minutes (`900`s) and 24 hours (`86400`s) inclusive, and must divide 86400 cleanly (`86400 % slotSecs == 0`). This guarantees that every day is tiled by an integer number of discrete, non-overlapping slots.
- `cutoffSecs` specifies the cancellation window prior to slot start (between 0 and 7 days).
- Once opened, a resource's price, slot duration, and cancellation cutoff are immutable.

### 1.2 1:1 Booking & Discrete Time Alignment
- Bookers pick an aligned future start timestamp (`start % slotSecs == 0`).
- The slot start must be strictly in the future (`start > block.timestamp`) and within the 60-day advance booking horizon (`start <= block.timestamp + 60 days`).
- Each slot supports at most one active booking (`Status.Booked` or `Status.Collected` prevents rebooking with `Taken()`).
- The host is strictly forbidden from booking their own resource (`HostCannotBook`) to prevent self-dealing and deposit circularity.

### 1.3 Cancellation & Cutoff Mechanics
- **Booker Cancellation**: A booker can cancel an active booking before the cutoff deadline (`block.timestamp + cutoffSecs <= start`). If called after the cutoff, it reverts with `PastCutoff(latest)` where `latest = start - cutoffSecs`.
- When cancelled before the cutoff, 100% of the deposit is credited to `pending[booker]`, and the slot status reverts to `Status.Cancelled`. Once cancelled, the slot is immediately open for another booker.
- **Host Cancellation**: The host can cancel an active booking at any time before the slot starts (`block.timestamp < start`), even if inside the booker's cutoff window. The booker receives a 100% refund into `pending[booker]`, and the slot status becomes `Status.Cancelled`.
- **Host Settlement (Collection)**: Once the slot start timestamp has arrived (`block.timestamp >= start`), the host (or any caller on the host's behalf) can call `collect(id, start)`. The booking status transitions to `Status.Collected`, and the deposit is credited to `pending[host]`.

### 1.4 Pull Payments & Non-Reentrancy
- All refunds (booker cancellations and host cancellations) and earned revenues (host collections) are credited to `pending`.
- Beneficiaries withdraw their funds via `withdraw()`, implementing the checks-effects-interactions (zero-then-transfer) pattern with an explicit `nonReentrant` modifier.

### 1.5 Pagination & Window Limits
- `MAX_SLOTS_WINDOW = 96`: Caps `slots(id, fromStart, count)` to 96 slots (e.g. 24 hours of 15-minute slots).
- `MAX_LATEST = 50`: Caps `latest(offset, count)` to at most 50 resources per call.

---

## 2. Invariants

1. **Balance Conservation:**
   `address(reserve).balance == sum(pending) + sum(price of all active Booked slots)`.
   The native Ether held in the contract exactly matches all unwithdrawn pending balances plus all deposits currently locked in active bookings.

2. **Pending Solvency:**
   `address(reserve).balance >= sum(pending)`.
   The contract is solvent at every block to honor all withdrawal claims simultaneously.

3. **Settlement Monotonicity & Start Timing:**
   Any slot with status `Status.Collected` must have had `block.timestamp >= start`. No host funds can be collected prior to slot start.

4. **Single Active Booking Per Slot:**
   At any time, a given `(resourceId, start)` slot has at most one active booking in `Status.Booked`.

---

## 3. Mutation Testing Analysis

Evaluated using `python3 scripts/mutation-check.py reserve --max 25`:
- **Mutants Tested:** 25
- **Mutants Killed:** 24 (96% raw kill rate)
- **Surviving Mutants:** 1

### Surviving Mutant Analysis:
1. `Reserve.sol:293` — `uint256 n = count < available ? count : available; => count <= available ? count : available;`
   - When `count == available`, both the true and false branches evaluate to `count`. The mutation is mathematically and semantically identical in all execution paths.

Effective functional mutation kill rate: **100%**.
