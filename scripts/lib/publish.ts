// Public release guards (public-release change, design D1–D3; local-operation spec "No git
// remotes" and "Publish without private data").
//
// The owner's private checkout is marked with the local, unversioned `git config
// jobradar.private true`. There, the only remote is `public` (the public GitHub repository) and the
// only push is the `public` branch, an orphan history built by `publish:sync` from the current tree.
// Public clones and forks are not marked and have no restriction.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const PUBLIC_REMOTE = "public";
export const PUBLIC_BRANCH = "refs/heads/public";
export const PUBLIC_URL = /github\.com[:/]Manumac86\/job-radar(\.git)?$/i;
export const TERMS_FILE = join("secrets", "private-terms.txt");

/** Paths that must never be published, whatever their content. */
const SECRET_PATHS: RegExp[] = [
  /(^|\/)secrets\//,
  /(^|\/)data\//,
  /(^|\/)\.env(\.|$)/,
  /token/i,
  /\.(pem|key)$/,
  /(^|\/)app_password/,
];

function git(cwd: string, args: string[], input?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function gitOk(cwd: string, args: string[]): boolean {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

export function isPrivateCheckout(cwd: string): boolean {
  try {
    return git(cwd, ["config", "--get", "jobradar.private"]).trim() === "true";
  } catch {
    return false;
  }
}

/** Problems with the configured remotes (check:local). */
export function remoteProblems(cwd: string): string[] {
  if (!isPrivateCheckout(cwd)) return [];
  const problems: string[] = [];
  for (const name of git(cwd, ["remote"]).split("\n").filter(Boolean)) {
    if (name !== PUBLIC_REMOTE) {
      problems.push(
        `git remote "${name}" is configured; the private checkout may only have "${PUBLIC_REMOTE}" (remove it with \`git remote remove ${name}\`)`,
      );
      continue;
    }
    for (const url of git(cwd, ["remote", "get-url", "--all", name]).split("\n").filter(Boolean))
      if (!PUBLIC_URL.test(url)) problems.push(`git remote "${name}" points to ${url}`);
    const pushUrls = git(cwd, ["remote", "get-url", "--push", "--all", name])
      .split("\n")
      .filter(Boolean);
    for (const url of pushUrls)
      if (!PUBLIC_URL.test(url)) problems.push(`git remote "${name}" pushes to ${url}`);
  }
  return problems;
}

/**
 * Private terms: one per line in `secrets/private-terms.txt` (blank lines and `#` comments
 * ignored), plus the value of every other secret file, so a pasted token is caught too.
 */
export function readTerms(cwd: string): string[] | null {
  const file = join(cwd, TERMS_FILE);
  if (!existsSync(file)) return null;
  const terms = readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (!terms.length) return terms;
  const dir = join(cwd, "secrets");
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (path === file || !statSync(path).isFile()) continue;
    const value = readFileSync(path, "utf8").trim();
    if (value.length >= 6 && !value.includes("\n")) terms.push(value);
  }
  return terms;
}

/** Long values (tokens) are shown only by their first characters. */
function mask(term: string): string {
  return term.length > 24 ? `${term.slice(0, 4)}…` : term;
}

/** Files of `treeish` that are secret paths or contain a private term (case-insensitive). */
export function scanTree(cwd: string, treeish: string, terms: string[]): string[] {
  const problems: string[] = [];
  const paths = git(cwd, ["ls-tree", "-r", "--name-only", treeish]).split("\n").filter(Boolean);
  for (const p of paths)
    if (SECRET_PATHS.some((re) => re.test(p))) problems.push(`${p}: secret or data path`);
  for (const term of terms) {
    let out: string;
    try {
      out = git(cwd, ["grep", "-I", "-i", "-F", "-l", "-e", term, treeish, "--"]);
    } catch {
      continue; // exit 1: no match
    }
    for (const line of out.split("\n").filter(Boolean)) {
      const path = line.slice(line.indexOf(":") + 1);
      problems.push(`${path}: contains a private term ("${mask(term)}")`);
    }
    for (const p of paths)
      if (p.toLowerCase().includes(term.toLowerCase()))
        problems.push(`${p}: path contains a private term ("${mask(term)}")`);
  }
  return problems;
}

/** Root commits of the private history; nothing pushed may descend from them. */
function privateRoots(cwd: string): string[] {
  if (!gitOk(cwd, ["rev-parse", "--verify", "-q", "refs/heads/main"])) return [];
  return git(cwd, ["rev-list", "--max-parents=0", "refs/heads/main"]).split("\n").filter(Boolean);
}

export interface PushUpdate {
  localRef: string;
  localSha: string;
  remoteRef: string;
  remoteSha: string;
}

export function parsePushUpdates(stdin: string): PushUpdate[] {
  return stdin
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .flatMap(([localRef, localSha, remoteRef, remoteSha]) =>
      localRef && localSha && remoteRef && remoteSha
        ? [{ localRef, localSha, remoteRef, remoteSha }]
        : [],
    );
}

/** Pre-push decision: an empty list allows the push. */
export function pushProblems(
  cwd: string,
  remoteName: string,
  remoteUrl: string,
  updates: PushUpdate[],
): string[] {
  if (!isPrivateCheckout(cwd)) return [];
  if (remoteName !== PUBLIC_REMOTE || !PUBLIC_URL.test(remoteUrl))
    return [`pushes from the private checkout may only go to "${PUBLIC_REMOTE}" (${remoteUrl})`];
  const terms = readTerms(cwd);
  if (!terms?.length) return [`${TERMS_FILE} is missing or empty; refusing to push`];
  const problems: string[] = [];
  const roots = privateRoots(cwd);
  for (const u of updates) {
    if (/^0+$/.test(u.localSha)) {
      problems.push(`deleting ${u.remoteRef} is not allowed`);
      continue;
    }
    if (u.localRef !== PUBLIC_BRANCH || u.remoteRef !== "refs/heads/main") {
      problems.push(`only public → main may be pushed, not ${u.localRef} → ${u.remoteRef}`);
      continue;
    }
    for (const root of roots)
      if (gitOk(cwd, ["merge-base", "--is-ancestor", root, u.localSha]))
        problems.push(`${u.localRef} contains the private history (root ${root.slice(0, 7)})`);
    problems.push(...scanTree(cwd, u.localSha, terms));
  }
  return problems;
}

export interface Identity {
  name: string;
  email: string;
}

export function publicIdentity(cwd: string): Identity | null {
  try {
    const name = git(cwd, ["config", "--get", "jobradar.publicName"]).trim();
    const email = git(cwd, ["config", "--get", "jobradar.publicEmail"]).trim();
    return name && email ? { name, email } : null;
  } catch {
    return null;
  }
}

export type SyncResult =
  { ok: true; commit: string; unchanged: boolean } | { ok: false; problems: string[] };

/**
 * Adds one commit to the `public` branch whose tree is `HEAD`'s tree (design D1). The branch never
 * shares a commit with the private history.
 */
export function publishSync(cwd: string, message: string): SyncResult {
  const terms = readTerms(cwd);
  if (!terms?.length)
    return {
      ok: false,
      problems: [`${TERMS_FILE} is missing or empty (one private term per line)`],
    };
  const identity = publicIdentity(cwd);
  if (!identity)
    return {
      ok: false,
      problems: [
        "set the public identity first: git config jobradar.publicName <name> && git config jobradar.publicEmail <id+login@users.noreply.github.com>",
      ],
    };
  if (!identity.email.endsWith("@users.noreply.github.com"))
    return { ok: false, problems: ["jobradar.publicEmail must be a GitHub noreply address"] };
  const problems = scanTree(cwd, "HEAD", terms);
  if (problems.length) return { ok: false, problems };

  const tree = git(cwd, ["rev-parse", "HEAD^{tree}"]).trim();
  const parent = gitOk(cwd, ["rev-parse", "--verify", "-q", PUBLIC_BRANCH])
    ? git(cwd, ["rev-parse", PUBLIC_BRANCH]).trim()
    : null;
  if (parent && git(cwd, ["rev-parse", `${parent}^{tree}`]).trim() === tree)
    return { ok: true, commit: parent, unchanged: true };
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
  };
  const commit = execFileSync(
    "git",
    ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message],
    { cwd, encoding: "utf8", env },
  ).trim();
  git(cwd, ["update-ref", PUBLIC_BRANCH, commit, ...(parent ? [parent] : [])]);
  return { ok: true, commit, unchanged: false };
}
