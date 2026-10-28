/**
 * Typed ABI for the Reserve contract.
 * Hand-written and `as const` for strict Viem/Wagmi type inference.
 */
export const reserveAbi = [
  // --- Core Functions ---
  {
    type: "function",
    name: "open",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "price", type: "uint128" },
      { name: "slotSecs", type: "uint32" },
      { name: "cutoffSecs", type: "uint32" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "book",
    stateMutability: "payable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "start", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "start", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "hostCancel",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "start", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "collect",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "start", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },

  // --- Views ---
  {
    type: "function",
    name: "resourceCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pending",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "resourceOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "host", type: "address" },
          { name: "price", type: "uint128" },
          { name: "slotSecs", type: "uint32" },
          { name: "cutoffSecs", type: "uint32" },
          { name: "name", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "bookingOf",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "start", type: "uint64" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "booker", type: "address" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "slots",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "fromStart", type: "uint64" },
      { name: "count", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "booker", type: "address" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "latest",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
    outputs: [
      {
        name: "resources",
        type: "tuple[]",
        components: [
          { name: "host", type: "address" },
          { name: "price", type: "uint128" },
          { name: "slotSecs", type: "uint32" },
          { name: "cutoffSecs", type: "uint32" },
          { name: "name", type: "string" },
        ],
      },
      { name: "ids", type: "uint256[]" },
      { name: "total", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "byHost",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "MIN_SLOT_SECS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
  },
  {
    type: "function",
    name: "MAX_SLOT_SECS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
  },
  {
    type: "function",
    name: "MAX_CUTOFF_SECS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
  },
  {
    type: "function",
    name: "HORIZON_SECS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "MAX_NAME",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_SLOTS_WINDOW",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_LATEST",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },

  // --- Events ---
  {
    type: "event",
    name: "Opened",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "host", type: "address", indexed: true },
      { name: "price", type: "uint128", indexed: false },
      { name: "slotSecs", type: "uint32", indexed: false },
      { name: "cutoffSecs", type: "uint32", indexed: false },
      { name: "name", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Booked",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "start", type: "uint64", indexed: true },
      { name: "booker", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Cancelled",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "start", type: "uint64", indexed: true },
      { name: "booker", type: "address", indexed: true },
      { name: "byHost", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Collected",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "start", type: "uint64", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },

  // --- Errors ---
  { type: "error", name: "ZeroPrice", inputs: [] },
  { type: "error", name: "BadSlotLength", inputs: [] },
  { type: "error", name: "BadCutoff", inputs: [] },
  { type: "error", name: "NameTooLong", inputs: [] },
  { type: "error", name: "NoSuchResource", inputs: [] },
  { type: "error", name: "MisalignedSlot", inputs: [] },
  { type: "error", name: "SlotOutOfRange", inputs: [] },
  { type: "error", name: "Taken", inputs: [] },
  {
    type: "error",
    name: "WrongPayment",
    inputs: [{ name: "required", type: "uint256" }],
  },
  { type: "error", name: "HostCannotBook", inputs: [] },
  { type: "error", name: "NotBooker", inputs: [] },
  { type: "error", name: "NotHost", inputs: [] },
  { type: "error", name: "NotBooked", inputs: [] },
  {
    type: "error",
    name: "PastCutoff",
    inputs: [{ name: "latest", type: "uint64" }],
  },
  { type: "error", name: "AlreadyStarted", inputs: [] },
  { type: "error", name: "NotStarted", inputs: [] },
  { type: "error", name: "NothingToWithdraw", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
  { type: "error", name: "WindowTooLarge", inputs: [] },
  { type: "error", name: "ReentrancyGuardReentrantCall", inputs: [] },
] as const;

export const contractAbi = reserveAbi;
