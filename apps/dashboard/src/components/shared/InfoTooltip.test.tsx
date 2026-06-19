import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InfoTooltip } from "./InfoTooltip";
import { GLOSSARY } from "@/lib/glossary/terms";
import { useDocsModal } from "@/lib/docsModal";

// Radix HoverCard does not reliably open under jsdom (relies on pointer events
// + timers). Mock it as a pass-through that always renders its content, so we
// can deterministically assert on what InfoTooltip puts inside the card.
vi.mock("@/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  HoverCardTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  HoverCardContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="hover-card-content">{children}</div>
  )
}));

describe("InfoTooltip", () => {
  beforeEach(() => useDocsModal.setState({ open: false, slug: null }));
  afterEach(cleanup);

  it("renders its children as the trigger", () => {
    render(
      <InfoTooltip termSlug="storage.opfs">
        <span>opfs</span>
      </InfoTooltip>
    );
    // The card body (mocked pass-through) also renders the term title "opfs",
    // so the trigger text appears at least once.
    expect(screen.getAllByText("opfs").length).toBeGreaterThan(0);
  });

  it("shows the term short text and a learn-more button that opens the docs modal", () => {
    render(
      <InfoTooltip termSlug="fn.query" side="top">
        <span>Query</span>
      </InfoTooltip>
    );

    const term = GLOSSARY["fn.query"]!;
    expect(screen.getByText(term.short)).toBeTruthy();

    const learnMore = screen.getByRole("button", { name: /saiba mais/i });
    fireEvent.click(learnMore);

    expect(useDocsModal.getState().open).toBe(true);
    expect(useDocsModal.getState().slug).toBe(term.docSlug);
  });

  it("renders children unchanged when the term slug is unknown (graceful fail)", () => {
    const { container } = render(
      <InfoTooltip termSlug="__nope__">
        <span>keep me</span>
      </InfoTooltip>
    );
    expect(screen.getByText("keep me")).toBeTruthy();
    expect(container.querySelector("[data-testid='hover-card-content']")).toBeNull();
  });

  it("renders nothing when the slug is unknown and no children are given", () => {
    const { container } = render(<InfoTooltip termSlug="__nope__" />);
    expect(container.innerHTML).toBe("");
  });
});
