import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

describe("NotFound", () => {
  it("shows a 404 message and a link back to the shop", () => {
    render(<NotFound />);
    expect(screen.getByText(/doesn't exist/i)).toBeInTheDocument();
    expect(screen.getByText("Back to shop")).toHaveAttribute("href", "/");
  });
});
