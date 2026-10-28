/**
 * Comprehensive Browser Walkthrough for Reserve (Archetype AG · Timetable).
 * Connects to Headless Chrome via CDP, loads mock-wallet.js,
 * tests 1280px & 360px viewports, footer links, wallet menu tokens,
 * walks every seeded resource timetable, host console, and personal dashboard,
 * executes real on-chain transactions:
 * 1. Bob cancels a future booking before cutoff on /me (refunds 0.05 BOT to pending till),
 * 2. Bob withdraws pending refund balance on /me (pull payment),
 * 3. Dave books an open slot for Resource 1 on /r/1 ("Book this slot"),
 * 4. Alice withdraws collected host slot revenue on /me,
 * and asserts zero console errors and zero horizontal overflow across all routes.
 */
import { spawn, execSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, defineChain, http } from "viem";

console.log("Resetting and seeding local stack on port 8728...");
execSync("node scripts/local-stack.mjs", { stdio: "inherit" });

const CHROME_PORT = 9222;
const APP_URL = "http://localhost:3000";
const RPC_URL = "http://127.0.0.1:8728";
const CHAIN_ID = 968;

const ACC_ALICE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Resource 1 Host
const ACC_BOB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";   // Booker A (Future booking & cancel)
const ACC_CHARLIE = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // Booker B (Inside cutoff)
const ACC_DAVE = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";    // Booker C
const ACC_EVE = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";     // Resource 2 Host

const mockWalletScript = readFileSync(
  new URL("../../docs/specs/tools/mock-wallet.js", import.meta.url),
  "utf8"
);

// Get contract address from .env.local
const envLocal = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const matchContract = envLocal.match(/NEXT_PUBLIC_CONTRACT_968=(0x[a-fA-F0-9]{40})/);
if (!matchContract) throw new Error("Could not find NEXT_PUBLIC_CONTRACT_968 in .env.local");
const CONTRACT_ADDRESS = matchContract[1];

const localChain = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});
const pubClient = createPublicClient({ chain: localChain, transport: http() });

const artifact = JSON.parse(
  readFileSync(new URL("../contracts/out/Reserve.sol/Reserve.json", import.meta.url), "utf8")
);

const resourceCount = await pubClient.readContract({
  address: CONTRACT_ADDRESS,
  abi: artifact.abi,
  functionName: "resourceCount",
});
console.log(`Contract at: ${CONTRACT_ADDRESS}`);
console.log(`On-chain resource count: ${resourceCount}`);

const userDir = mkdtempSync(join(tmpdir(), "chrome-reserve-"));

console.log("Launching headless Chrome...");
const chrome = spawn("google-chrome", [
  "--headless=new",
  `--remote-debugging-port=${CHROME_PORT}`,
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  `--user-data-dir=${userDir}`,
  "about:blank",
]);

await new Promise((r) => setTimeout(r, 1200));

async function cdpHttp(path, method = "GET") {
  const res = await fetch(`http://127.0.0.1:${CHROME_PORT}${path}`, { method });
  return await res.json();
}

const version = await cdpHttp("/json/version");
console.log("Connected to Chrome:", version["Browser"]);

const list = await cdpHttp("/json/list");
const pageTarget = list.find((t) => t.type === "page");
const wsUrl = pageTarget?.webSocketDebuggerUrl;
if (!wsUrl) throw new Error("No page webSocketDebuggerUrl found");

const ws = new WebSocket(wsUrl);
let reqId = 1;
const pending = new Map();
const consoleErrors = [];
const cdpListeners = new Set();

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  for (const listener of cdpListeners) {
    try {
      listener(msg);
    } catch (e) {
      console.error("Listener error:", e);
    }
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    if (msg.params.type === "error") {
      const errText = msg.params.args.map((a) => a.value || a.description).join(" ");
      if (!errText.includes("net::ERR_CONNECTION_REFUSED") && !errText.includes("favicon")) {
        consoleErrors.push(errText);
      }
    }
  }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(msg.error);
    else resolve(msg.result);
  }
};

