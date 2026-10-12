import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContactForm } from "./ContactForm";

describe("ContactForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("submits and shows the confirmation on success", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ContactForm />);
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Jane" } });
    fireEvent.change(screen.getByPlaceholderText("Your email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("How can we help?"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByText("Send message"));
    await waitFor(() => expect(screen.getByText(/we'll get back to you/i)).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/contact/"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows an error message when the request fails", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<ContactForm />);
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Jane" } });
    fireEvent.change(screen.getByPlaceholderText("Your email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("How can we help?"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByText("Send message"));
    await waitFor(() => expect(screen.getByText(/could not send/i)).toBeInTheDocument());
  });
});
