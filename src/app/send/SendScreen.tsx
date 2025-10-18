"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type Address,
  type EIP1193Provider,
  type Hash,
  BaseError,
  UserRejectedRequestError,
} from "viem";
import { Button } from "@/components/Button/Button";
import {
  RecipientInput,
  type RecipientChangeEvent,
} from "./components/RecipientInput";
import { AmountInput, type AmountChangeEvent } from "./components/AmountInput";
import { ConfirmTransferModal } from "./components/ConfirmTransferModal";
import { useWalletStore } from "@/store/walletStore";
import { publicClient } from "@/lib/chain/client";
import { estimateErc20TransferFee } from "@/lib/chain/gas";
import { formatJpycAmount } from "@/lib/chain/jpyc";
import {
  createSepoliaWalletClient,
  ensureSepoliaChain,
  getPrimaryAccount,
} from "@/lib/chain/wallet";
import { transferJpyc } from "@/lib/chain/transfer";
import { useAnalytics } from "@/lib/analytics";
import { COPY, ERRORS } from "@/lib/i18n/messages";
import styles from "./send.module.css";

type TransferState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "pending"; txHash: Hash }
  | { status: "success"; txHash: Hash }
  | { status: "error"; message: string };

type ToastState = {
  kind: "success" | "error";
  message: string;
  txHash?: Hash;
};

