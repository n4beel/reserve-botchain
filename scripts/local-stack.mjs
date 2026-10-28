/**
 * Local stack runner and seeder for Reserve (Archetype AG · Timetable).
 *
 * Spawns anvil on port 8728 with chain id 968, deploys Reserve, and seeds state per spec §5:
 * - Resource 1: "Studio Room A" (Host: Alice, 30-min slots, 24h cutoff, 0.05 BOT)
 *   - Slot Past (-2 days): booked by Dave, collected by Alice (Status: Collected)
 *   - Slot Cancelled: booked by Bob, then cancelled by Bob before cutoff (Status: Cancelled)
 *   - Slot Inside Cutoff (+12 hours): booked by Charlie (Status: Booked, cannot cancel)
 *   - Slot Future (+3 days): booked by Bob (Status: Booked, free to cancel)
 * - Resource 2: "Seminar Hall" (Host: Eve, 1-hour slots, 0 cutoff, 0.1 BOT)
 *   - Empty (0 bookings)
 *
 * Usage:
 *   node scripts/local-stack.mjs
 *   npm run dev
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

function alignedStart(ts, slotSecs) {
  const t = BigInt(ts);
  const s = BigInt(slotSecs);
  return s <= 0n ? t : t - (t % s);
}

const PORT = 8728;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Alice (Resource 1 Host)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Bob (Booker A - Future booking)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Charlie (Booker B - Inside cutoff)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3: Dave (Booker C - Past collected)
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // 4: Eve (Resource 2 Host)
];

const accounts = KEYS.map((k) => privateKeyToAccount(k));

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

console.log(`Starting anvil on port ${PORT}...`);
spawn(
  "anvil",
  [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "10",
    "--balance",
    "1000",
    "--silent",
  ],
  { detached: true, stdio: "ignore" }
).unref();

const pub = createPublicClient({ chain: local, transport: http() });

for (let i = 0; i < 40; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const artifact = JSON.parse(
  readFileSync(
    new URL("../contracts/out/Reserve.sol/Reserve.json", import.meta.url),
    "utf8"
  )
);

const wallets = accounts.map((account) =>
  createWalletClient({ account, chain: local, transport: http() })
);

console.log("Deploying Reserve contract...");
const deployHash = await wallets[0].deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
});

const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployHash });
const contractAddress = deployReceipt.contractAddress;
const startBlock = deployReceipt.blockNumber;

console.log(`Deployed Reserve to ${contractAddress} at block ${startBlock}`);

async function advanceTime(seconds) {
  await pub.request({ method: "evm_increaseTime", params: [seconds] });
  await pub.request({ method: "evm_mine", params: [] });
}

console.log("Seeding bookable resources and slots...");

// 1. Open Resource 1: "Studio Room A" (Owner: Alice, 30m slots, 24h cutoff, 0.05 BOT)
console.log("Creating Resource 1: Studio Room A...");
const r1Tx = await wallets[0].writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "open",
  args: ["Studio Room A", parseEther("0.05"), 1800, 86400],
});
await pub.waitForTransactionReceipt({ hash: r1Tx });

// 2. Open Resource 2: "Seminar Hall" (Owner: Eve, 1h slots, 0 cutoff, 0.1 BOT)
console.log("Creating Resource 2: Seminar Hall...");
const r2Tx = await wallets[4].writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "open",
  args: ["Seminar Hall", parseEther("0.1"), 3600, 0],
});
await pub.waitForTransactionReceipt({ hash: r2Tx });

const curBlock = await pub.getBlock();
const t0 = alignedStart(curBlock.timestamp, 1800);

// We need historical slots that end up in the past.
// Slot -2 days:
const slotPast = t0 + 1800n * 4n; // 2 hours ahead in t0's frame
console.log(`Booking historic slot at ${slotPast} by Dave...`);
const bPastTx = await wallets[3].writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "book",
  args: [1n, slotPast],
  value: parseEther("0.05"),
});
await pub.waitForTransactionReceipt({ hash: bPastTx });

// Slot to be cancelled:
const slotCancelled = t0 + 86400n * 3n; // 3 days ahead in t0's frame
console.log(`Booking slot at ${slotCancelled} by Bob to be cancelled...`);
const bCancelTx = await wallets[1].writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "book",
  args: [1n, slotCancelled],
  value: parseEther("0.05"),
});
await pub.waitForTransactionReceipt({ hash: bCancelTx });

// Bob cancels slotCancelled
console.log(`Bob cancels slot at ${slotCancelled}...`);
const cancelTx = await wallets[1].writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "cancel",
  args: [1n, slotCancelled],
});
await pub.waitForTransactionReceipt({ hash: cancelTx });

// Advance time by 2 days (172,800s) so slotPast has passed
await advanceTime(86400 * 2);

// Alice collects slotPast (now past slot start)
console.log(`Alice collects revenue for historic slot at ${slotPast}...`);
const collectTx = await wallets[0].writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "collect",
  args: [1n, slotPast],
});
await pub.waitForTransactionReceipt({ hash: collectTx });

const nowBlock = await pub.getBlock();
const nowSec = alignedStart(nowBlock.timestamp, 1800);

// Slot Inside Cutoff: 12 hours from now (within the 24h cutoff!)
const slotInsideCutoff = nowSec + 43200n;
console.log(`Charlie books slot inside cutoff at ${slotInsideCutoff}...`);
const bCutoffTx = await wallets[2].writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "book",
  args: [1n, slotInsideCutoff],
  value: parseEther("0.05"),
});
await pub.waitForTransactionReceipt({ hash: bCutoffTx });

// Future Slot Outside Cutoff: 3 days from now (free cancellation available)
const slotFuture = nowSec + 86400n * 3n;
console.log(`Bob books future slot outside cutoff at ${slotFuture}...`);
const bFutureTx = await wallets[1].writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "book",
  args: [1n, slotFuture],
  value: parseEther("0.05"),
});
await pub.waitForTransactionReceipt({ hash: bFutureTx });

console.log("\nRoles Table:");
console.log("------------------------------------------------------------------------------------------------");
console.log("| Role                 | Index | Address                                    | Private Key (first 10) |");
console.log("------------------------------------------------------------------------------------------------");
console.log(`| Host 1 (Alice)       | 0     | ${accounts[0].address} | ${KEYS[0].slice(0, 10)}... |`);
console.log(`| Booker A (Bob)       | 1     | ${accounts[1].address} | ${KEYS[1].slice(0, 10)}... |`);
console.log(`| Booker B (Charlie)   | 2     | ${accounts[2].address} | ${KEYS[2].slice(0, 10)}... |`);
console.log(`| Booker C (Dave)      | 3     | ${accounts[3].address} | ${KEYS[3].slice(0, 10)}... |`);
console.log(`| Host 2 (Eve)         | 4     | ${accounts[4].address} | ${KEYS[4].slice(0, 10)}... |`);
console.log("------------------------------------------------------------------------------------------------\n");

console.log("Seeded Status Table (Resource #1: Studio Room A):");
console.log("------------------------------------------------------------------------------------------------");
console.log("| Slot Time Relative   | Booker  | Price     | State      | Cancellation Window / Notes     |");
console.log("------------------------------------------------------------------------------------------------");
console.log(`| Past (-2 days)       | Dave    | 0.05 BOT  | Collected  | Host collected revenue          |`);
console.log(`| Cancelled            | Bob     | 0.05 BOT  | Cancelled  | Bob refunded, slot free         |`);
console.log(`| Inside Cutoff (+12h) | Charlie | 0.05 BOT  | Booked     | Past cutoff (non-refundable)    |`);
console.log(`| Future (+3 days)     | Bob     | 0.05 BOT  | Booked     | Free cancellation active        |`);
console.log("------------------------------------------------------------------------------------------------\n");

// Write .env.local
const envContent = [
  `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet`,
  `NEXT_PUBLIC_BOHR_RPC=${RPC}`,
  `NEXT_PUBLIC_CONTRACT_968=${contractAddress}`,
  `NEXT_PUBLIC_DEPLOY_BLOCK_968=${startBlock}`,
  "",
].join("\n");

writeFileSync(".env.local", envContent);
console.log("Wrote .env.local");
console.log(`\nLocal stack ready on port ${PORT}!`);
