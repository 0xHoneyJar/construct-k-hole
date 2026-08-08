/**
 * Regression test for issue #14: the K-Hole manifest must declare `source_repo`
 * so `.claude/scripts/construct-attribution.sh` can route feedback to the vendor
 * repo. Without it, attribution resolves an empty source_repo and routing falls
 * back to the generic 4-repo path.
 *
 * Dependency-free: no YAML parser is available, so we parse `construct.yaml` as
 * text and mirror the attribution script's `owner/repo` validation regex.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MANIFEST_PATH = fileURLToPath(new URL("../../construct.yaml", import.meta.url));
const manifest = readFileSync(MANIFEST_PATH, "utf8");

// Same format the attribution script enforces (Level 1 validation).
const SOURCE_REPO_LINE = /^source_repo:\s*(["']?)([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\1\s*$/m;

test("construct.yaml declares a top-level source_repo", () => {
  assert.match(
    manifest,
    SOURCE_REPO_LINE,
    "construct.yaml is missing a valid top-level `source_repo: owner/repo` field",
  );
});

test("source_repo is the K-Hole vendor repo", () => {
  const m = manifest.match(SOURCE_REPO_LINE);
  assert.ok(m, "source_repo field not found");
  assert.equal(m[2], "0xHoneyJar/construct-k-hole");
});
