import { activeBotChain } from "@/lib/botchain/chain";
import { formatEther } from "viem";

/**
 * Format a unix timestamp in seconds to local time string.
 */
function formatCutoffTime(unixSec: bigint | number): string {
  try {
    const d = new Date(Number(unixSec) * 1000);
    const day = d.toLocaleDateString("en-US", { weekday: "short" });
    const time = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${day} ${time}`;
  } catch {
    return String(unixSec);
  }
}

/**
 * User-facing error decoder for Reserve.
 * Follows spec §4 copy guidelines.
 */
export function describeError(err: unknown): string {
  // A wallet on the other BOT Chain network: writes are pinned to this build's chain (lib/useChainWrite.ts), so wagmi
  // refuses before the wallet opens. Say what to do, not the library's name for it.
  if (/ConnectorChainMismatch|chain mismatch|does not match the target chain/i.test(err instanceof Error ? `${err.name} ${err.message}` : String(err))) {
    return `Your wallet is on a different network. Switch it to ${activeBotChain.name}, then try again.`;
  }
  if (!err) return "An unexpected error occurred.";

  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("User rejected") || msg.includes("user rejected")) {
    return "Transaction was cancelled in wallet.";
  }

  if (msg.includes("PastCutoff")) {
    const match =
      msg.match(/latest:\s*(\d+)/i) || msg.match(/PastCutoff\((\d+)\)/);
    if (match && match[1]) {
      const timeStr = formatCutoffTime(BigInt(match[1]));
      return `Free cancellation ended at ${timeStr}.`;
    }
    return "The free cancellation window for this slot has passed.";
  }

  if (msg.includes("Taken")) {
    return "Someone just booked that slot.";
  }

  if (msg.includes("MisalignedSlot")) {
    return "Slot start time is not aligned to the resource slot length.";
  }

  if (msg.includes("SlotOutOfRange")) {
    return "Slots open up to 60 days ahead.";
  }

  if (msg.includes("HostCannotBook")) {
    return "You can't book your own resource.";
  }

  if (msg.includes("WrongPayment")) {
    const match =
      msg.match(/required:\s*(\d+)/i) || msg.match(/WrongPayment\((\d+)\)/);
    if (match && match[1]) {
      const priceBot = formatEther(BigInt(match[1]));
      return `Payment must exactly equal ${priceBot} BOT.`;
    }
    return "Payment does not match required slot price.";
  }

  if (msg.includes("ZeroPrice")) {
    return "Price per slot must be greater than zero.";
  }

  if (msg.includes("BadSlotLength")) {
    return "Slot duration must be between 15 minutes and 24 hours, and divide 24 hours.";
  }

  if (msg.includes("BadCutoff")) {
    return "Cancellation cutoff cannot exceed 7 days.";
  }

  if (msg.includes("NameTooLong")) {
    return "Resource name must be between 1 and 40 bytes.";
  }

  if (msg.includes("NoSuchResource")) {
    return "Resource not found.";
  }

  if (msg.includes("NotBooker")) {
    return "Only the original booker can cancel this reservation.";
  }

  if (msg.includes("NotHost")) {
    return "Only the resource host can perform this action.";
  }

  if (msg.includes("NotBooked")) {
    return "Slot is not actively booked.";
  }

  if (msg.includes("AlreadyStarted")) {
    return "This slot has already started.";
  }

  if (msg.includes("NotStarted")) {
    return "Cannot collect payment before the slot has started.";
  }

  if (msg.includes("NothingToWithdraw")) {
    return "No pending balance available to withdraw.";
  }

  if (msg.includes("TransferFailed")) {
    return "Withdrawal transfer failed.";
  }

  if (msg.includes("ReentrancyGuardReentrantCall") || msg.includes("ReentrantCall")) {
    return "Reentrant call blocked.";
  }

  if (msg.includes("WindowTooLarge")) {
    return "Cannot query more than 96 slots at once.";
  }

  return msg.length < 140 ? msg : "Action failed on-chain.";
}
