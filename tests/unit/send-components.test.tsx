import React, { type ComponentProps } from "react";
import { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { parseUnits } from "viem";
import type { Address } from "viem";
import { AmountInput } from "../../src/app/send/components/AmountInput";
import { RecipientInput } from "../../src/app/send/components/RecipientInput";
import { ERRORS } from "../../src/lib/i18n/messages";
import type { BalanceStatus } from "../../src/store/walletStore";
import { publicClient } from "../../src/lib/chain/client";

vi.mock("../../src/lib/chain/client", () => ({
  publicClient: {
    getEnsAddress: vi.fn(),
  },
}));

type Cleanup = () => void;

const getEnsAddressMock = publicClient.getEnsAddress as unknown as ReturnType<typeof vi.fn>;

function renderAmountInput(
  props: Partial<ComponentProps<typeof AmountInput>> = {}
): { container: HTMLElement; cleanup: Cleanup; onChange: ReturnType<typeof vi.fn> } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onAmountChange = vi.fn();

  const defaultProps: ComponentProps<typeof AmountInput> = {
    maxAmountWei: parseUnits("100", 18),
    balanceStatus: "ready",
    nativeBalanceStatus: "ready",
    nativeBalanceWei: 10_000_000_000_000_000n,
    estimatedFeeWei: 1_000_000_000_000n,
    onAmountChange,
  };

  act(() => {
    root.render(<AmountInput {...defaultProps} {...props} />);
  });

  const cleanup = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  return { container, cleanup, onChange: onAmountChange };
}

function clickKey(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.trim() === label
  );
  if (!button) {
    throw new Error(`Key button ${label} not found`);
  }

  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function inputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;

  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
}

describe("AmountInput", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("emits balance insufficient error when amount exceeds available balance", () => {
    const { container, cleanup, onChange } = renderAmountInput({
      maxAmountWei: parseUnits("100", 18),
      balanceStatus: "ready" as BalanceStatus,
      nativeBalanceStatus: "ready" as BalanceStatus,
      nativeBalanceWei: parseUnits("10", 18),
      estimatedFeeWei: 1_000_000_000n,
    });

    try {
      clickKey(container, "2");
      clickKey(container, "0");
      clickKey(container, "0");

      const lastCall = onChange.mock.calls.at(-1)?.[0];
      expect(lastCall).toBeDefined();
      expect(lastCall.errors).toContain(ERRORS.balanceInsufficient);
      expect(lastCall.status).toBe("valid");
    } finally {
      cleanup();
    }
  });

  it("emits gas insufficient error when native balance cannot cover estimated fee", () => {
    const { container, cleanup, onChange } = renderAmountInput({
      maxAmountWei: parseUnits("5", 18),
      balanceStatus: "ready" as BalanceStatus,
      nativeBalanceStatus: "ready" as BalanceStatus,
      nativeBalanceWei: 500n,
      estimatedFeeWei: 1_000n,
    });

    try {
      clickKey(container, "1");

      const lastCall = onChange.mock.calls.at(-1)?.[0];
      expect(lastCall).toBeDefined();
      expect(lastCall.errors).toContain(ERRORS.gasInsufficient);
      expect(lastCall.status).toBe("valid");
    } finally {
      cleanup();
    }
  });
});

describe("RecipientInput", () => {
  beforeEach(() => {
    getEnsAddressMock.mockReset();
    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      (
        callback: Parameters<typeof setTimeout>[0],
        _delay?: number,
        ...args: Parameters<typeof setTimeout> extends [any, ...infer R]
          ? R
          : never
      ) => {
        if (typeof callback === "function") {
          queueMicrotask(() => callback(...args));
        }
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
    );
    vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("resolves ENS names to addresses and emits valid event", async () => {
    const resolved = "0x0000000000000000000000000000000000000AAA" as Address;
    getEnsAddressMock.mockResolvedValue(resolved);

    const onChange = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(
      <RecipientInput onRecipientChange={onChange} />
    );

    try {
      expect(publicClient.getEnsAddress).toBe(getEnsAddressMock);
      const input = screen.getByLabelText("宛先") as HTMLInputElement;

      await user.type(input, "alice.eth");

      await act(async () => {
        await Promise.resolve();
      });

      const ensPromise = getEnsAddressMock.mock.results.at(-1)?.value;
      if (ensPromise) {
        await ensPromise;
      }

      console.log("success statuses before wait", onChange.mock.calls.map((call) => call[0].status));

      await waitFor(() => {
        expect(screen.getByText(/alice\.eth →/)).toBeInTheDocument();
      });

      expect(getEnsAddressMock).toHaveBeenCalledWith({ name: "alice.eth" });
      console.log("success statuses after wait", onChange.mock.calls.map((call) => call[0].status));
      expect(onChange.mock.calls.at(-1)?.[0].status).toBe("valid");
    } finally {
      unmount();
    }
  });

  it("marks ENS lookup as invalid when resolution returns null", async () => {
    getEnsAddressMock.mockResolvedValue(null);

    const onChange = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(
      <RecipientInput onRecipientChange={onChange} />
    );

    try {
      expect(publicClient.getEnsAddress).toBe(getEnsAddressMock);
      const input = screen.getByLabelText("宛先") as HTMLInputElement;

      await user.type(input, "missing.eth");

      await act(async () => {
        await Promise.resolve();
      });

      const failedEnsPromise = getEnsAddressMock.mock.results.at(-1)?.value;
      if (failedEnsPromise) {
        await failedEnsPromise;
      }

      console.log("failure statuses before wait", onChange.mock.calls.map((call) => call[0].status));

      await waitFor(() => {
        expect(
          screen.getByText(ERRORS.recipientInvalid)
        ).toBeInTheDocument();
      });

      expect(getEnsAddressMock).toHaveBeenCalledWith({ name: "missing.eth" });
      console.log("failure statuses after wait", onChange.mock.calls.map((call) => call[0].status));
      expect(onChange.mock.calls.at(-1)?.[0].error).toBe(ERRORS.recipientInvalid);
    } finally {
      unmount();
    }
  });
});
