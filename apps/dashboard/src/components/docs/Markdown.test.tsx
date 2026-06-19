import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Markdown } from "./Markdown";
import { useDocsModal } from "@/lib/docsModal";

describe("Markdown", () => {
  beforeEach(() => useDocsModal.setState({ open: false, slug: null }));
  afterEach(cleanup);

  it("renders headings, paragraphs, code and lists", () => {
    render(
      <Markdown>{`# Title

Some **bold** text.

- one
- two

` + "`code`"}</Markdown>
    );
    expect(screen.getByText("Title").tagName).toBe("H1");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("one")).toBeTruthy();
    expect(screen.getByText("two")).toBeTruthy();
    expect(screen.getByText("code").tagName).toBe("CODE");
  });

  it("renders a GitHub-flavored markdown table", () => {
    render(
      <Markdown>{`| A | B |
| --- | --- |
| 1 | 2 |`}</Markdown>
    );
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("renders internal /docs links and opens the docs modal on click", () => {
    render(<Markdown>{`See [storage](/docs/storage-protocols).`}</Markdown>);
    const link = screen.getByText("storage");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/docs/storage-protocols");

    fireEvent.click(link);
    expect(useDocsModal.getState().open).toBe(true);
    expect(useDocsModal.getState().slug).toBe("storage-protocols");
  });

  it("renders external links with target=_blank", () => {
    render(<Markdown>{`[site](https://example.com)`}</Markdown>);
    const link = screen.getByText("site");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
