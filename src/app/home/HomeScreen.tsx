"use client";

// biome-ignore assist/source/organizeImports: explanation
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EIP1193Provider } from "viem";
import { BalanceCard } from "@/components/BalanceCard/BalanceCard";
import { HistoryList } from "@/components/HistoryList/HistoryList";
import { Button } from "@/components/Button/Button";
import { JPYC_SYMBOL } from "@/lib/chain/constants";
import { useAnalytics } from "@/lib/analytics";
import { requestWalletAccount } from "@/lib/chain/wallet";
import { shortenAddress } from "@/lib/format/address";
import { useWalletStore } from "@/store/walletStore";
import styles from "./home.module.css";

function deriveConnectErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const lowered = error.message.toLowerCase();
    if (lowered.includes("sepolia") || lowered.includes("chain")) {
      return "Sepolia に切り替えてから再度お試しください";
    }
    if (lowered.includes("reject") || lowered.includes("denied")) {
      return "ウォレットで接続を許可してください";
    }
    if (lowered.includes("wallet")) {
      return "ウォレットが見つかりませんでした";
    }
  }

  return "ウォレット接続に失敗しました。拡張機能を確認してください。";
}

export function HomeScreen() {
  const router = useRouter();
  const address = useWalletStore((state) => state.address);
  const balance = useWalletStore((state) => state.balance);
  const balanceStatus = useWalletStore((state) => state.balanceStatus);
  const history = useWalletStore((state) => state.history);
  const setAddress = useWalletStore((state) => state.setAddress);
  const { trackView } = useAnalytics();
  const hasTrackedView = useRef(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      return;
    }
    useWalletStore
      .getState()
      .fetchBalance()
      .catch((error) => {
        console.error("Balance fetch failed", error);
      });
  }, [address]);

  useEffect(() => {
    if (hasTrackedView.current) {
      return;
    }
    trackView({ screen: "home", address: address ?? null });
    hasTrackedView.current = true;
  }, [trackView, address]);

  useEffect(() => {
    if (address) {
      setConnectError(null);
    }
  }, [address]);

  const handleConnectWallet = async () => {
    if (isConnecting) {
      return;
    }

    setIsConnecting(true);
    setConnectError(null);

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

      const account = await requestWalletAccount(provider);

      setAddress(account);

      const store = useWalletStore.getState();
      await Promise.allSettled([
        store.fetchBalance(),
        store.fetchNativeBalance(),
      ]);
    } catch (error) {
      console.error("Wallet connect failed", error);
      setConnectError(deriveConnectErrorMessage(error));
    } finally {
      setIsConnecting(false);
    }
  };

  const shortenedAddress = address ? shortenAddress(address) : null;

  return (
    <div className={styles.container}>
      <div className={styles.topRow}>
        <h1 className={styles.title}>PalPay</h1>
        {address ? (
          <output className={styles.connectionStatus} aria-live="polite">
            <span aria-hidden="true" className={styles.connectionIndicator} />
            <span>接続中: {shortenedAddress}</span>
          </output>
        ) : (
          <div className={styles.connectControls}>
            <Button
              variant="secondary"
              onClick={handleConnectWallet}
              disabled={isConnecting}
            >
              {isConnecting ? "接続中…" : "ウォレットに接続"}
            </Button>
          </div>
        )}
      </div>

      {!address && connectError ? (
        <p className={styles.connectError} role="alert">
          {connectError}
        </p>
      ) : null}

      <BalanceCard
        amount={balance}
        symbol={JPYC_SYMBOL}
        status={balanceStatus}
      />

      <section className={styles.section} aria-label="取引履歴セクション">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>直近の履歴</h2>
        </div>
        <HistoryList entries={history} />
      </section>

      <div className={styles.actions}>
        <Button onClick={() => router.push("/send")}>送る</Button>
        <Button variant="secondary" onClick={() => router.push("/receive")}>
          受け取る
        </Button>
      </div>
    </div>
  );
}