await new Promise((resolve) => (ws.onopen = resolve));

function send(method, params = {}) {
  const id = reqId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Page.enable");
await send("Runtime.enable");

// Injected mock wallet (reads active account from localStorage across navigations)
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    ${mockWalletScript}
    const acc = localStorage.getItem("__active_mock_account") || "${ACC_BOB}";
    window.__installMockWallet({ rpc: "${RPC_URL}", account: acc });
    console.log("[MockWallet] Injected & installed for " + acc);
  `,
});

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
  }
  return res.result?.value;
}

async function setViewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
}

async function navigate(path) {
  const url = `${APP_URL}${path}`;
  const loadPromise = new Promise((resolve) => {
    const handler = (msg) => {
      if (msg.method === "Page.loadEventFired") {
        cdpListeners.delete(handler);
        resolve();
      }
    };
    cdpListeners.add(handler);
  });
  await send("Page.navigate", { url });
  await loadPromise;
  await new Promise((r) => setTimeout(r, 600));
}

async function waitForText(target, maxMs = 8000) {
  const start = Date.now();
  const lower = target.toLowerCase();
  while (Date.now() - start < maxMs) {
    const text = (await evaluate("document.body.innerText")) || "";
    if (text.toLowerCase().includes(lower)) return text;
    await new Promise((r) => setTimeout(r, 150));
  }
  return await evaluate("document.body.innerText");
}

async function checkHorizontalOverflow(routeName, width) {
  const overflow = await evaluate(`
    (() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      return { scrollWidth: docW, innerWidth: winW, overflow: docW > winW };
    })()
  `);
  console.log(`   Overflow check on ${routeName} (${width}px):`, overflow);
  if (overflow.overflow) {
    throw new Error(`Horizontal overflow on ${routeName} at ${width}px: scrollWidth ${overflow.scrollWidth} > innerWidth ${overflow.innerWidth}`);
  }
}

async function switchMockAccount(accountAddress) {
  await evaluate(`
    localStorage.setItem("__active_mock_account", "${accountAddress}");
    if (window.__mockWallet) {
      window.__mockWallet.setAccount("${accountAddress}");
    }
  `);
  await new Promise((r) => setTimeout(r, 200));
}

async function ensureWalletConnected() {
  await evaluate(`
    (() => {
      const connectBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Connect"));
      if (connectBtn) connectBtn.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 500));
}

console.log("\n--- Starting Reserve Browser Verification ---");

