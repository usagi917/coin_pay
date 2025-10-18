import { type HistoryEntry } from "@/types/history";
import styles from "./HistoryList.module.css";

type HistoryListProps = {
  entries: HistoryEntry[];
};

export function HistoryList({ entries }: HistoryListProps) {
  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        まだ履歴がありません。送金するとここに表示されます。
      </div>
    );
  }

  return (
    <ul className={styles.list} aria-label="直近の送受信履歴">
      {entries.slice(0, 3).map((entry) => (
        <li key={entry.id} className={styles.item}>
          <div className={styles.details}>
            <span className={styles.counterparty}>{entry.counterparty}</span>
            <span className={styles.timestamp}>{entry.timestamp}</span>
            <span className={styles.status}>
              {entry.status === "completed"
                ? "完了"
                : entry.status === "pending"
                  ? "保留中"
                  : "失敗"}
            </span>
          </div>
          <span
            className={`${styles.amount} ${
              entry.direction === "in"
                ? styles.directionIn
                : styles.directionOut
            }`}
          >
            {entry.direction === "in" ? "+" : "-"}
            {entry.amount}
          </span>
        </li>
      ))}
    </ul>
  );
}
