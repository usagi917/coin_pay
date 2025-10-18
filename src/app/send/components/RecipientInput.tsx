"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { Address } from "viem";
import { getAddress, isAddress } from "viem";
import { publicClient } from "@/lib/chain/client";
import { ERRORS } from "@/lib/i18n/messages";
import styles from "./RecipientInput.module.css";

const ENS_DEBOUNCE_MS = 400;

export type RecipientStatus = "empty" | "resolving" | "invalid" | "valid";
export type RecipientSource = "direct" | "ens" | null;
export type RecipientWarning = "paste_detected" | "checksum_hint";

export type RecipientChangeEvent = {
  input: string;
  status: RecipientStatus;
  address: Address | null;
  ensName?: string;
  source: RecipientSource;
  warnings: RecipientWarning[];
  error?: string;
};

type RecipientInputProps = {
  defaultValue?: string;
  onRecipientChange?: (event: RecipientChangeEvent) => void;
};

function looksLikeEnsName(value: string) {
  return value.includes(".") && !value.startsWith("0x");
}

export function RecipientInput({
  defaultValue = "",
  onRecipientChange,
}: RecipientInputProps) {
  const [input, setInput] = useState(defaultValue.trim());
  const [status, setStatus] = useState<RecipientStatus>(
    defaultValue ? "resolving" : "empty"
  );
  const [address, setAddress] = useState<Address | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [ensName, setEnsName] = useState<string | undefined>();
  const [source, setSource] = useState<RecipientSource>(null);
  const [checksumHint, setChecksumHint] = useState(false);
  const [pasteDetected, setPasteDetected] = useState(false);
  const pasteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ensDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const warnings = useMemo(() => {
    const active: RecipientWarning[] = [];
    if (pasteDetected) {
      active.push("paste_detected");
    }
    if (checksumHint) {
      active.push("checksum_hint");
    }
    return active;
  }, [pasteDetected, checksumHint]);

  const cancelEnsDebounce = useCallback(() => {
    if (ensDebounceRef.current) {
      clearTimeout(ensDebounceRef.current);
      ensDebounceRef.current = null;
    }
  }, []);

  const resetPasteWarning = useCallback(() => {
    if (pasteTimeoutRef.current) {
      clearTimeout(pasteTimeoutRef.current);
      pasteTimeoutRef.current = null;
    }
  }, []);

  const notifyChange = useCallback(() => {
    if (!onRecipientChange) {
      return;
    }

    onRecipientChange({
      input,
      status,
      address,
      ensName,
      source,
      warnings,
      error,
    });
  }, [
    address,
    ensName,
    error,
    input,
    onRecipientChange,
    source,
    status,
    warnings,
  ]);

  useEffect(() => {
    notifyChange();
  }, [notifyChange]);

  useEffect(() => {
    return () => {
      resetPasteWarning();
      cancelEnsDebounce();
    };
  }, [cancelEnsDebounce, resetPasteWarning]);

  const handleDirectAddress = useCallback(
    (candidate: string) => {
      const sanitized = candidate.trim();

      cancelEnsDebounce();

      if (!sanitized) {
        setStatus("empty");
        setAddress(null);
        setError(undefined);
        setChecksumHint(false);
        setSource(null);
        setEnsName(undefined);
        return;
      }

      const strictValid = isAddress(sanitized, { strict: true });
      if (!strictValid) {
        if (isAddress(sanitized)) {
          setChecksumHint(true);
        } else {
          setChecksumHint(false);
        }

        setStatus("invalid");
        setAddress(null);
        setSource(null);
        setEnsName(undefined);
        setError(ERRORS.recipientInvalid);
        return;
      }

      try {
        const formatted = getAddress(sanitized);
        setAddress(formatted);
        setStatus("valid");
        setError(undefined);
        setChecksumHint(false);
        setSource("direct");
        setEnsName(undefined);
      } catch (validationError) {
        console.error("Address formatting failed", validationError);
        setAddress(null);
        setStatus("invalid");
        setSource(null);
        setEnsName(undefined);
        setError(ERRORS.recipientInvalid);
      }
    },
    [cancelEnsDebounce]
  );

  const resolveEns = useCallback(
    (name: string) => {
      cancelEnsDebounce();

      setEnsName(name);
      setStatus("resolving");
      setAddress(null);
      setSource(null);
      setError(undefined);
      setChecksumHint(false);

      const normalized = name.trim().toLowerCase();
      ensDebounceRef.current = setTimeout(async () => {
        try {
          const resolved = await publicClient.getEnsAddress({
            name: normalized,
          });

          if (input !== name) {
            return;
          }

          if (!resolved) {
            setStatus("invalid");
            setError(ERRORS.recipientInvalid);
            setAddress(null);
            setSource(null);
            return;
          }

          setAddress(resolved);
          setStatus("valid");
          setSource("ens");
          setError(undefined);
        } catch (ensError) {
          console.error("ENS resolution failed", ensError);
          setStatus("invalid");
          setAddress(null);
          setSource(null);
          setError(ERRORS.networkUnstable);
        }

        ensDebounceRef.current = null;
      }, ENS_DEBOUNCE_MS);
    },
    [cancelEnsDebounce, input]
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value.trim();
      setInput(value);

      if (!value) {
        setEnsName(undefined);
        handleDirectAddress(value);
        return;
      }

      if (looksLikeEnsName(value)) {
        resolveEns(value);
        return;
      }

      setEnsName(undefined);
      cancelEnsDebounce();
      handleDirectAddress(value);
    },
    [cancelEnsDebounce, handleDirectAddress, resolveEns]
  );

  const handlePaste = useCallback(() => {
    resetPasteWarning();
    setPasteDetected(true);
    pasteTimeoutRef.current = setTimeout(() => {
      setPasteDetected(false);
      pasteTimeoutRef.current = null;
    }, 8000);
  }, [resetPasteWarning]);

  const showEnsMessage = status === "valid" && source === "ens" && address;
  const showResolving = status === "resolving";
  const inputClassName = [
    styles.input,
    status === "invalid" ? styles.inputInvalid : "",
    status === "valid" ? styles.inputValid : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.container}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor="recipient-address">
          宛先
        </label>
        {showResolving ? (
          <span className={styles.statusPill}>ENSを確認しています…</span>
        ) : null}
        {showEnsMessage ? (
          <span className={styles.statusPill}>ENS 解決済み</span>
        ) : null}
      </div>

      <div className={styles.inputWrapper}>
        <input
          id="recipient-address"
          className={inputClassName}
          value={input}
          onChange={handleChange}
          onPaste={handlePaste}
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          placeholder="ウォレットアドレスまたは ENS 名"
          aria-invalid={status === "invalid"}
          aria-describedby="recipient-messages"
        />
        <div className={styles.messages} id="recipient-messages">
          {error ? (
            <p className={`${styles.message} ${styles.messageError}`}>
              {error}
            </p>
          ) : null}

          {checksumHint ? (
            <p className={`${styles.message} ${styles.messageInfo}`}>
              大文字・小文字を含むEIP-55形式で貼り付けてください。
            </p>
          ) : null}

          {showEnsMessage ? (
            <p className={`${styles.message} ${styles.messageSuccess}`}>
              {ensName} → {address}
            </p>
          ) : null}

          {pasteDetected ? (
            <p className={`${styles.message} ${styles.messageWarning}`}>
              ペーストした宛先をもう一度ご確認ください。
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
