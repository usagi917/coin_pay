"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import { formatUnits, parseUnits } from "viem";
import { JPYC_DECIMALS, JPYC_SYMBOL } from "@/lib/chain/constants";
import { formatJpycAmount } from "@/lib/chain/jpyc";
import { ERRORS } from "@/lib/i18n/messages";
import type { BalanceStatus } from "@/store/walletStore";
import styles from "./AmountInput.module.css";

const MAX_DECIMAL_DIGITS = 6;
const MAX_INTEGER_DIGITS = 9;

const KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ".",
  "0",
  "削除",
] as const;

type KeyValue = (typeof KEYS)[number];

export type AmountStatus = "empty" | "invalid" | "valid";

export type AmountChangeEvent = {
  input: string;
  amountWei: bigint;
  status: AmountStatus;
  isMax: boolean;
  errors: string[];
};

type AmountInputProps = {
  maxAmountWei: bigint;
  balanceStatus: BalanceStatus;
  nativeBalanceWei: bigint;
  nativeBalanceStatus: BalanceStatus;
  estimatedFeeWei: bigint | null;
  onAmountChange?: (event: AmountChangeEvent) => void;
};

function trimTrailingZeros(value: string) {
  if (!value.includes(".")) {
    return value;
  }

  const [integer, fractional = ""] = value.split(".");
  const trimmedFraction = fractional.replace(/0+$/, "");

  return trimmedFraction ? `${integer}.${trimmedFraction}` : integer;
}

function sanitizeValue(value: string) {
  if (!value) {
    return "";
  }

  const cleaned = value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");

  const parts = cleaned.split(".");
  if (parts.length === 1) {
    const integers = parts[0].replace(/^0+(\d)/, "$1");
    return integers || "0";
  }

  const integerPart = parts[0] || "0";
  const sanitizedInteger = integerPart.replace(/^0+(\d)/, "$1") || "0";
  const fractionalPart = parts[1]?.slice(0, MAX_DECIMAL_DIGITS) ?? "";
  return fractionalPart
    ? `${sanitizedInteger}.${fractionalPart}`
    : sanitizedInteger;
}

function appendCharacter(current: string, key: KeyValue) {
  if (key === "削除") {
    if (!current) {
      return "";
    }
    const next = current.slice(0, -1);
    if (next === "0" || next === "") {
      return "";
    }
    return next;
  }

  if (key === ".") {
    if (!current) {
      return "0.";
    }
    if (current.includes(".")) {
      return current;
    }
    return `${current}.`;
  }

  if (!current) {
    return key;
  }

  if (current === "0") {
    return key;
  }

  const [integerPart, fractionalPart] = current.split(".");

  if (!fractionalPart) {
    if (integerPart.replace(/^0+/, "").length >= MAX_INTEGER_DIGITS) {
      return current;
    }
    return `${current}${key}`;
  }

  if (fractionalPart.length >= MAX_DECIMAL_DIGITS) {
    return current;
  }

  return `${current}${key}`;
}

