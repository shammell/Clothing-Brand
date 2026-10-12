import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => new URLSearchParams("token=super-secret-reset-token"),
}));

import ResetPasswordPage from "./page";

describe("ResetPasswordPage", () => {
  it("strips the token out of the URL once it has read it, so it doesn't linger in browser history or get captured by page-view analytics", () => {
    render(<ResetPasswordPage />);
    expect(replace).toHaveBeenCalledWith("/reset-password");
  });
});
