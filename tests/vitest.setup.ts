import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.fetch !== "function") {
  globalThis.fetch = vi.fn();
}
