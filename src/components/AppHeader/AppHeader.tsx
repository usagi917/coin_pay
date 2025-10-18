import { COPY } from "@/lib/i18n/messages";
import styles from "./AppHeader.module.css";

export function AppHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.badges}>
        <span className={styles.badge}>テストネット</span>
        <span className={`${styles.badge} ${styles.badgeSecondary}`}>
          Ethereum（Sepolia）
        </span>
      </div>
      <p className={styles.notice}>{COPY.homeNetworkNotice}</p>
    </header>
  );
}
