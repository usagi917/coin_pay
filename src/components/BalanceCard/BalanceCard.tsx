import { type BalanceStatus } from "@/store/walletStore";
import styles from "./BalanceCard.module.css";

type BalanceCardProps = {
  amount: string;
  symbol: string;
  status?: BalanceStatus;
};

export function BalanceCard({
  amount,
  symbol,
  status = "idle",
}: BalanceCardProps) {
  const content = (() => {
    switch (status) {
      case "loading":
        return "読み込み中…";
      case "error":
        return "取得に失敗しました";
      case "idle":
        return "ウォレット未接続";
      case "ready":
        return amount;
      default:
        return "-";
    }
  })();

  return (
    <section className={styles.card} aria-label={`${symbol} 残高`}>
      <span className={styles.label}>残高</span>
      <div>
        <p className={styles.amount}>{content}</p>
        <p className={styles.symbol}>{symbol}</p>
      </div>
    </section>
  );
}
