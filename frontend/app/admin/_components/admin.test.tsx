import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toast";
import { AdminLogin } from "./AdminLogin";
import { computeStats, formatMoney, formatRelative, humanizeAudit, initials, type Order } from "./ui";

function order(overrides: Partial<Order> = {}): Order {
  return { id: "o1", items: [], total: 10, status: "placed", created_at: new Date().toISOString(), ...overrides };
}

describe("ui helpers", () => {
  it("revenue and average exclude cancelled orders", () => {
    const stats = computeStats(
      [order({ total: 30 }), order({ total: 10, status: "delivered" }), order({ total: 500, status: "cancelled" })],
      []
    );
    expect(stats.revenue).toBe(40);
    expect(stats.averageOrder).toBe(20);
    expect(stats.countedOrders).toBe(2);
    expect(stats.openOrders).toBe(1);
  });

  it("formats money, relative time and initials", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    const now = Date.parse("2026-10-14T12:00:00Z");
    expect(formatRelative("2026-10-14T11:59:50Z", now)).toBe("just now");
    expect(formatRelative("2026-10-14T09:00:00Z", now)).toBe("3 hours ago");
    expect(initials("jane.doe")).toBe("JD");
    expect(initials("shameel")).toBe("SH");
  });

  it("humanises audit details", () => {
    expect(humanizeAudit({ action: "block_change", details: { is_blocked: true } })).toBe("blocked");
    expect(humanizeAudit({ action: "role_change", details: { new_role: "lister" } })).toBe("now lister");
  });
});

function ConfirmHarness({ onResult }: { onResult: (ok: boolean) => void }) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button onClick={async () => onResult(await confirm({ title: "Sure?", confirmLabel: "Do it" }))}>ask</button>
      {dialog}
    </>
  );
}

describe("useConfirm", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  });

  it("resolves true on confirm and false on cancel", async () => {
    const results: boolean[] = [];
    render(<ConfirmHarness onResult={(ok) => results.push(ok)} />);
    fireEvent.click(screen.getByText("ask"));
    await act(async () => fireEvent.click(await screen.findByText("Do it")));
    fireEvent.click(screen.getByText("ask"));
    await act(async () => fireEvent.click(await screen.findByText("Cancel")));
    expect(results).toEqual([true, false]);
  });

  it("resolves false on Escape", async () => {
    const results: boolean[] = [];
    const { container } = render(<ConfirmHarness onResult={(ok) => results.push(ok)} />);
    fireEvent.click(screen.getByText("ask"));
    await screen.findByText("Do it");
    await act(async () => {
      fireEvent(container.querySelector("dialog")!, new Event("cancel", { cancelable: true }));
    });
    expect(results).toEqual([false]);
  });
});

function ToastHarness() {
  const { notify, toaster } = useToast();
  return (
    <>
      <button onClick={() => notify("Saved!")}>go</button>
      {toaster}
    </>
  );
}

describe("useToast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the message in a polite live region and auto-dismisses", () => {
    render(<ToastHarness />);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByText("Saved!").closest("[aria-live='polite']")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByText("Saved!")).toBeNull();
  });
});

describe("AdminLogin", () => {
  it("toggles password visibility, links to forgot-password and shows the session notice", () => {
    render(<AdminLogin sessionNotice="Your session expired." />);
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.type).toBe("text");
    expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe("/forgot-password");
    expect(screen.getByText("Your session expired.")).toBeTruthy();
  });

  it("renders a failed login as an alert", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ detail: "Bad credentials" }) }));
    render(<AdminLogin />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign in" })));
    expect((await screen.findByRole("alert")).textContent).toContain("Bad credentials");
    vi.unstubAllGlobals();
  });
});
