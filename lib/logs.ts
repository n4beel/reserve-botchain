import type { Log } from "viem";

export interface OpenedEvent {
  id: bigint;
  host: `0x${string}`;
  price: bigint;
  slotSecs: number;
  cutoffSecs: number;
  name: string;
}

export interface BookedEvent {
  id: bigint;
  start: bigint;
  booker: `0x${string}`;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export interface CancelledEvent {
  id: bigint;
  start: bigint;
  booker: `0x${string}`;
  byHost: boolean;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export interface CollectedEvent {
  id: bigint;
  start: bigint;
  amount: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export interface WithdrawnEvent {
  to: `0x${string}`;
  amount: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

/**
 * Event decoders for Reserve contract logs.
 */
export function parseBookedLog(log: Log & { args?: any }): BookedEvent | null {
  if (!log.args) return null;
  const { id, start, booker } = log.args;
  if (id === undefined || start === undefined || !booker) return null;

  return {
    id: BigInt(id),
    start: BigInt(start),
    booker: booker as `0x${string}`,
    blockNumber: log.blockNumber ?? 0n,
    transactionHash: log.transactionHash ?? "0x",
  };
}

export function parseCancelledLog(
  log: Log & { args?: any }
): CancelledEvent | null {
  if (!log.args) return null;
  const { id, start, booker, byHost } = log.args;
  if (id === undefined || start === undefined || !booker) return null;

  return {
    id: BigInt(id),
    start: BigInt(start),
    booker: booker as `0x${string}`,
    byHost: Boolean(byHost),
    blockNumber: log.blockNumber ?? 0n,
    transactionHash: log.transactionHash ?? "0x",
  };
}

export function parseCollectedLog(
  log: Log & { args?: any }
): CollectedEvent | null {
  if (!log.args) return null;
  const { id, start, amount } = log.args;
  if (id === undefined || start === undefined || amount === undefined)
    return null;

  return {
    id: BigInt(id),
    start: BigInt(start),
    amount: BigInt(amount),
    blockNumber: log.blockNumber ?? 0n,
    transactionHash: log.transactionHash ?? "0x",
  };
}

export function parseWithdrawnLog(
  log: Log & { args?: any }
): WithdrawnEvent | null {
  if (!log.args) return null;
  const { to, amount } = log.args;
  if (!to || amount === undefined) return null;

  return {
    to: to as `0x${string}`,
    amount: BigInt(amount),
    blockNumber: log.blockNumber ?? 0n,
    transactionHash: log.transactionHash ?? "0x",
  };
}