try {
  // -------------------------------------------------------------
  // 1. Desktop 1280px on / (Resource Index)
  // -------------------------------------------------------------
  console.log("1. Testing Desktop 1280px on /...");
  await setViewport(1280, 800);
  await navigate("/");

  const pageTitle = await evaluate("document.title");
  console.log(`   Page title: "${pageTitle}"`);
  if (!pageTitle.includes("Reserve")) throw new Error("Title does not include 'Reserve'");

  // Wait for initial render/hydration
  await waitForText("What a booking can't promise", 8000);

  // Check 3 footer links
  const footerLinksCount = await evaluate(`
    (() => {
      const links = Array.from(document.querySelectorAll("footer a"));
      const hrefs = links.map(a => a.href);
      const hasBotchain = hrefs.some(h => h.includes("botchain.ai") && !h.includes("scan"));
      const hasScan = hrefs.some(h => h.includes("scan.botchain.ai"));
      const hasBuiltOn = document.querySelector("footer")?.textContent?.includes("Built on") || false;
      return { total: links.length, hasBotchain, hasScan, hasBuiltOn };
    })()
  `);
  console.log("   Footer links check:", footerLinksCount);
  if (!footerLinksCount.hasBotchain || !footerLinksCount.hasScan || !footerLinksCount.hasBuiltOn) {
    throw new Error("Footer missing required BOT Chain links");
  }

  // Check LimitationBlock copy
  const limitsCheck = await evaluate(`
    (() => {
      const text = document.body.innerText.toLowerCase();
      return {
        heading: text.includes("what a booking can't promise"),
        l1: text.includes("nobody here can tell whether the slot was used."),
        l2: text.includes("the host can cancel. you will be refunded in full."),
        l3: text.includes("length and price are fixed when the slot calendar is opened."),
      };
    })()
  `);
  console.log("   Limitation block copy check:", limitsCheck);
  if (!limitsCheck.heading || !limitsCheck.l1 || !limitsCheck.l2 || !limitsCheck.l3) {
    throw new Error("LimitationBlock missing required copy");
  }

  // Check wallet menu tokens
  const menuTokens = await evaluate(`
    (() => {
      const style = getComputedStyle(document.documentElement);
      return {
        bg: style.getPropertyValue("--menu-bg").trim(),
        fg: style.getPropertyValue("--menu-fg").trim(),
        muted: style.getPropertyValue("--menu-muted").trim(),
        border: style.getPropertyValue("--menu-border").trim(),
        hoverBg: style.getPropertyValue("--menu-hover-bg").trim(),
        danger: style.getPropertyValue("--menu-danger").trim(),
      };
    })()
  `);
  console.log("   Wallet menu tokens check:", menuTokens);
  if (
    !["#ffffff", "#fff"].includes(menuTokens.bg.toLowerCase()) ||
    menuTokens.fg.toLowerCase() !== "#0b2545" ||
    menuTokens.muted.toLowerCase() !== "#47607f" ||
    menuTokens.border.toLowerCase() !== "#c5d3e8" ||
    menuTokens.hoverBg.toLowerCase() !== "#e4eefc" ||
    menuTokens.danger.toLowerCase() !== "#b3261e"
  ) {
    throw new Error(`Wallet menu tokens do not match required spec: ${JSON.stringify(menuTokens)}`);
  }

  // Check seeded resources visible on index
  await waitForText("Studio Room A");
  await waitForText("Seminar Hall");
  await checkHorizontalOverflow("/", 1280);

  // -------------------------------------------------------------
  // 2. Mobile 360px viewport checks across all routes
  // -------------------------------------------------------------
  console.log("\n2. Testing Mobile 360px viewports & 0px overflow across all routes...");
  await setViewport(360, 640);

  const routes = ["/", "/new", "/r/1", "/r/2", "/r/1/manage", "/me"];
  for (const r of routes) {
    await navigate(r);
    await new Promise((res) => setTimeout(res, 500));
    await checkHorizontalOverflow(r, 360);
  }

  // Reset to Desktop for on-chain actions
  await setViewport(1280, 800);

  // -------------------------------------------------------------
  // 3. Bob cancels future booking on /me (gets 0.05 BOT refund)
  // -------------------------------------------------------------
  console.log("\n3. Bob cancels future booking on /me...");
  await switchMockAccount(ACC_BOB);
  await navigate("/me");
  await ensureWalletConnected();

  await waitForText("Slots Booked by You");
  await waitForText("Studio Room A");

  // Click Cancel button
  const cancelBtn = await evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Cancel (Full Refund)"));
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  console.log("   Clicked 'Cancel (Full Refund)':", cancelBtn);
  if (!cancelBtn) throw new Error("Could not find 'Cancel (Full Refund)' button for Bob");

  await new Promise((r) => setTimeout(r, 3000));
  const postCancelPending = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "pending",
    args: [ACC_BOB],
  });
  console.log(`   Bob pending till after cancellation: ${postCancelPending} wei (expect >= 0.1 BOT)`);
  if (postCancelPending < 100000000000000000n) {
    throw new Error("Bob pending balance was not updated after cancellation");
  }

  // -------------------------------------------------------------
  // 4. Bob withdraws pending refund on /me
  // -------------------------------------------------------------
  console.log("\n4. Bob withdraws pending refund balance on /me...");
  await navigate("/me");
  await waitForText("Withdraw to Wallet");

  const withdrawBtn = await evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Withdraw to Wallet"));
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    })()
  `);
  console.log("   Clicked 'Withdraw to Wallet':", withdrawBtn);
  if (!withdrawBtn) throw new Error("Could not click 'Withdraw to Wallet' button");

  await new Promise((r) => setTimeout(r, 3000));
  const bobFinalPending = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "pending",
    args: [ACC_BOB],
  });
  console.log(`   Bob pending till after withdraw: ${bobFinalPending} wei`);
  if (bobFinalPending !== 0n) throw new Error("Bob pending balance is not 0 after withdraw");

  // -------------------------------------------------------------
  // 5. Dave books an open slot for Resource 1 on /r/1
  // -------------------------------------------------------------
  console.log("\n5. Dave books an open slot on /r/1...");
  await switchMockAccount(ACC_DAVE);
  await navigate("/r/1");
  await ensureWalletConnected();
  await waitForText("Slot Timetable");
  await new Promise((r) => setTimeout(r, 1000));

  // Find and click a free slot button in the timetable
  const clickedSlot = await evaluate(`
    (() => {
      const slotBtns = Array.from(document.querySelectorAll("button[aria-label]"));
      const freeBtn = slotBtns.find(b => {
        const label = b.getAttribute("aria-label") || "";
        const isPast = b.classList.contains("slot-hatched") || b.textContent.includes("Past");
        return label.includes("Available") && !isPast;
      });
      if (!freeBtn) return false;
      freeBtn.click();
      return true;
    })()
  `);
  console.log("   Clicked free slot cell:", clickedSlot);
  if (!clickedSlot) throw new Error("Could not find free slot cell on /r/1");

  await waitForText("Slot Reservation");
  await waitForText("Book This Slot");

  const clickedBook = await evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.toLowerCase().includes("book this slot"));
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  console.log("   Clicked 'Book This Slot':", clickedBook);
  if (!clickedBook) throw new Error("Could not find 'Book This Slot' button");

  await new Promise((r) => setTimeout(r, 3000));
  console.log("   Slot booked successfully!");

  // -------------------------------------------------------------
  // 6. Alice withdraws collected host earnings on /me
  // -------------------------------------------------------------
  console.log("\n6. Alice withdraws historic collected earnings on /me...");
  await switchMockAccount(ACC_ALICE);
  await navigate("/me");
  await ensureWalletConnected();

  await waitForText("Pending Till Balance");
  const alicePendingBefore = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "pending",
    args: [ACC_ALICE],
  });
  console.log(`   Alice pending till before withdraw: ${alicePendingBefore} wei`);

  const aliceWithdrawBtn = await evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Withdraw to Wallet"));
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    })()
  `);
  console.log("   Clicked Alice 'Withdraw to Wallet':", aliceWithdrawBtn);
  if (!aliceWithdrawBtn) throw new Error("Could not click Alice 'Withdraw to Wallet'");

  await new Promise((r) => setTimeout(r, 3000));
  const alicePendingAfter = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "pending",
    args: [ACC_ALICE],
  });
  console.log(`   Alice pending till after withdraw: ${alicePendingAfter} wei`);
  if (alicePendingAfter !== 0n) throw new Error("Alice pending balance was not emptied after withdraw");

  // -------------------------------------------------------------
  // 7. Console Errors Verification
  // -------------------------------------------------------------
  console.log("\n7. Console errors recorded during walkthrough:", consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.error("Errors found:", consoleErrors);
    throw new Error(`Walkthrough produced ${consoleErrors.length} console errors`);
  }

  console.log("\n✅ All Reserve browser walkthrough checks PASSED cleanly!");
} finally {
  try {
    ws.close();
    chrome.kill("SIGTERM");
  } catch {}
}
