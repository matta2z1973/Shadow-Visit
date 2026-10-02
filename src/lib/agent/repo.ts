// GitHub access for the assistant.
//
// The agent runs in a Vercel function: no filesystem it can write, no git, no
// ability to run a build, and 60 seconds to work in. So it cannot edit the
// app it is running inside. Every code change goes through the GitHub API as
// a branch + pull request, and Vercel's own build of that branch is the gate
// that decides whether the change is allowed anywhere near a user.
//
// The policy below is the real security boundary, not the system prompt. A
// prompt can be argued with; this cannot.

const OWNER = "matta2z1973";
const REPO = "Shadow-Visit";

// Every agent change targets the sandbox branch. `main` is production and is
// not reachable from here by any input — it isn't a parameter, it's absent.
export const BASE_BRANCH = "sandbox/agent";
const FORBIDDEN_BRANCHES = ["main", "master"];

// Paths the agent may never read or write.
//
// Three categories, each for a different reason:
//   1. Authentication and the sandbox gate — a change here decides who can
//      get in at all, which is the one failure you cannot walk back.
//   2. The agent's own code — tools, prompt, this policy. An agent that can
//      edit its own guardrails has no guardrails. This is the important one.
//   3. Secrets, CI, dependencies and database schema — either they carry
//      credentials, or they execute outside the build gate, or they need a
//      migration that a preview deploy won't catch.
const DENY: RegExp[] = [
  /^\.env/,
  /^\.github\//,
  /^src\/lib\/agent\//,
  /^src\/lib\/auth\.ts$/,
  /^src\/lib\/sandbox\.ts$/,
  /^src\/lib\/supabase\//,
  /^src\/proxy\.ts$/,
  /^src\/app\/login\//,
  /^src\/app\/auth\//,
  /^src\/lib\/db\/schema\.ts$/,
  /^drizzle\//,
  /^package(-lock)?\.json$/,
  /^next\.config\.ts$/,
  /^node_modules\//,
  /^\.vercel\//,
];

// Only these may be written at all. An allowlist, so a path nobody thought
// about is refused rather than permitted.
const ALLOW_WRITE: RegExp[] = [
  /^src\/app\/.*\.(tsx|ts|css)$/,
  /^src\/components\/.*\.tsx$/,
  /^src\/lib\/(?!agent\/|auth\.ts|sandbox\.ts|supabase\/|db\/schema\.ts).*\.ts$/,
  /^public\/.*\.(html|css|svg)$/,
];

export type PathVerdict = { allowed: boolean; reason?: string };

export function canRead(path: string): PathVerdict {
  if (path.includes("..")) return { allowed: false, reason: "Path traversal is not allowed." };
  for (const re of DENY) {
    if (re.test(path)) {
      return { allowed: false, reason: `${path} is off limits (authentication, secrets, the assistant's own code, or database schema).` };
    }
  }
  return { allowed: true };
}

export function canWrite(path: string): PathVerdict {
  const read = canRead(path);
  if (!read.allowed) return read;
  if (!ALLOW_WRITE.some((re) => re.test(path))) {
    return {
      allowed: false,
      reason: `${path} isn't a file the assistant may change. It can edit pages, components, styles and non-auth library code.`,
    };
  }
  return { allowed: true };
}

function token(): string {
  // Accepts either name: GITHUB_TOKEN is the convention, GITHUB_API_KEY is
  // what the key was stored under. Tolerating both beats a rename that
  // silently disables code changes if one place is missed.
  const t = process.env.GITHUB_TOKEN ?? process.env.GITHUB_API_KEY;
  if (!t) throw new Error("No GitHub token configured — code changes are unavailable.");
  return t;
}

export function codeChangesAvailable(): boolean {
  return !!(process.env.GITHUB_TOKEN ?? process.env.GITHUB_API_KEY);
}

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${init?.method ?? "GET"} ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type TreeEntry = { path: string; type: string; size?: number };

export async function listTree(): Promise<TreeEntry[]> {
  const data = await gh<{ tree: TreeEntry[]; truncated: boolean }>(
    `/repos/${OWNER}/${REPO}/git/trees/${encodeURIComponent(BASE_BRANCH)}?recursive=1`,
  );
  return data.tree.filter((e) => e.type === "blob" && canRead(e.path).allowed);
}

export async function readFile(path: string): Promise<{ path: string; content: string }> {
  const verdict = canRead(path);
  if (!verdict.allowed) throw new Error(verdict.reason);
  const data = await gh<{ content: string; encoding: string }>(
    `/repos/${OWNER}/${REPO}/contents/${path}?ref=${encodeURIComponent(BASE_BRANCH)}`,
  );
  if (data.encoding !== "base64") throw new Error(`Unexpected encoding ${data.encoding}`);
  return { path, content: Buffer.from(data.content, "base64").toString("utf8") };
}

