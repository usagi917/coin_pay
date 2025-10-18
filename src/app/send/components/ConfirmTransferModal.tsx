"use client";

import { useEffect, useMemo, useRef } from "react";
import type { MouseEvent } from "react";
import type { Address } from "viem";
import { formatEther } from "viem";
import { Button } from "@/components/Button/Button";
import { formatJpycAmount } from "@/lib/chain/jpyc";
import styles from "./ConfirmTransferModal.module.css";
import { shortenAddress } from "@/lib/format/address";
import { COPY } from "@/lib/i18n/messages";

type ConfirmTransferModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  recipientAddress: Address;
  ensName?: string;
  amountWei: bigint;
  estimatedFeeWei: bigint | null;
  gasStatus: "idle" | "loading" | "ready" | "error";
};

function formatEth(value: bigint) {
  const formatted = formatEther(value);
  const [integerPart, fractionalPart = ""] = formatted.split(".");
  const trimmedFraction = fractionalPart.replace(/0+$/, "").slice(0, 6);
  if (!trimmedFraction) {
    return integerPart;
  }
  return `${integerPart}.${trimmedFraction}`;
}

const FOCUSABLE_SELECTORS =
  'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmTransferModal({
  open,
  onClose,
  onConfirm,
  recipientAddress,
  ensName,
  amountWei,
  estimatedFeeWei,
  gasStatus,
}: ConfirmTransferModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const amountText = useMemo(() => formatJpycAmount(amountWei), [amountWei]);

  const feeText = useMemo(() => {
    if (!estimatedFeeWei || gasStatus !== "ready") {
      return null;
    }
    try {
      return formatEth(estimatedFeeWei);
    } catch (error) {
      console.error("Failed to format fee", error);
      return null;
    }
  }, [estimatedFeeWei, gasStatus]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const node = dialogRef.current;
    if (!node) {
      return;
    }

    const previousActiveElement = document.activeElement as HTMLElement | null;

    const focusFirstElement = () => {
      const focusable = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        node.focus();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (
          document.activeElement === first ||
          document.activeElement === node
        ) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    requestAnimationFrame(focusFirstElement);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousActiveElement && previousActiveElement.focus) {
        previousActiveElement.focus();
      }
    };
  }, [open, onClose]);

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!open) {
    return null;
  }

  const displayRecipient = ensName
    ? `${ensName} (${recipientAddress})`
    : recipientAddress;

  const totalDescriptor = feeText
    ? `${amountText} JPYC + 手数料 約${feeText} ETH`
    : `${amountText} JPYC`;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-transfer-heading"
        tabIndex={-1}
      >
        <div>
          <h2 id="confirm-transfer-heading" className={styles.title}>
            送金内容を確認
          </h2>
          <p className={styles.caption}>
            送金はまだ行われていません。内容を確認してから進みましょう。
          </p>
        </div>

        <div className={styles.summary}>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>宛先</span>
            <span
              className={styles.summaryValue}
              title={displayRecipient}
              aria-live="polite"
            >
              {ensName
                ? `${ensName} (${shortenAddress(recipientAddress)})`
                : recipientAddress}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>送金金額</span>
            <span className={styles.summaryValue}>{amountText} JPYC</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>ネットワーク利用料</span>
            <span className={styles.summaryValue}>
              {feeText ? `約${feeText} ETH` : "取得できませんでした"}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>合計（ガス込み）</span>
            <span className={styles.summaryValue}>{totalDescriptor}</span>
            <span className={styles.summaryNote}>{COPY.feeNote}</span>
          </div>
        </div>

        <div className={styles.arrivalBox}>
          <span className={styles.arrivalLabel}>到着目安</span>
          <span className={styles.arrivalValue}>約30秒</span>
        </div>

        {gasStatus === "error" ? (
          <p className={styles.errorMessage}>
            手数料が取得できませんでした。ネットワーク状況を確認してから再度お試しください。
          </p>
        ) : (
          <p className={styles.hint}>
            内容に問題がなければ「送金する」をタップしてください。
          </p>
        )}

        <div className={styles.actions}>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={gasStatus !== "ready"}
          >
            送金する
          </Button>
          <Button variant="ghost" onClick={onClose}>
            修正する
          </Button>
        </div>
      </div>
    </div>
  );
}