export function AmountInput({
  maxAmountWei,
  balanceStatus,
  nativeBalanceWei,
  nativeBalanceStatus,
  estimatedFeeWei,
  onAmountChange,
}: AmountInputProps) {
  const [value, setValue] = useState("");

  const amountComputation = useMemo(() => {
    if (!value || value === ".") {
      return { amountWei: 0n, status: "empty" as AmountStatus };
    }

    const normalized = value.endsWith(".") ? value.slice(0, -1) : value;
    if (!normalized) {
      return { amountWei: 0n, status: "empty" as AmountStatus };
    }

    try {
      const amountWei = parseUnits(normalized, JPYC_DECIMALS);
      if (amountWei === 0n) {
        return { amountWei, status: "empty" as AmountStatus };
      }
      return { amountWei, status: "valid" as AmountStatus };
    } catch (error) {
      console.error("Failed to parse amount", error);
      return { amountWei: 0n, status: "invalid" as AmountStatus };
    }
  }, [value]);

  const insufficientBalance =
    amountComputation.status === "valid" &&
    balanceStatus === "ready" &&
    amountComputation.amountWei > maxAmountWei;

  const gasInsufficient =
    amountComputation.status === "valid" &&
    amountComputation.amountWei > 0n &&
    estimatedFeeWei !== null &&
    estimatedFeeWei > 0n &&
    nativeBalanceStatus === "ready" &&
    nativeBalanceWei < estimatedFeeWei;

  const errorMessages = useMemo(() => {
    const errors: string[] = [];
    if (amountComputation.status === "invalid") {
      errors.push("金額が正しくありません");
    }
    if (insufficientBalance) {
      errors.push(ERRORS.balanceInsufficient);
    }
    if (gasInsufficient) {
      errors.push(ERRORS.gasInsufficient);
    }
    return errors;
  }, [amountComputation.status, insufficientBalance, gasInsufficient]);

  const isMaxSelected =
    amountComputation.status === "valid" &&
    amountComputation.amountWei === maxAmountWei &&
    maxAmountWei > 0n &&
    balanceStatus === "ready";

  useEffect(() => {
    if (!onAmountChange) {
      return;
    }

    onAmountChange({
      input: value,
      amountWei: amountComputation.amountWei,
      status: amountComputation.status,
      isMax: isMaxSelected,
      errors: errorMessages,
    });
  }, [amountComputation, errorMessages, isMaxSelected, onAmountChange, value]);

  const handleKey = useCallback((key: KeyValue) => {
    setValue((prev) => {
      const cleaned = sanitizeValue(prev);
      const next = appendCharacter(cleaned, key);
      return sanitizeValue(next);
    });
  }, []);

  const handleAll = useCallback(() => {
    if (maxAmountWei === 0n) {
      setValue("");
      return;
    }
    const formatted = formatUnits(maxAmountWei, JPYC_DECIMALS);
    setValue(trimTrailingZeros(formatted));
  }, [maxAmountWei]);

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const { key } = event;

      if (/^\d$/.test(key)) {
        event.preventDefault();
        handleKey(key as KeyValue);
        return;
      }

      if (key === ".") {
        event.preventDefault();
        handleKey(".");
        return;
      }

      if (key === "Backspace") {
        event.preventDefault();
        handleKey("削除");
        return;
      }

      if (key === "Delete") {
        event.preventDefault();
        setValue("");
      }
    },
    [handleKey]
  );

  const availableBalance = useMemo(
    () => formatJpycAmount(maxAmountWei),
    [maxAmountWei]
  );
  const hasErrors = errorMessages.length > 0;

  return (
    <div className={styles.container}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor="send-amount">
          金額
        </label>
        <span className={styles.balanceHint}>
          利用可能: {availableBalance} {JPYC_SYMBOL}
        </span>
      </div>

      <div className={styles.displayWrapper}>
        <div
          className={`${styles.displayBox} ${hasErrors ? styles.displayBoxError : ""}`.trim()}
          aria-live="polite"
        >
          <span className={styles.symbol}>{JPYC_SYMBOL}</span>
          <input
            id="send-amount"
            className={styles.input}
            value={value}
            placeholder="0"
            readOnly
            inputMode="decimal"
            onKeyDown={handleInputKeyDown}
            aria-invalid={hasErrors}
            aria-describedby="send-amount-messages"
          />
        </div>
        <button type="button" className={styles.allButton} onClick={handleAll}>
          全額
        </button>
      </div>

      <div className={styles.keypad} aria-hidden="false">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={styles.keypadButton}
            onClick={() => handleKey(key)}
            aria-label={key === "削除" ? "1文字削除" : `${key} を入力`}
          >
            {key}
          </button>
        ))}
      </div>

      <div
        className={styles.messages}
        id="send-amount-messages"
        aria-live="polite"
      >
        {balanceStatus === "loading" ? (
          <p className={styles.statusLine}>残高を更新しています…</p>
        ) : null}
        {nativeBalanceStatus === "loading" ? (
          <p className={styles.statusLine}>手数料用ETH残高を確認しています…</p>
        ) : null}
        {errorMessages.map((message) => (
          <p key={message} className={styles.messageError}>
            {message}
          </p>
        ))}
        {isMaxSelected ? (
          <p className={styles.messageInfo}>全額を選択しました。</p>
        ) : null}
      </div>
    </div>
  );
}