function formatHistoryTimestamp(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function generateHistoryId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tx-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

function shortenHash(hash: string) {
  if (hash.length <= 14) {
    return hash;
  }
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function deriveTransferErrorMessage(error: unknown): string {
  if (error instanceof UserRejectedRequestError) {
    return "ウォレットでキャンセルされました";
  }

  if (error instanceof BaseError) {
    if (error.shortMessage?.toLowerCase().includes("chain")) {
      return "Sepolia に切り替えてから再度お試しください";
    }
    if (error.shortMessage) {
      return error.shortMessage;
    }
  }

  if (error instanceof Error) {
    const lowered = error.message.toLowerCase();
    if (lowered.includes("sepolia")) {
      return "Sepolia に接続してから再度お試しください";
    }
    if (lowered.includes("wallet")) {
      return "ウォレットが見つかりませんでした";
    }
  }

  return ERRORS.networkUnstable;
}

function deriveTransferErrorType(error: unknown): string {
  if (error instanceof UserRejectedRequestError) {
    return "wallet_reject";
  }

  if (error instanceof BaseError) {
    if (error.shortMessage?.toLowerCase().includes("chain")) {
      return "chain_mismatch";
    }
    return "wallet_base_error";
  }

  if (error instanceof Error) {
    const lowered = error.message.toLowerCase();
    if (lowered.includes("network")) {
      return "network";
    }
    if (lowered.includes("sepolia")) {
      return "wrong_chain";
    }
  }

  return "unknown";
}

export function SendScreen() {
  const router = useRouter();
  const [recipientState, setRecipientState] =
    useState<RecipientChangeEvent | null>(null);
  const [amountState, setAmountState] = useState<AmountChangeEvent | null>(
    null
  );
  const [gasEstimateWei, setGasEstimateWei] = useState<bigint | null>(null);
  const [gasEstimateStatus, setGasEstimateStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [transferState, setTransferState] = useState<TransferState>({
    status: "idle",
  });
  const [toast, setToast] = useState<ToastState | null>(null);

  const address = useWalletStore((state) => state.address);
  const balanceStatus = useWalletStore((state) => state.balanceStatus);
  const balanceWei = useWalletStore((state) => state.balanceWei);
  const nativeBalanceStatus = useWalletStore(
    (state) => state.nativeBalanceStatus
  );
  const nativeBalanceWei = useWalletStore((state) => state.nativeBalanceWei);
  const setAddress = useWalletStore((state) => state.setAddress);
  const history = useWalletStore((state) => state.history);
  const addHistoryEntry = useWalletStore((state) => state.addHistoryEntry);
  const updateHistoryEntry = useWalletStore(
    (state) => state.updateHistoryEntry
  );
  const { trackView, trackSend, trackComplete, trackError } = useAnalytics();
  const hasTrackedView = useRef(false);
  const transferStartRef = useRef<number | null>(null);

  const isTransferBusy =
    transferState.status === "signing" || transferState.status === "pending";

  useEffect(() => {
    if (!address) {
      return;
    }

    const store = useWalletStore.getState();
    store.fetchBalance().catch((error) => {
      console.error("Failed to refresh JPYC balance", error);
    });

    store.fetchNativeBalance().catch((error) => {
      console.error("Failed to refresh native balance", error);
    });
  }, [address]);

  useEffect(() => {
    if (hasTrackedView.current) {
      return;
    }
    trackView({ screen: "send", address: address ?? null });
    hasTrackedView.current = true;
  }, [trackView, address]);

  useEffect(() => {
    let cancelled = false;
    setGasEstimateStatus("loading");

    publicClient
      .getGasPrice()
      .then((price) => {
        if (cancelled) {
          return;
        }
        const fee = estimateErc20TransferFee(price);
        setGasEstimateWei(fee);
        setGasEstimateStatus("ready");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error("Failed to fetch gas price", error);
        setGasEstimateWei(null);
        setGasEstimateStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = setTimeout(() => {
      setToast(null);
    }, 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (
      transferState.status !== "success" &&
      transferState.status !== "error"
    ) {
      return;
    }
    const timeout = setTimeout(() => {
      setTransferState({ status: "idle" });
    }, 6000);
    return () => clearTimeout(timeout);
  }, [transferState]);

  const amountSummary = useMemo(() => {
    if (!amountState || amountState.status !== "valid") {
      return "金額を入力してください。";
    }

    if (amountState.errors.length > 0) {
      return "金額を調整してから進めてください。";
    }

    const formatted = formatJpycAmount(amountState.amountWei);
    return `送金予定の金額：${formatted} JPYC`;
  }, [amountState]);

  const recipientReady =
    recipientState?.status === "valid" && Boolean(recipientState.address);

  const amountReady =
    amountState?.status === "valid" &&
    amountState.amountWei > 0n &&
    amountState.errors.length === 0;

  const canOpenConfirmation =
    recipientReady &&
    amountReady &&
    gasEstimateStatus === "ready" &&
    gasEstimateWei !== null;

  const confirmationPayload = useMemo(() => {
    if (!canOpenConfirmation || !recipientState || !amountState) {
      return null;
    }

    return {
      recipientAddress: recipientState.address!,
      ensName: recipientState.ensName,
      amountWei: amountState.amountWei,
    };
  }, [amountState, canOpenConfirmation, recipientState]);

  const firstTimeRecipient = useMemo(() => {
    if (!recipientState?.address || recipientState.status !== "valid") {
      return false;
    }
    const normalized = recipientState.address.toLowerCase();
    return !history.some((entry) => {
      if (entry.direction !== "out") {
        return false;
      }
      if (entry.counterpartyAddress) {
        return entry.counterpartyAddress.toLowerCase() === normalized;
      }
      if (entry.counterparty.startsWith("0x")) {
        return entry.counterparty.toLowerCase() === normalized;
      }
      return false;
    });
  }, [history, recipientState]);

  const transferStatusMessage = useMemo(() => {
    switch (transferState.status) {
      case "signing":
        return {
          tone: "info" as const,
          message: "ウォレットで署名を完了してください。",
        };
      case "pending":
        return {
          tone: "info" as const,
          message: "送金を送信しました。着金を確認しています…",
          txHash: shortenHash(transferState.txHash),
        };
      case "success":
        return {
          tone: "success" as const,
          message: COPY.sendComplete,
          txHash: shortenHash(transferState.txHash),
        };
      case "error":
        return {
          tone: "error" as const,
          message: transferState.message,
        };
      default:
        return null;
    }
  }, [transferState]);

  const handleOpenConfirm = () => {
    if (!canOpenConfirmation || isTransferBusy) {
      return;
    }
    setIsConfirmOpen(true);
  };

  const handleCloseConfirm = () => {
    setIsConfirmOpen(false);
  };

  const handleConfirmTransfer = async () => {
    if (!confirmationPayload || isTransferBusy) {
      setIsConfirmOpen(false);
      return;
    }

    setIsConfirmOpen(false);
    setTransferState({ status: "signing" });

    let pendingHistoryId: string | null = null;
    const amountWei = confirmationPayload.amountWei;
    const counterpartyAddress = confirmationPayload.recipientAddress;
    const counterpartyEns = confirmationPayload.ensName ?? null;
    const counterpartyLabel =
      confirmationPayload.ensName ?? confirmationPayload.recipientAddress;
    let stage: "signing" | "submitting" | "confirming" = "signing";
    let submittedHash: Hash | null = null;
    let connectedAccount: Address | null = null;

    transferStartRef.current = Date.now();

    try {
      if (typeof window === "undefined") {
        throw new Error("ウォレットが見つかりませんでした");
      }

      const provider = (
        window as typeof window & { ethereum?: EIP1193Provider }
      ).ethereum;
      if (!provider) {
        throw new Error("ウォレットが見つかりませんでした");
      }

      const walletClient = createSepoliaWalletClient(provider);

      const account = await getPrimaryAccount(walletClient);
      connectedAccount = account;

      if (!address || address.toLowerCase() !== account.toLowerCase()) {
        setAddress(account);
      }

      await ensureSepoliaChain(walletClient);

      stage = "submitting";

      const hash = await transferJpyc({
        walletClient,
        sender: account,
        recipient: confirmationPayload.recipientAddress,
        amountWei: confirmationPayload.amountWei,
      });

      submittedHash = hash;
      stage = "confirming";

      trackSend({
        amountWei,
        counterparty: counterpartyLabel,
        counterpartyAddress,
        ensName: counterpartyEns,
        walletAddress: connectedAccount ?? address ?? null,
        txHash: hash,
      });

      const createdAt = new Date();
      const historyId = generateHistoryId();
      pendingHistoryId = historyId;

      addHistoryEntry({
        id: historyId,
        counterparty:
          confirmationPayload.ensName ?? confirmationPayload.recipientAddress,
        counterpartyAddress: confirmationPayload.recipientAddress,
        counterpartyEns: confirmationPayload.ensName,
        amount: `${formatJpycAmount(confirmationPayload.amountWei)} JPYC`,
        direction: "out",
        status: "pending",
        timestamp: formatHistoryTimestamp(createdAt),
        txHash: hash,
      });

      setTransferState({ status: "pending", txHash: hash });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== "success") {
        throw new Error("送金が失敗しました");
      }

      const completedAt = new Date();
      if (pendingHistoryId) {
        updateHistoryEntry(pendingHistoryId, {
          status: "completed",
          timestamp: formatHistoryTimestamp(completedAt),
        });
      }

      const store = useWalletStore.getState();
      await Promise.allSettled([
        store.fetchBalance(),
        store.fetchNativeBalance(),
      ]);

      const durationMs =
        transferStartRef.current !== null
          ? Date.now() - transferStartRef.current
          : undefined;

      trackComplete({
        amountWei,
        txHash: hash,
        counterparty: counterpartyLabel,
        counterpartyAddress,
        durationMs,
      });

      setTransferState({ status: "success", txHash: hash });
      setToast({
        kind: "success",
        message: COPY.sendComplete,
        txHash: hash,
      });
    } catch (error) {
      console.error("Transfer failed", error);
      const message = deriveTransferErrorMessage(error);
      const errorType = deriveTransferErrorType(error);
      if (pendingHistoryId) {
        updateHistoryEntry(pendingHistoryId, {
          status: "failed",
          timestamp: formatHistoryTimestamp(new Date()),
        });
      }
      setTransferState({ status: "error", message });
      setToast({ kind: "error", message });
      trackError({
        type: errorType,
        message,
        stage,
        txHash: submittedHash ?? undefined,
        walletAddress: connectedAccount ?? address ?? null,
        counterpartyAddress,
        ensName: counterpartyEns,
      });
    } finally {
      transferStartRef.current = null;
    }
  };

  const dismissToast = () => setToast(null);

  const transferStatusClassName = useMemo(() => {
    if (!transferStatusMessage) {
      return styles.transferStatus;
    }
    const toneClass =
      transferStatusMessage.tone === "success"
        ? styles.transferStatusSuccess
        : transferStatusMessage.tone === "error"
          ? styles.transferStatusError
          : styles.transferStatusInfo;
    return `${styles.transferStatus} ${toneClass}`;
  }, [transferStatusMessage]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>送る</h1>
        <p className={styles.description}>{COPY.sendHelp}</p>
      </header>

      <section className={styles.section} aria-label="宛先入力フォーム">
        <RecipientInput onRecipientChange={setRecipientState} />
      </section>

      <section className={styles.section} aria-label="金額入力フォーム">
        <AmountInput
          maxAmountWei={balanceWei}
          balanceStatus={balanceStatus}
          nativeBalanceWei={nativeBalanceWei}
          nativeBalanceStatus={nativeBalanceStatus}
          estimatedFeeWei={gasEstimateWei}
          onAmountChange={setAmountState}
        />
      </section>

      <section className={styles.sectionHint} aria-live="polite">
        {recipientState?.status === "valid" && recipientState.address ? (
          <p className={styles.validSummary}>
            この宛先に送金できます：{recipientState.address}
          </p>
        ) : (
          <p className={styles.pendingSummary}>
            宛先を入力すると次のステップに進めます。
          </p>
        )}
        <p className={styles.pendingSummary}>{amountSummary}</p>
        {gasEstimateStatus === "loading" ? (
          <p className={styles.pendingSummary}>手数料を計算しています…</p>
        ) : null}
        {gasEstimateStatus === "error" ? (
          <p className={styles.pendingSummary}>
            手数料の取得に失敗しました。時間をおいて再度お試しください。
          </p>
        ) : null}
      </section>

      {firstTimeRecipient ? (
        <div
          className={styles.firstRecipientBanner}
          role="status"
          aria-live="polite"
        >
          初回の相手です。あて先をご確認ください
        </div>
      ) : null}

      {transferStatusMessage ? (
        <div
          className={transferStatusClassName}
          role="status"
          aria-live="polite"
        >
          <p>{transferStatusMessage.message}</p>
          {transferStatusMessage.txHash ? (
            <span className={styles.transferStatusHash}>
              取引ID: {transferStatusMessage.txHash}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={styles.actions}>
        <Button
          onClick={handleOpenConfirm}
          disabled={!canOpenConfirmation || isTransferBusy}
          aria-busy={isTransferBusy}
        >
          {isTransferBusy ? "送金を処理しています…" : "送金内容を確認する"}
        </Button>
        <Button variant="secondary" onClick={() => router.push("/home")}>
          ホームへ戻る
        </Button>
      </div>

      {confirmationPayload ? (
        <ConfirmTransferModal
          open={isConfirmOpen}
          onClose={handleCloseConfirm}
          onConfirm={handleConfirmTransfer}
          recipientAddress={confirmationPayload.recipientAddress}
          ensName={confirmationPayload.ensName}
          amountWei={confirmationPayload.amountWei}
          estimatedFeeWei={gasEstimateWei}
          gasStatus={gasEstimateStatus}
        />
      ) : null}

      {toast ? (
        <div
          className={`${styles.toast} ${
            toast.kind === "success" ? styles.toastSuccess : styles.toastError
          }`}
          role="status"
          aria-live="assertive"
        >
          <div className={styles.toastBody}>
            <span>{toast.message}</span>
            {toast.txHash ? (
              <span className={styles.toastHash}>
                取引ID: {shortenHash(toast.txHash)}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.toastClose}
            onClick={dismissToast}
            aria-label="通知を閉じる"
          >
            x
          </button>
        </div>
      ) : null}
    </div>
  );
}
