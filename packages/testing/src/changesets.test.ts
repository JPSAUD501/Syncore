import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkChangeset,
  checkPendingChangesets,
  isBreakingBump,
  parseChangeset,
  type ChangesetContext
} from "../../../scripts/check-changesets";
import { buildAutoChangesetSummary } from "../../../scripts/create-auto-syncore-changeset";

const context: ChangesetContext = {
  knownPackages: new Set(["syncorejs", "@syncore/core", "@syncore/cli"]),
  publishedVersion: "0.3.3"
};

function changeset(frontMatter: string, summary: string): string {
  return `---\n${frontMatter}\n---\n\n${summary}\n`;
}

describe("check-changesets", () => {
  it("accepts a descriptive patch changeset", () => {
    expect(
      checkChangeset(
        changeset(
          '"syncorejs": patch\n"@syncore/cli": patch',
          "Normalize boolean SQL parameters to SQLite integer bindings in the Node runtime."
        ),
        context
      )
    ).toEqual([]);
  });

  it("rejects generic summaries", () => {
    const problems = checkChangeset(
      changeset('"syncorejs": patch', "Improvements"),
      context
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("generic summary");

    expect(
      checkChangeset(changeset('"syncorejs": patch', "Bug fixes."), context)[0]
    ).toContain("generic summary");
  });

  it("rejects summaries that are too short to explain the change", () => {
    expect(
      checkChangeset(changeset('"syncorejs": patch', "Fix the CLI."), context)[0]
    ).toContain("3-word summary");
  });

  it("requires a migration section for a breaking syncorejs release", () => {
    const summary =
      "Object validators now reject fields they do not declare instead of dropping them.";

    expect(
      checkChangeset(changeset('"syncorejs": minor', summary), context)[0]
    ).toContain("breaking release");
    expect(
      checkChangeset(
        changeset(
          '"syncorejs": minor',
          `${summary}\n\n### Breaking changes / Migration\n\n- Remove extra fields from mutation calls.`
        ),
        context
      )
    ).toEqual([]);
    expect(
      checkChangeset(
        changeset('"syncorejs": major', `${summary}\n\n**Migration**: remove extra fields.`),
        { ...context, publishedVersion: "1.2.0" }
      )
    ).toEqual([]);
  });

  it("does not treat minor as breaking after 1.0 or for private packages", () => {
    const summary =
      "Add createTestSyncore for running functions against an in-memory runtime.";
    expect(
      checkChangeset(changeset('"syncorejs": minor', summary), {
        ...context,
        publishedVersion: "1.0.0"
      })
    ).toEqual([]);
    expect(
      checkChangeset(
        changeset('"@syncore/core": minor\n"syncorejs": patch', summary),
        context
      )
    ).toEqual([]);
  });

  it("reports unknown packages and bump types", () => {
    const problems = checkChangeset(
      changeset(
        '"syncore": patch\n"syncorejs": huge',
        "Rename the package and bump everything at once for the next release."
      ),
      context
    );
    expect(problems).toEqual([
      'releases "syncore", which is not a workspace package.',
      'uses "huge" for "syncorejs"; use patch, minor or major.'
    ]);
  });

  it("reports a changeset without front matter", () => {
    expect(
      checkChangeset("Just some text about the release.", context)
    ).toEqual(["is missing the --- front matter block."]);
  });

  it("reads front matter with a BOM, CRLF line endings and single quotes", () => {
    expect(
      parseChangeset(
        "﻿---\r\n'syncorejs': patch\r\n---\r\n\r\nSummary text.\r\n"
      )
    ).toEqual({
      releases: [{ name: "syncorejs", type: "patch" }],
      summary: "Summary text."
    });
  });

  it("treats major, and minor before 1.0, as breaking", () => {
    expect(isBreakingBump("major", "2.0.0")).toBe(true);
    expect(isBreakingBump("minor", "0.3.3")).toBe(true);
    expect(isBreakingBump("minor", "1.0.0")).toBe(false);
    expect(isBreakingBump("patch", "0.3.3")).toBe(false);
  });

  it("passes on the repository's pending changesets", async () => {
    const results = await checkPendingChangesets(
      path.resolve(import.meta.dirname, "..", "..", "..")
    );
    expect(results.filter((result) => result.problems.length > 0)).toEqual([]);
  });
});

describe("buildAutoChangesetSummary", () => {
  it("lists the commits since the last release", () => {
    expect(
      buildAutoChangesetSummary({
        subjects: [
          "fix(cli): authenticate local target discovery (#23)",
          "chore: version packages (#22)",
          "fix(node): normalize boolean SQLite parameters (#21)",
          ""
        ],
        since: "syncorejs@0.3.0",
        changedFileCount: 12
      })
    ).toBe(
      [
        "Changes since syncorejs@0.3.0:",
        "",
        "- fix(cli): authenticate local target discovery (#23)",
        "- fix(node): normalize boolean SQLite parameters (#21)"
      ].join("\n")
    );
  });

  it("falls back to a file count when there are no commit subjects", () => {
    expect(
      buildAutoChangesetSummary({
        subjects: ["chore(release): version packages"],
        since: undefined,
        changedFileCount: 4
      })
    ).toBe(
      "Patch release for 4 changed file(s) in the published syncorejs package."
    );
  });

  it("produces a summary the changeset check accepts", () => {
    const summary = buildAutoChangesetSummary({
      subjects: ["fix(node): normalize boolean SQLite parameters (#21)"],
      since: "syncorejs@0.3.2",
      changedFileCount: 3
    });
    expect(checkChangeset(changeset('"syncorejs": patch', summary), context)).toEqual(
      []
    );
  });
});
