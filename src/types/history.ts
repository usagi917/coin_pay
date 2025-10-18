export type HistoryStatus = "completed" | "pending" | "failed";
export type HistoryDirection = "in" | "out";

export type HistoryEntry = {
  id: string;
  counterparty: string;
  counterpartyAddress?: string;
  counterpartyEns?: string;
  amount: string;
  direction: HistoryDirection;
  status: HistoryStatus;
  timestamp: string;
  txHash?: string;
};
