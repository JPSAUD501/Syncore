import { describe, expect, it } from "vitest";
import { hasDoc } from "@/content/docs";
import {
  GLOSSARY,
  GLOSSARY_CATEGORIES,
  getTerm,
  termsByCategory
} from "./terms";

describe("glossary registry", () => {
  it("every term references a doc slug that resolves to an existing document", () => {
    // Guard-rail: a missing doc would produce a broken "Learn more" link.
    const missing = Object.values(GLOSSARY)
      .filter((term) => !hasDoc(term.docSlug))
      .map((term) => `${term.slug} → ${term.docSlug}`);

    expect(missing, `Broken doc references: ${missing.join(", ")}`).toEqual([]);
  });

  it("every term has a non-empty slug, title, short and docSlug", () => {
    for (const term of Object.values(GLOSSARY)) {
      expect(term.slug).toBeTruthy();
      expect(term.title).toBeTruthy();
      expect(term.short).toBeTruthy();
      expect(term.docSlug).toBeTruthy();
    }
  });

  it("every term's category is declared in GLOSSARY_CATEGORIES", () => {
    const declared = new Set(GLOSSARY_CATEGORIES.map((c) => c.category));
    for (const term of Object.values(GLOSSARY)) {
      expect(declared.has(term.category), `Unknown category ${term.category}`).toBe(true);
    }
  });

  it("getTerm returns the term for a known slug and undefined otherwise", () => {
    const first = Object.values(GLOSSARY)[0]!;
    expect(getTerm(first.slug)).toBe(first);
    expect(getTerm("__does_not_exist__")).toBeUndefined();
  });

  it("termsByCategory groups all terms under their category", () => {
    const grouped = termsByCategory();
    const totalGrouped = Object.values(grouped).reduce(
      (sum, terms) => sum + terms.length,
      0
    );
    expect(totalGrouped).toBe(Object.keys(GLOSSARY).length);
  });
});
