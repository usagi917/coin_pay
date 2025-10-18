"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import type { Address } from "viem";
import { Button } from "@/components/Button/Button";
import { shortenAddress } from "@/lib/format/address";
import { getJpycContractAddress } from "@/lib/chain/config";
import { buildEip681TransferUri } from "@/lib/chain/eip681";
import { useAnalytics } from "@/lib/analytics";
import { useWalletStore } from "@/store/walletStore";
import styles from "./receive.module.css";

type FeedbackState =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | null;

function buildShareLink(
  tokenAddress: Address | null,
  recipient: Address | null
) {
  if (!tokenAddress || !recipient) {
    return null;
  }

  try {
    return buildEip681TransferUri({
      tokenAddress,
      recipient,
    });
  } catch (error) {
    console.error("Failed to build EIP-681 URI", error);
    return null;
  }
}

export function ReceiveScreen() {
  const router = useRouter();
  const address = useWalletStore((state) => state.address);
  const { trackView } = useAnalytics();
  const hasTrackedView = useRef(false);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<"idle" | "loading" | "error">(
    "idle"
  );
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const tokenAddress = getJpycContractAddress();

  const shareLink = useMemo(
    () => buildShareLink(tokenAddress, address),
    [tokenAddress, address]
  );

  useEffect(() => {
    if (!shareLink) {
      setQrDataUrl(null);
      setQrStatus("idle");
      return;
    }

    let cancelled = false;
    setQrStatus("loading");

    QRCode.toDataURL(shareLink, {
      width: 320,
      margin: 1,
      color: {
        dark: "#111111",
        light: "#FFFFFF",
      },
    })
      .then((url) => {
        if (cancelled) {
          return;
        }
        setQrDataUrl(url);
        setQrStatus("idle");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error("QR generation failed", error);
        setQrDataUrl(null);
        setQrStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [shareLink]);

  useEffect(() => {
    if (hasTrackedView.current) {
      return;
    }
    trackView({ screen: "receive", address: address ?? null });
    hasTrackedView.current = true;
  }, [trackView, address]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = setTimeout(() => {
      setFeedback(null);
    }, 3200);

    return () => clearTimeout(timeout);
  }, [feedback]);

  const shortenedAddress = address
    ? shortenAddress(address, { prefix: 8, suffix: 6 })
    : null;

  const linkPreview = shareLink
    ? shareLink.length > 60
      ? `${shareLink.slice(0, 48)}…${shareLink.slice(-6)}`
      : shareLink
    : null;

  const handleCopyAddress = async () => {
    if (!address) {
      return;
    }

    if (!navigator.clipboard) {
      setFeedback({
        kind: "error",
        message: "このブラウザはコピー機能に対応していません",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(address);
      setFeedback({ kind: "success", message: "アドレスをコピーしました" });
    } catch (error) {
      console.error("Address copy failed", error);
      setFeedback({ kind: "error", message: "コピーに失敗しました" });
    }
  };

  const handleCopyLink = async () => {
    if (!shareLink) {
      return;
    }

    if (!navigator.clipboard) {
      setFeedback({
        kind: "error",
        message: "このブラウザはコピー機能に対応していません",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(shareLink);
      setFeedback({ kind: "success", message: "リンクをコピーしました" });
    } catch (error) {
      console.error("Link copy failed", error);
      setFeedback({ kind: "error", message: "コピーに失敗しました" });
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) {
      setFeedback({
        kind: "error",
        message: "QRコードがまだ準備できていません",
      });
      return;
    }

    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = "palpay-jpyc-qr.png";
    link.rel = "noopener";
    link.click();
    setFeedback({ kind: "success", message: "QRコードを保存しました" });
  };

  const handleShareLink = async () => {
    if (!shareLink) {
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: "JPYC受け取りリンク",
          text: `このリンクを開くとJPYC送金がスムーズです。\n${shareLink}`,
        });
        setFeedback({ kind: "success", message: "共有を送信しました" });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Share failed", error);
        setFeedback({ kind: "error", message: "共有に失敗しました" });
        return;
      }
    }

    if (!navigator.clipboard) {
      setFeedback({
        kind: "error",
        message: "共有が未対応のためリンクをコピーできませんでした",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(shareLink);
      setFeedback({
        kind: "success",
        message: "共有に対応していないためリンクをコピーしました",
      });
    } catch (error) {
      console.error("Fallback share copy failed", error);
      setFeedback({ kind: "error", message: "共有に失敗しました" });
    }
  };

  const renderAddressSection = () => {
    if (!address) {
      return (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>ウォレット未接続</h2>
          <p className={styles.sectionBody}>
            受け取り用リンクを作成するにはウォレットを接続してください。
          </p>
          <Button onClick={() => router.push("/home")}>ホームへ戻る</Button>
        </section>
      );
    }

    return (
      <section className={styles.section} aria-live="polite">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>あなたのアドレス</span>
          <p className={styles.sectionHint}>
            このアドレス宛に JPYC
            を送ってもらえます。リンクを共有するとスムーズです。
          </p>
        </div>
        <div
          className={styles.addressBox}
          aria-label={`ウォレットアドレス ${address}`}
        >
          <span className={styles.addressValue} title={address}>
            {shortenedAddress}
          </span>
          <span className={styles.addressFull}>{address}</span>
        </div>
        <div className={styles.inlineActions}>
          <Button variant="secondary" onClick={handleCopyAddress}>
            アドレスをコピー
          </Button>
          <Button variant="ghost" onClick={() => router.push("/home")}>
            ホームに戻る
          </Button>
        </div>
      </section>
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>受け取る</h1>
        <p className={styles.description}>
          あなたのウォレットアドレスと JPYC
          の受け取りリンクをまとめました。相手に共有すると
          60秒以内で送ってもらえます。
        </p>
      </header>

      {feedback ? (
        <div
          className={`${styles.feedback} ${
            feedback.kind === "success"
              ? styles.feedbackSuccess
              : styles.feedbackError
          }`}
          role="status"
          aria-live="polite"
        >
          {feedback.message}
        </div>
      ) : null}

      {renderAddressSection()}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>EIP-681 リンク</span>
          <p className={styles.sectionHint}>
            ウォレットアプリで開くと宛先とトークンがセットされます。手数料用にテスト
            ETH が必要です。
          </p>
        </div>
        {shareLink ? (
          <>
            <div className={styles.linkBox}>
              <code className={styles.linkCode}>{linkPreview}</code>
              <Button variant="secondary" onClick={handleCopyLink}>
                リンクをコピー
              </Button>
            </div>
            <div className={styles.inlineActions}>
              <Button variant="primary" onClick={handleShareLink}>
                シェアする
              </Button>
              <Button variant="secondary" onClick={handleDownloadQr}>
                QRを保存
              </Button>
            </div>
          </>
        ) : (
          <p className={styles.sectionBody}>
            トークンアドレスが未設定のためリンクを生成できません。`.env.local`
            の <code>NEXT_PUBLIC_JPYC_ADDRESS</code> を確認してください。
          </p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>QR コード</span>
          <p className={styles.sectionHint}>
            相手に読み取ってもらうだけで送金画面を開けます。
          </p>
        </div>
        {!shareLink ? (
          <p className={styles.sectionBody}>
            先にアドレスとトークン設定を確認してください。リンクが生成されると
            QR コードも表示されます。
          </p>
        ) : qrStatus === "error" ? (
          <p className={styles.sectionBody}>
            QR
            コードの生成に失敗しました。ページを再読込しても改善しない場合はリンクを共有してください。
          </p>
        ) : qrDataUrl ? (
          <div className={styles.qrFrame}>
            <Image
              src={qrDataUrl}
              alt="JPYC 受け取り用のQRコード"
              width={260}
              height={260}
              className={styles.qrImage}
              unoptimized
            />
          </div>
        ) : (
          <p className={styles.sectionBody}>QR コードを準備しています…</p>
        )}
      </section>
    </div>
  );
}
