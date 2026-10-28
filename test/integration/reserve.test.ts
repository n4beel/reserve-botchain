import { spawn, execSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { reserveAbi } from "@/lib/botchain/abi";
import { alignedStart, BookingStatus } from "@/lib/reserve";

const PORT = 8628;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const localChain = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const ACCOUNTS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Host (Alice)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Booker A (Bob)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Booker B (Charlie)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3: Booker C (Dave)
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // 4: Outsider (Eve)
].map((k) => privateKeyToAccount(k as `0x${string}`));

describe("Reserve On-Chain Integration Tests", () => {
  let anvil: ChildProcess;
  let contractAddress: Address;

  const publicClient = createPublicClient({
    chain: localChain,
    transport: http(RPC),
  });

  const [host, bookerA, bookerB, bookerC, outsider] = ACCOUNTS.map((account) =>
    createWalletClient({
      account,
      chain: localChain,
      transport: http(RPC),
    })
  );

  async function advanceTime(seconds: number) {
    await publicClient.request({
      method: "anvil_increaseTime" as any,
      params: [seconds] as any,
    });
    await publicClient.request({
      method: "anvil_mine" as any,
      params: [1] as any,
    });
  }

  beforeAll(async () => {
    try {
      execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
    } catch {}

    anvil = spawn("anvil", [
      "--port",
      String(PORT),
      "--chain-id",
      String(CHAIN_ID),
      "--silent",
    ]);

    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        await publicClient.getBlockNumber();
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!ready) throw new Error(`Anvil failed to start on port ${PORT}`);

    // Deploy Reserve contract
    const artifactPath = join(
      process.cwd(),
      "contracts",
      "out",
      "Reserve.sol",
      "Reserve.json"
    );
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

    const hash = await host.deployContract({
      abi: reserveAbi,
      bytecode: artifact.bytecode.object as `0x${string}`,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    contractAddress = receipt.contractAddress!;
  });

  afterAll(() => {
    if (anvil) anvil.kill("SIGKILL");
    try {
      execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
    } catch {}
  });

  it("1. host opens a resource (30-min slots, 24h cutoff, 0.05 BOT)", async () => {
    const hash = await host.writeContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "open",
      args: ["Studio Room A", parseEther("0.05"), 1800, 86400],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const count = await publicClient.readContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "resourceCount",
    });
    expect(count).toBe(1n);

    const r = await publicClient.readContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "resourceOf",
      args: [1n],
    });
    expect(r.name).toBe("Studio Room A");
    expect(r.price).toBe(parseEther("0.05"));
    expect(r.slotSecs).toBe(1800);
    expect(r.cutoffSecs).toBe(86400);
  });

  it("2. booker A books an aligned slot 3 days in advance", async () => {
    const block = await publicClient.getBlock();
    const now = block.timestamp;
    // 3 days ahead, aligned to 1800
    const start = alignedStart(now + 86400n * 3n, 1800);

    const hash = await bookerA.writeContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "book",
      args: [1n, start],
      value: parseEther("0.05"),
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const booking = await publicClient.readContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "bookingOf",
      args: [1n, start],
    });
    expect(booking.booker.toLowerCase()).toBe(bookerA.account.address.toLowerCase());
    expect(booking.status).toBe(BookingStatus.Booked);
  });

  it("3. double booking the same slot reverts with Taken", async () => {
    const block = await publicClient.getBlock();
    const now = block.timestamp;
    const start = alignedStart(now + 86400n * 3n, 1800);

    await expect(
      bookerB.writeContract({
        address: contractAddress,
        abi: reserveAbi,
        functionName: "book",
        args: [1n, start],
        value: parseEther("0.05"),
      })
    ).rejects.toThrow();
  });

  it("4. booker A cancels before cutoff and gets full pull refund in pending", async () => {
    const block = await publicClient.getBlock();
    const now = block.timestamp;
    const start = alignedStart(now + 86400n * 3n, 1800);

    const hash = await bookerA.writeContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "cancel",
      args: [1n, start],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const booking = await publicClient.readContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "bookingOf",
      args: [1n, start],
    });
    expect(booking.status).toBe(BookingStatus.Cancelled);

    const pendingBal = await publicClient.readContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "pending",
      args: [bookerA.account.address],
    });
    expect(pendingBal).toBe(parseEther("0.05"));
  });

  it("5. booker B can rebook the cancelled slot", async () => {
    const block = await publicClient.getBlock();
    const now = block.timestamp;
    const start = alignedStart(now + 86400n * 3n, 1800);

    const hash = await bookerB.writeContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "book",
      args: [1n, start],
      value: parseEther("0.05"),
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const booking = await publicClient.readContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "bookingOf",
      args: [1n, start],
    });
    expect(booking.booker.toLowerCase()).toBe(bookerB.account.address.toLowerCase());
    expect(booking.status).toBe(BookingStatus.Booked);
  });

  it("6. host cancels booking inside cutoff before slot starts, booker B gets refund", async () => {
    const block = await publicClient.getBlock();
    const now = block.timestamp;
    const start = alignedStart(now + 86400n * 3n, 1800);

    // Advance to 12 hours before slot (inside the 24h booker cutoff)
    await advanceTime(86400 * 2 + 43200);

    // Booker cancel now reverts due to cutoff
    await expect(
      bookerB.writeContract({
        address: contractAddress,
        abi: reserveAbi,
        functionName: "cancel",
        args: [1n, start],
      })
    ).rejects.toThrow();

    // But host CAN cancel anytime before start
    const hash = await host.writeContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "hostCancel",
      args: [1n, start],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const booking = await publicClient.readContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "bookingOf",
      args: [1n, start],
    });
    expect(booking.status).toBe(BookingStatus.Cancelled);

    const pendingB = await publicClient.readContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "pending",
      args: [bookerB.account.address],
    });
    expect(pendingB).toBe(parseEther("0.05"));
  });

  it("7. booker C books slot, time advances past start, outsider collects for host", async () => {
    const block = await publicClient.getBlock();
    const now = block.timestamp;
    const start = alignedStart(now + 86400n, 1800);

    // Booker C books
    const bookTx = await bookerC.writeContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "book",
      args: [1n, start],
      value: parseEther("0.05"),
    });
    await publicClient.waitForTransactionReceipt({ hash: bookTx });

    // Advance time past slot start
    await advanceTime(86400 + 3600);

    // Outsider calls collect
    const collectTx = await outsider.writeContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "collect",
      args: [1n, start],
    });
    await publicClient.waitForTransactionReceipt({ hash: collectTx });

    const booking = await publicClient.readContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "bookingOf",
      args: [1n, start],
    });
    expect(booking.status).toBe(BookingStatus.Collected);

    const pendingHost = await publicClient.readContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "pending",
      args: [host.account.address],
    });
    expect(pendingHost).toBe(parseEther("0.05"));
  });

  it("8. host withdraws accumulated earnings via pull payment", async () => {
    const balBefore = await publicClient.getBalance({
      address: host.account.address,
    });

    const hash = await host.writeContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "withdraw",
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const gasPaid = receipt.gasUsed * receipt.effectiveGasPrice;

    const balAfter = await publicClient.getBalance({
      address: host.account.address,
    });
    expect(balAfter + gasPaid - balBefore).toBe(parseEther("0.05"));

    const pendingHost = await publicClient.readContract({
      address: contractAddress,
      abi: reserveAbi,
      functionName: "pending",
      args: [host.account.address],
    });
    expect(pendingHost).toBe(0n);
  });
});
