"use client";

import { create } from "zustand";
import type { StoreApi } from "zustand";
import type { UseBoundStoreWithEqualityFn } from "zustand/traditional";
import {
  persist,
  createJSONStorage,
  type PersistOptions,
} from "zustand/middleware";
import type { Address } from "viem";
import { publicClient } from "@/lib/chain/client";
import { formatJpycAmount, readJpycBalance } from "@/lib/chain/jpyc";
import type { HistoryEntry } from "@/types/history";

export type BalanceStatus = "idle" | "loading" | "ready" | "error";

export type WalletState = {
  address: Address | null;
  balance: string;
  balanceWei: bigint;
  balanceStatus: BalanceStatus;
  nativeBalanceWei: bigint;
  nativeBalanceStatus: BalanceStatus;
  history: HistoryEntry[];
  setAddress: (address: Address | null) => void;
  fetchBalance: () => Promise<void>;
  fetchNativeBalance: () => Promise<void>;
  setHistory: (entries: HistoryEntry[]) => void;
  addHistoryEntry: (entry: HistoryEntry) => void;
  updateHistoryEntry: (id: string, updates: Partial<HistoryEntry>) => void;
  clearHistory: () => void;
};

type WalletPersistedState = Pick<WalletState, "history">;

const fallbackStorage: Storage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
};

const walletPersistOptions: PersistOptions<WalletState, WalletPersistedState> =
  {
    name: "palpay-wallet-cache",
    partialize: (state) => ({ history: state.history }),
    storage: createJSONStorage<WalletPersistedState>(() =>
      typeof window === "undefined" ? fallbackStorage : window.localStorage
    ),
  };

const walletStoreBase = create<WalletState>()(
  persist<WalletState, [], [], WalletPersistedState>(
    (set, get) => ({
      address: null,
      balance: "0",
      balanceWei: 0n,
      balanceStatus: "idle",
      nativeBalanceWei: 0n,
      nativeBalanceStatus: "idle",
      history: [],
      setAddress: (address) =>
        set(
          address
            ? {
                address,
                balance: "0",
                balanceWei: 0n,
                balanceStatus: "idle",
                nativeBalanceWei: 0n,
                nativeBalanceStatus: "idle",
              }
            : {
                address: null,
                balance: "0",
                balanceWei: 0n,
                balanceStatus: "idle",
                nativeBalanceWei: 0n,
                nativeBalanceStatus: "idle",
              }
        ),
      fetchBalance: async () => {
        const address = get().address;
        if (!address) {
          return;
        }

        set({ balanceStatus: "loading" });

        try {
          const rawBalance = await readJpycBalance(address);
          const formatted = formatJpycAmount(rawBalance);

          set({
            balance: formatted,
            balanceWei: rawBalance,
            balanceStatus: "ready",
          });
        } catch (error) {
          console.error("Failed to fetch JPYC balance", error);
          set({ balanceStatus: "error" });
        }
      },
      fetchNativeBalance: async () => {
        const address = get().address;
        if (!address) {
          return;
        }

        set({ nativeBalanceStatus: "loading" });

        try {
          const balance = await publicClient.getBalance({ address });

          set({
            nativeBalanceWei: balance,
            nativeBalanceStatus: "ready",
          });
        } catch (error) {
          console.error("Failed to fetch native balance", error);
          set({ nativeBalanceStatus: "error" });
        }
      },
      setHistory: (entries) =>
        set({
          history: entries.slice(0, 50),
        }),
      addHistoryEntry: (entry) =>
        set((state) => ({
          history: [entry, ...state.history].slice(0, 50),
        })),
      updateHistoryEntry: (id, updates) =>
        set((state) => ({
          history: state.history.map((entry) =>
            entry.id === id ? { ...entry, ...updates } : entry
          ),
        })),
      clearHistory: () => set({ history: [] }),
    }),
    walletPersistOptions
  )
);

export const useWalletStore = walletStoreBase as typeof walletStoreBase &
  UseBoundStoreWithEqualityFn<StoreApi<WalletState>>;
