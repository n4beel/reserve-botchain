"use client";

import { useState, useCallback } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { useToast } from "@/components/ui/Toast";
import { reserveAbi } from "./botchain/abi";
import { getDeployment, isDeployed } from "./botchain/deployment";
import { type BotChainId, isBotChainId } from "./botchain/chain";
import { describeError } from "./errors";
import {
  parseBookedLog,
  parseCancelledLog,
  parseCollectedLog,
  type BookedEvent,
  type CancelledEvent,
  type CollectedEvent,
} from "./logs";
import type { ResourceData, BookingData } from "./reserve";

export function useReserve() {
  const chainId = useChainId();
  const currentChainId: BotChainId = isBotChainId(chainId) ? chainId : 968;
  const deployment = getDeployment(currentChainId);
  const deployed = isDeployed(currentChainId);

  const publicClient = usePublicClient(); // stable-hook-result
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const { toast } = useToast();

  const showToast = useCallback(
    (msg: string, type: "success" | "error" | "warning" | "info" = "info") => {
      toast(type, msg);
    },
    [toast]
  );

  const [isTransacting, setIsTransacting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  // --- Read Methods ---

  const fetchBlockTimestamp = useCallback(async (): Promise<number> => {
    if (!publicClient) return Math.floor(Date.now() / 1000);
    try {
      const block = await publicClient.getBlock({ blockTag: "latest" });
      return Number(block.timestamp);
    } catch {
      return Math.floor(Date.now() / 1000);
    }
  }, [publicClient]);

  const fetchResource = useCallback(
    async (id: bigint): Promise<ResourceData | null> => {
      if (!publicClient || !deployed || id <= 0n) return null;
      try {
        const r = await publicClient.readContract({
          address: deployment.address,
          abi: reserveAbi,
          functionName: "resourceOf",
          args: [id],
        });
        return {
          id,
          host: r.host,
          price: r.price,
          slotSecs: r.slotSecs,
          cutoffSecs: r.cutoffSecs,
          name: r.name,
        };
      } catch (err) {
        console.error("fetchResource error:", err);
        return null;
      }
    },
    [publicClient, deployed, deployment.address]
  );

  const fetchSlots = useCallback(
    async (
      id: bigint,
      fromStart: bigint,
      count: bigint
    ): Promise<BookingData[]> => {
      if (!publicClient || !deployed || id <= 0n || count <= 0n) return [];
      try {
        const results = await publicClient.readContract({
          address: deployment.address,
          abi: reserveAbi,
          functionName: "slots",
          args: [id, fromStart, count],
        });
        return results.map((b) => ({
          booker: b.booker,
          status: b.status,
        }));
      } catch (err) {
        console.error("fetchSlots error:", err);
        return [];
      }
    },
    [publicClient, deployed, deployment.address]
  );

  const fetchLatest = useCallback(
    async (
      offset: bigint,
      count: bigint
    ): Promise<{
      resources: ResourceData[];
      ids: bigint[];
      total: bigint;
    }> => {
      if (!publicClient || !deployed) {
        return { resources: [], ids: [], total: 0n };
      }
      try {
        const [rawResources, ids, total] = await publicClient.readContract({
          address: deployment.address,
          abi: reserveAbi,
          functionName: "latest",
          args: [offset, count],
        });
        const resources: ResourceData[] = rawResources.map((r, i) => ({
          id: ids[i],
          host: r.host,
          price: r.price,
          slotSecs: r.slotSecs,
          cutoffSecs: r.cutoffSecs,
          name: r.name,
        }));
        return { resources, ids: [...ids], total };
      } catch (err) {
        console.error("fetchLatest error:", err);
        return { resources: [], ids: [], total: 0n };
      }
    },
    [publicClient, deployed, deployment.address]
  );

  const fetchPending = useCallback(
    async (user: `0x${string}`): Promise<bigint> => {
      if (!publicClient || !deployed || !user) return 0n;
      try {
        return await publicClient.readContract({
          address: deployment.address,
          abi: reserveAbi,
          functionName: "pending",
          args: [user],
        });
      } catch (err) {
        console.error("fetchPending error:", err);
        return 0n;
      }
    },
    [publicClient, deployed, deployment.address]
  );

  const fetchHostResources = useCallback(
    async (hostAddr: `0x${string}`): Promise<bigint[]> => {
      if (!publicClient || !deployed || !hostAddr) return [];
      try {
        const ids = await publicClient.readContract({
          address: deployment.address,
          abi: reserveAbi,
          functionName: "byHost",
          args: [hostAddr],
        });
        return [...ids];
      } catch (err) {
        console.error("fetchHostResources error:", err);
        return [];
      }
    },
    [publicClient, deployed, deployment.address]
  );

  const fetchBookingLogs = useCallback(
    async (
      id: bigint
    ): Promise<{
      booked: BookedEvent[];
      cancelled: CancelledEvent[];
      collected: CollectedEvent[];
    }> => {
      if (!publicClient || !deployed || id <= 0n) {
        return { booked: [], cancelled: [], collected: [] };
      }
      try {
        const fromBlock = deployment.deployBlock ?? 0n;

        const [bookedLogs, cancelledLogs, collectedLogs] = await Promise.all([
          publicClient.getLogs({
            address: deployment.address,
            event: {
              type: "event",
              name: "Booked",
              inputs: [
                { name: "id", type: "uint256", indexed: true },
                { name: "start", type: "uint64", indexed: true },
                { name: "booker", type: "address", indexed: true },
              ],
            },
            args: { id },
            fromBlock,
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address: deployment.address,
            event: {
              type: "event",
              name: "Cancelled",
              inputs: [
                { name: "id", type: "uint256", indexed: true },
                { name: "start", type: "uint64", indexed: true },
                { name: "booker", type: "address", indexed: true },
                { name: "byHost", type: "bool", indexed: false },
              ],
            },
            args: { id },
            fromBlock,
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address: deployment.address,
            event: {
              type: "event",
              name: "Collected",
              inputs: [
                { name: "id", type: "uint256", indexed: true },
                { name: "start", type: "uint64", indexed: true },
                { name: "amount", type: "uint256", indexed: false },
              ],
            },
            args: { id },
            fromBlock,
            toBlock: "latest",
          }),
        ]);

        return {
          booked: bookedLogs
            .map(parseBookedLog)
            .filter((x): x is BookedEvent => x !== null),
          cancelled: cancelledLogs
            .map(parseCancelledLog)
            .filter((x): x is CancelledEvent => x !== null),
          collected: collectedLogs
            .map(parseCollectedLog)
            .filter((x): x is CollectedEvent => x !== null),
        };
      } catch (err) {
        console.error("fetchBookingLogs error:", err);
        return { booked: [], cancelled: [], collected: [] };
      }
    },
    [publicClient, deployed, deployment.address, deployment.deployBlock]
  );

  // --- Write Methods ---

  const openResource = useCallback(
    async (
      name: string,
      priceWei: bigint,
      slotSecs: number,
      cutoffSecs: number
    ): Promise<bigint | null> => {
      if (!walletClient || !publicClient || !deployed) {
        showToast("Wallet not connected.", "error");
        return null;
      }
      setIsTransacting(true);
      try {
        const hash = await walletClient.writeContract({
          address: deployment.address,
          abi: reserveAbi,
          functionName: "open",
          args: [name, priceWei, slotSecs, cutoffSecs],
        });
        setTxHash(hash);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        showToast("Resource registered successfully!", "success");

        // Parse Opened event from logs
        for (const log of receipt.logs) {
          try {
            if (log.topics[1]) {
              return BigInt(log.topics[1]);
            }
          } catch {}
        }
        return null;
      } catch (err) {
        showToast(describeError(err), "error");
        return null;
      } finally {
        setIsTransacting(false);
      }
    },
    [walletClient, publicClient, deployed, deployment.address, showToast]
  );

  const book = useCallback(
    async (id: bigint, start: bigint, priceWei: bigint): Promise<boolean> => {
      if (!walletClient || !publicClient || !deployed) {
        showToast("Wallet not connected.", "error");
        return false;
      }
      setIsTransacting(true);
      try {
        const hash = await walletClient.writeContract({
          address: deployment.address,
          abi: reserveAbi,
          functionName: "book",
          args: [id, start],
          value: priceWei,
        });
        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        showToast("Slot booked successfully!", "success");
        return true;
      } catch (err) {
        showToast(describeError(err), "error");
        return false;
      } finally {
        setIsTransacting(false);
      }
    },
    [walletClient, publicClient, deployed, deployment.address, showToast]
  );

  const cancel = useCallback(
    async (id: bigint, start: bigint): Promise<boolean> => {
      if (!walletClient || !publicClient || !deployed) {
        showToast("Wallet not connected.", "error");
        return false;
      }
      setIsTransacting(true);
      try {
        const hash = await walletClient.writeContract({
          address: deployment.address,
          abi: reserveAbi,
          functionName: "cancel",
          args: [id, start],
        });
        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        showToast("Booking cancelled. Full refund credited to your pending balance.", "success");
        return true;
      } catch (err) {
        showToast(describeError(err), "error");
        return false;
      } finally {
        setIsTransacting(false);
      }
    },
    [walletClient, publicClient, deployed, deployment.address, showToast]
  );

  const hostCancel = useCallback(
    async (id: bigint, start: bigint): Promise<boolean> => {
      if (!walletClient || !publicClient || !deployed) {
        showToast("Wallet not connected.", "error");
        return false;
      }
      setIsTransacting(true);
      try {
        const hash = await walletClient.writeContract({
          address: deployment.address,
          abi: reserveAbi,
          functionName: "hostCancel",
          args: [id, start],
        });
        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        showToast("Booking cancelled by host. Booker refunded in full.", "success");
        return true;
      } catch (err) {
        showToast(describeError(err), "error");
        return false;
      } finally {
        setIsTransacting(false);
      }
    },
    [walletClient, publicClient, deployed, deployment.address, showToast]
  );

  const collect = useCallback(
    async (id: bigint, start: bigint): Promise<boolean> => {
      if (!walletClient || !publicClient || !deployed) {
        showToast("Wallet not connected.", "error");
        return false;
      }
      setIsTransacting(true);
      try {
        const hash = await walletClient.writeContract({
          address: deployment.address,
          abi: reserveAbi,
          functionName: "collect",
          args: [id, start],
        });
        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        showToast("Slot revenue collected to host till!", "success");
        return true;
      } catch (err) {
        showToast(describeError(err), "error");
        return false;
      } finally {
        setIsTransacting(false);
      }
    },
    [walletClient, publicClient, deployed, deployment.address, showToast]
  );

  const withdraw = useCallback(async (): Promise<boolean> => {
    if (!walletClient || !publicClient || !deployed) {
      showToast("Wallet not connected.", "error");
      return false;
    }
    setIsTransacting(true);
    try {
      const hash = await walletClient.writeContract({
        address: deployment.address,
        abi: reserveAbi,
        functionName: "withdraw",
      });
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      showToast("Withdrawn funds sent to your wallet!", "success");
      return true;
    } catch (err) {
      showToast(describeError(err), "error");
      return false;
    } finally {
      setIsTransacting(false);
    }
  }, [walletClient, publicClient, deployed, deployment.address, showToast]);

  return {
    contractAddress: deployment.address,
    deployed,
    isTransacting,
    txHash,
    fetchBlockTimestamp,
    fetchResource,
    fetchSlots,
    fetchLatest,
    fetchPending,
    fetchHostResources,
    fetchBookingLogs,
    openResource,
    book,
    cancel,
    hostCancel,
    collect,
    withdraw,
  };
}
