import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pushProblems, publishSync, remoteProblems, type PushUpdate } from "./publish.ts";

const URL = "git@github.com:Manumac86/job-radar.git";
let dir: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function commit(file: string, text: string): string {
  writeFileSync(join(dir, file), text);
  git("add", file);
  git("commit", "-q", "-m", `edit ${file}`);
  return git("rev-parse", "HEAD");
}

function push(localRef: string, localSha: string, remoteRef = "refs/heads/main"): PushUpdate[] {
  return [{ localRef, localSha, remoteRef, remoteSha: "0".repeat(40) }];
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "job-radar-publish-"));
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Private Person");
  git("config", "user.email", "private@example.com");
  git("config", "jobradar.private", "true");
  git("config", "jobradar.publicName", "Owner");
  git("config", "jobradar.publicEmail", "1+owner@users.noreply.github.com");
  git("remote", "add", "public", URL);
  mkdirSync(join(dir, "secrets"));
  writeFileSync(join(dir, "secrets", "private-terms.txt"), "# private\nZebediah\n");
  writeFileSync(join(dir, ".gitignore"), "secrets/\n");
  git("add", ".gitignore");
  commit("cv.md", "Zebediah's real CV\n");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("publishSync", () => {
  it("refuses while a tracked file contains a private term, naming file and term only", () => {
    const r = publishSync(dir, "first");
    expect(r).toEqual({ ok: false, problems: ['cv.md: contains a private term ("Zebediah")'] });
    expect(() => git("rev-parse", "--verify", "-q", "refs/heads/public")).toThrow();
  });

  it("refuses tracked secret paths", () => {
    commit("cv.md", "Example CV\n");
    git("add", "-f", "secrets/private-terms.txt");
    git("commit", "-q", "-m", "oops");
    const r = publishSync(dir, "first");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problems).toContain("secrets/private-terms.txt: secret or data path");
  });

  it("adds one orphan commit with the same tree and the noreply identity", () => {
    const head = commit("cv.md", "Example CV\n");
    const r = publishSync(dir, "first");
    expect(r.ok && !r.unchanged).toBe(true);
    expect(git("rev-parse", "public^{tree}")).toBe(git("rev-parse", `${head}^{tree}`));
    expect(git("rev-list", "--count", "public")).toBe("1");
    expect(git("log", "-1", "--format=%an <%ae> | %cn <%ce>", "public")).toBe(
      "Owner <1+owner@users.noreply.github.com> | Owner <1+owner@users.noreply.github.com>",
    );
    // A second sync with no change adds nothing; a change adds one child commit.
    expect(publishSync(dir, "again")).toMatchObject({ ok: true, unchanged: true });
    commit("README.md", "hello\n");
    expect(publishSync(dir, "second")).toMatchObject({ ok: true, unchanged: false });
    expect(git("rev-list", "--count", "public")).toBe("2");
  });
});

describe("pushProblems", () => {
  it("allows public → main once synced, and refuses main or the private history", () => {
    commit("cv.md", "Example CV\n");
    publishSync(dir, "first");
    const pub = git("rev-parse", "public");
    expect(pushProblems(dir, "public", URL, push("refs/heads/public", pub))).toEqual([]);

    const main = git("rev-parse", "main");
    expect(pushProblems(dir, "public", URL, push("refs/heads/main", main)).join()).toContain(
      "only public → main may be pushed",
    );
    // A `public` branch pointed at the private history is refused.
    git("branch", "-f", "public", "main");
    expect(pushProblems(dir, "public", URL, push("refs/heads/public", main)).join()).toContain(
      "contains the private history",
    );
  });

  it("refuses other remotes and branch deletion", () => {
    expect(pushProblems(dir, "origin", "https://example.invalid/x.git", [])).toHaveLength(1);
    expect(
      pushProblems(dir, "public", URL, push("(delete)", "0".repeat(40), "refs/heads/main")),
    ).toEqual(["deleting refs/heads/main is not allowed"]);
  });

  it("does not restrict checkouts that are not marked private", () => {
    git("config", "--unset", "jobradar.private");
    const main = git("rev-parse", "main");
    expect(
      pushProblems(dir, "origin", "https://example.invalid/x.git", push("refs/heads/main", main)),
    ).toEqual([]);
    expect(remoteProblems(dir)).toEqual([]);
  });
});

describe("remoteProblems", () => {
  it("accepts only the public remote at the public URL", () => {
    expect(remoteProblems(dir)).toEqual([]);
    git("remote", "set-url", "--push", "public", "git@github.com:someone/else.git");
    expect(remoteProblems(dir).join()).toContain("pushes to git@github.com:someone/else.git");
  });
});