// Opens a branch + PR containing the given files. Returns the branch so the
// caller can find the preview deployment Vercel builds from it.
export async function proposeChange(args: {
  branch: string;
  message: string;
  body: string;
  files: { path: string; content: string }[];
}): Promise<{ branch: string; prNumber: number; prUrl: string; sha: string }> {
  if (FORBIDDEN_BRANCHES.includes(args.branch)) {
    throw new Error(`Refusing to write to ${args.branch}.`);
  }
  for (const f of args.files) {
    const v = canWrite(f.path);
    if (!v.allowed) throw new Error(v.reason);
  }
  if (args.files.length === 0) throw new Error("No files to change.");
  if (args.files.length > 20) throw new Error("Too many files in one change (max 20).");

  const baseRef = await gh<{ object: { sha: string } }>(
    `/repos/${OWNER}/${REPO}/git/ref/heads/${BASE_BRANCH}`,
  );
  const baseSha = baseRef.object.sha;
  const baseCommit = await gh<{ tree: { sha: string } }>(
    `/repos/${OWNER}/${REPO}/git/commits/${baseSha}`,
  );

  const blobs = await Promise.all(
    args.files.map(async (f) => {
      const blob = await gh<{ sha: string }>(`/repos/${OWNER}/${REPO}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: Buffer.from(f.content, "utf8").toString("base64"),
          encoding: "base64",
        }),
      });
      return { path: f.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
    }),
  );

  const tree = await gh<{ sha: string }>(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: blobs }),
  });

  const commit = await gh<{ sha: string }>(`/repos/${OWNER}/${REPO}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: args.message, tree: tree.sha, parents: [baseSha] }),
  });

  await gh(`/repos/${OWNER}/${REPO}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${args.branch}`, sha: commit.sha }),
  });

  const pr = await gh<{ number: number; html_url: string }>(`/repos/${OWNER}/${REPO}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: args.message,
      head: args.branch,
      base: BASE_BRANCH,
      body: args.body,
    }),
  });

  return { branch: args.branch, prNumber: pr.number, prUrl: pr.html_url, sha: commit.sha };
}

export function branchNameFor(summary: string): string {
  const slug = summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `agent/${slug || "change"}-${Date.now().toString(36)}`;
}

// --- build gate -------------------------------------------------------------
//
// Vercel reports each preview build back to GitHub as a check run, so the
// build status is readable with the GitHub token we already hold. That is the
// whole reason to read it this way: a Vercel API token would let this app
// redeploy or delete projects, and the only question being asked here is
// "did the build pass".

export type ChangeStatus = {
  branch: string;
  prNumber: number;
  state: "building" | "passed" | "failed" | "unknown";
  previewUrl: string | null;
  merged: boolean;
  detail: string;
};

type CheckRun = {
  name: string;
  status: string;
  conclusion: string | null;
  details_url: string | null;
};

export async function checkAndMerge(branch: string): Promise<ChangeStatus> {
  const prs = await gh<
    { number: number; head: { sha: string }; merged_at: string | null; state: string }[]
  >(`/repos/${OWNER}/${REPO}/pulls?head=${OWNER}:${branch}&state=all`);
  const pr = prs[0];
  if (!pr) throw new Error(`No pull request found for ${branch}.`);

  if (pr.merged_at) {
    return {
      branch,
      prNumber: pr.number,
      state: "passed",
      previewUrl: null,
      merged: true,
      detail: "Already merged.",
    };
  }

  const checks = await gh<{ check_runs: CheckRun[] }>(
    `/repos/${OWNER}/${REPO}/commits/${pr.head.sha}/check-runs`,
  );
  const runs = checks.check_runs;
  const preview = runs.find((r) => r.details_url)?.details_url ?? null;

  if (runs.length === 0) {
    return {
      branch,
      prNumber: pr.number,
      state: "unknown",
      previewUrl: null,
      merged: false,
      detail: "No build has been reported yet — it may not have started.",
    };
  }
  if (runs.some((r) => r.status !== "completed")) {
    return {
      branch,
      prNumber: pr.number,
      state: "building",
      previewUrl: preview,
      merged: false,
      detail: "The build is still running.",
    };
  }
  const failed = runs.filter((r) => r.conclusion !== "success" && r.conclusion !== "neutral");
  if (failed.length) {
    return {
      branch,
      prNumber: pr.number,
      state: "failed",
      previewUrl: preview,
      merged: false,
      detail: `The build failed (${failed.map((f) => f.name).join(", ")}). Nothing was changed.`,
    };
  }

  // Green. Merge into the sandbox branch, which triggers the sandbox deploy.
  await gh(`/repos/${OWNER}/${REPO}/pulls/${pr.number}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash" }),
  });
  return {
    branch,
    prNumber: pr.number,
    state: "passed",
    previewUrl: preview,
    merged: true,
    detail: "The build passed and the change is now live on the sandbox site.",
  };
}
