import { useCallback } from "react";

export type AnalyticsScreen = "home" | "send" | "receive" | "unknown";

export type AnalyticsEventName =
  | "view"
  | "send"
  | "complete"
  | `error_${string}`;

export type TrackViewParams = {
  screen: AnalyticsScreen;
  address?: string | null;
  [key: string]: unknown;
};

export type TrackSendParams = {
  amountWei: bigint;
  counterparty?: string;
  ensName?: string | null;
  walletAddress?: string | null;
  txHash?: string;
  [key: string]: unknown;
};

export type TrackCompleteParams = {
  amountWei: bigint;
  txHash: string;
  counterparty?: string;
  durationMs?: number;
  [key: string]: unknown;
};

export type TrackErrorParams = {
  type: string;
  message?: string;
  stage?: string;
  txHash?: string;
  code?: string;
  [key: string]: unknown;
};

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  timestamp: string;
  properties: Record<string, unknown>;
};

const ANALYTICS_ENDPOINT =
  process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT?.trim() || null;
const SESSION_STORAGE_KEY = "palpay-analytics-session";

function ensureSessionId(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const storage = window.sessionStorage;
    const existing = storage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `session-${Date.now().toString(36)}-${Math.random()
            .toString(16)
            .slice(2)}`;

    storage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Failed to generate analytics session id", error);
    }
    return undefined;
  }
}

function serializeValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        serializeValue(entryValue),
      ])
    );
  }

  return value;
}

function dispatchEvent(event: AnalyticsEvent) {
  if (typeof window === "undefined") {
    return;
  }

  if (!window.palpayAnalyticsQueue) {
    window.palpayAnalyticsQueue = [];
  }
  window.palpayAnalyticsQueue.push(event);

  if (!ANALYTICS_ENDPOINT) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[analytics]", event);
    }
    return;
  }

  const payload = JSON.stringify(event, (_key, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  });

  try {
    if ("sendBeacon" in navigator) {
      const blob = new Blob([payload], { type: "application/json" });
      const success = navigator.sendBeacon(ANALYTICS_ENDPOINT, blob);
      if (success) {
        return;
      }
    }

    void fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
      body: payload,
    }).catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Analytics dispatch failed", error);
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Analytics dispatch failed", error);
    }
  }
}

type TrackEventParams = {
  name: AnalyticsEventName;
  properties?: Record<string, unknown>;
};

const sessionId = ensureSessionId();

function baseProperties(): Record<string, unknown> {
  const props: Record<string, unknown> = { source: "palpay-web" };
  if (sessionId) {
    props.sessionId = sessionId;
  }
  return props;
}

function trackEvent({ name, properties = {} }: TrackEventParams) {
  if (typeof window === "undefined") {
    return;
  }

  const mergedProps: Record<string, unknown> = {
    ...baseProperties(),
    ...serializeValue(properties),
  };

  const event: AnalyticsEvent = {
    name,
    timestamp: new Date().toISOString(),
    properties: mergedProps,
  };

  dispatchEvent(event);
}

export function useAnalytics() {
  const trackView = useCallback((params: TrackViewParams) => {
    const { screen, ...rest } = params;
    trackEvent({
      name: "view",
      properties: {
        screen,
        ...rest,
      },
    });
  }, []);

  const trackSend = useCallback((params: TrackSendParams) => {
    const { amountWei, ...rest } = params;
    trackEvent({
      name: "send",
      properties: {
        amountWei: amountWei.toString(),
        ...rest,
      },
    });
  }, []);

  const trackComplete = useCallback((params: TrackCompleteParams) => {
    const { amountWei, ...rest } = params;
    trackEvent({
      name: "complete",
      properties: {
        amountWei: amountWei.toString(),
        ...rest,
      },
    });
  }, []);

  const trackError = useCallback((params: TrackErrorParams) => {
    const { type, ...rest } = params;
    trackEvent({
      name: `error_${type}`,
      properties: rest,
    });
  }, []);

  return {
    trackEvent,
    trackView,
    trackSend,
    trackComplete,
    trackError,
  };
}

declare global {
  interface Window {
    palpayAnalyticsQueue?: AnalyticsEvent[];
  }
}

export type { AnalyticsEvent };
