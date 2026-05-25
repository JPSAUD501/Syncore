import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CellEditor } from "./CellEditor";

async function chooseMode(mode: string) {
  fireEvent.pointerDown(screen.getByRole("combobox", { name: "Edit as" }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse"
  });
  fireEvent.click(await screen.findByRole("option", { name: mode }));
}

describe("CellEditor", () => {
  beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.setPointerCapture ??= () => undefined;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it("edits booleans with a segmented true/false control", () => {
    const onSave = vi.fn();

    render(
      <CellEditor
        field="done"
        value={true}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole("combobox", { name: "Edit as" })).toHaveProperty(
      "disabled",
      true
    );
    fireEvent.click(screen.getByRole("button", { name: "false" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(false);
  });

  it("allows a detected color string to be edited as plain text", async () => {
    const onSave = vi.fn();

    render(
      <CellEditor
        field="color"
        value="#ff0000"
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getAllByDisplayValue("#ff0000").length).toBeGreaterThan(0);

    await chooseMode("Text");
    const textInput = screen.getByRole("textbox");
    fireEvent.change(textInput, { target: { value: "not a color" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("not a color");
  });

  it("allows a timestamp-like number to be edited as a raw number", async () => {
    const onSave = vi.fn();

    render(
      <CellEditor
        field="createdAt"
        value={1_710_000_000_000}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Edit as" }), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse"
    });
    expect(await screen.findByRole("option", { name: "Number" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "JSON" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Number" }));

    const numberInput = screen.getByRole("textbox");
    expect(numberInput).toHaveProperty("value", "1710000000000");

    fireEvent.change(numberInput, { target: { value: "1710000000001" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(1_710_000_000_001);
  });

  it("keeps object values in JSON mode and saves parsed objects", () => {
    const onSave = vi.fn();

    render(
      <CellEditor
        field="meta"
        value={{ count: 1 }}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    const jsonEditor = screen.getByRole("textbox");
    fireEvent.change(jsonEditor, { target: { value: '{ "count": 2 }' } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ count: 2 });
  });
});
