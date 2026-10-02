// Tools the admin assistant can call.
//
// Design rules, because the caller is a non-technical admin and the model is
// driving:
//
//  * Narrow and typed. There is no "run SQL" tool and there will not be one.
//    Every tool is a named operation with a zod schema, so the blast radius is
//    the union of what these functions can do, not what Postgres can do.
//
//  * Every write records before/after in agent_actions. That is the audit
//    trail and the undo log.
//
//  * Tool *descriptions* are written for the model, not the admin. The model
//    translates between the two — that's the whole point of the assistant.
//
//  * Nothing here touches student PII beyond counts. The agent exists to
//    change how the tool behaves, not to browse records, and keeping it out
//    of the student data keeps a prompt-injected instruction from exfiltrating
//    anything through a tool result.
import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  appSettings,
  interests,
  hostStudents,
  prospectiveStudents,
  matches,
} from "@/lib/db/schema";
import { INTEREST_CATEGORIES, type CategorySlug } from "@/lib/interest-categories";
import {
  listTree,
  readFile,
  proposeChange,
  branchNameFor,
  canWrite,
  checkAndMerge,
  BASE_BRANCH,
} from "./repo";

export type ToolContext = { conversationId: string; profileId: string };

export type ToolOutcome = {
  // What the model sees.
  result: unknown;
  // Recorded in agent_actions for the audit/undo trail.
  before?: unknown;
  after?: unknown;
  status: "ok" | "error" | "refused";
  message?: string;
};

type ToolDef = {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  // A write tool's effect is shown to the admin for confirmation before it
  // runs. Read tools run immediately.
  write: boolean;
  // One plain sentence describing what is about to happen, for the admin.
  preview?: (input: never) => string;
  run: (input: never, ctx: ToolContext) => Promise<ToolOutcome>;
};

// --- settings ---------------------------------------------------------------

// Only keys listed here can be read or written. A setting the agent doesn't
// know about is one it can't corrupt, and the metadata is what lets it explain
// a knob to someone who has never heard of it.
export const KNOWN_SETTINGS: Record<
  string,
  { label: string; help: string; kind: "int" | "date" | "text"; min?: number; max?: number }
> = {
  host_soft_cap: {
    label: "Visits per host",
    help: "How many shadow visits one host student is expected to take before the system starts steering new visitors elsewhere. It's a soft limit — going over costs a host points in matching and raises a flag, it never blocks a match.",
    kind: "int",
    min: 1,
    max: 50,
  },
  shadow_season_start: {
    label: "Season start date",
    help: "First date shadow visits can be scheduled. Calendar syncing and matching ignore anything before it.",
    kind: "date",
  },
  shadow_season_end: {
    label: "Season end date",
    help: "Last date shadow visits can be scheduled.",
    kind: "date",
  },
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateSettingValue(key: string, value: string): string | null {
  const meta = KNOWN_SETTINGS[key];
  if (!meta) return `${key} isn't a setting this assistant can change.`;
  if (meta.kind === "int") {
    const n = Number(value);
    if (!Number.isInteger(n)) return `${meta.label} has to be a whole number.`;
    if (meta.min != null && n < meta.min) return `${meta.label} can't be below ${meta.min}.`;
    if (meta.max != null && n > meta.max) return `${meta.label} can't be above ${meta.max}.`;
  }
  if (meta.kind === "date" && !ISO_DATE.test(value)) {
    return `${meta.label} has to be a date like 2026-09-16.`;
  }
  return null;
}

// --- tool definitions -------------------------------------------------------

const toolList: ToolDef[] = [
  {
    name: "get_overview",
    description:
      "Current state of the Shadow Visit system: how many hosts, prospective students and matches exist, how many hosts have saved a calendar link, and the current value of every setting you can change. Call this first when you need to ground a request in what is actually configured.",
    schema: z.object({}),
    write: false,
    run: async () => {
      const [counts] = await db
        .select({
          hosts: sql<number>`(select count(*)::int from ${hostStudents})`,
          activeHosts: sql<number>`(select count(*)::int from ${hostStudents} where active)`,
          hostsWithCalendar: sql<number>`(select count(*)::int from ${hostStudents} where ics_url is not null)`,
          prospectives: sql<number>`(select count(*)::int from ${prospectiveStudents})`,
          matches: sql<number>`(select count(*)::int from ${matches})`,
          interests: sql<number>`(select count(*)::int from ${interests} where active)`,
        })
        .from(sql`(select 1) as _`);

      const rows = await db.select().from(appSettings);
      const settings = Object.entries(KNOWN_SETTINGS).map(([key, meta]) => ({
        key,
        label: meta.label,
        help: meta.help,
        value: rows.find((r) => r.key === key)?.value ?? null,
      }));
      return { result: { counts, settings }, status: "ok" };
    },
  },

  {
    name: "update_setting",
    description:
      "Change one configuration value. Only the keys returned by get_overview are valid. Confirm the outcome with the admin in plain language before calling this — never guess at a number they didn't give you.",
    schema: z.object({
      key: z.string(),
      value: z.string(),
      reason: z.string().describe("One sentence, in the admin's own terms, for the audit log."),
    }),
    write: true,
    preview: (input: { key: string; value: string }) =>
      `Set ${KNOWN_SETTINGS[input.key]?.label ?? input.key} to ${input.value}`,
    run: async (input: { key: string; value: string; reason: string }) => {
      const invalid = validateSettingValue(input.key, input.value);
      if (invalid) return { result: { error: invalid }, status: "refused", message: invalid };

      const [existing] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, input.key))
        .limit(1);
      const before = existing?.value ?? null;
      if (before === input.value) {
        return {
          result: { unchanged: true, value: before },
          status: "ok",
          message: "Already set to that value — nothing changed.",
        };
      }

      await db
        .insert(appSettings)
        .values({ key: input.key, value: input.value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: input.value, updatedAt: new Date() },
        });

      return {
        result: { key: input.key, from: before, to: input.value },
        before: { key: input.key, value: before },
        after: { key: input.key, value: input.value },
        status: "ok",
        message: input.reason,
      };
    },
  },

  {
    name: "list_interests",
    description:
      "Every interest students can be matched on, with its category, whether it's active, and whether host students can pick it themselves.",
    schema: z.object({
      category: z.enum(["academics", "fine_arts", "athletics", "innovation"]).optional(),
    }),
    write: false,
    run: async (input: { category?: CategorySlug }) => {
      const rows = await db
        .select({
          id: interests.id,
          name: interests.name,
          category: interests.category,
          active: interests.active,
          hostSelectable: interests.hostSelectable,
        })
        .from(interests)
        .where(input.category ? eq(interests.category, input.category) : undefined)
        .orderBy(asc(interests.category), asc(interests.name));
      return { result: { interests: rows, categories: INTEREST_CATEGORIES }, status: "ok" };
    },
  },

  {
    name: "create_interest",
    description:
      "Add a new interest students can be matched on. Check list_interests first — if something close already exists, suggest reusing or renaming it instead of creating a near-duplicate, because duplicates split the matching signal.",
    schema: z.object({
      name: z.string().min(1).max(80),
      category: z.enum(["academics", "fine_arts", "athletics", "innovation"]),
      hostSelectable: z
        .boolean()
        .describe("Whether host students see it on their own interests page."),
    }),
    write: true,
    preview: (input: { name: string; category: string }) =>
      `Add the interest "${input.name}" under ${
        INTEREST_CATEGORIES.find((c) => c.slug === input.category)?.label ?? input.category
      }`,
    run: async (input: { name: string; category: CategorySlug; hostSelectable: boolean }) => {
      const name = input.name.trim();
      const [clash] = await db
        .select({ id: interests.id, name: interests.name })
        .from(interests)
        .where(sql`lower(${interests.name}) = lower(${name})`)
        .limit(1);
      if (clash) {
        return {
          result: { error: `"${clash.name}" already exists.` },
          status: "refused",
          message: `An interest called "${clash.name}" already exists.`,
        };
      }
      const [created] = await db
        .insert(interests)
        .values({
          name,
          category: input.category,
          active: true,
          hostSelectable: input.hostSelectable,
        })
        .returning();
      return {
        result: { created: { id: created.id, name: created.name } },
        after: created,
        status: "ok",
      };
    },
  },

  {
    name: "set_interest_state",
    description:
      "Rename an interest, move it to another category, retire it, or change whether hosts can self-select it. Retiring (active=false) is strongly preferred over deletion: students are already linked to it, and deactivating keeps the history intact while removing it from new matching.",
    schema: z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(80).optional(),
      category: z.enum(["academics", "fine_arts", "athletics", "innovation"]).optional(),
      active: z.boolean().optional(),
      hostSelectable: z.boolean().optional(),
    }),
    write: true,
    preview: (input: { id: string }) => `Update interest ${input.id.slice(0, 8)}…`,
    run: async (input: {
      id: string;
      name?: string;
      category?: CategorySlug;
      active?: boolean;
      hostSelectable?: boolean;
    }) => {
      const [before] = await db.select().from(interests).where(eq(interests.id, input.id)).limit(1);
      if (!before) {
        return { result: { error: "No interest with that id." }, status: "refused" };
      }
      const patch: Partial<typeof interests.$inferInsert> = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.category !== undefined) patch.category = input.category;
      if (input.active !== undefined) patch.active = input.active;
      if (input.hostSelectable !== undefined) patch.hostSelectable = input.hostSelectable;
      if (Object.keys(patch).length === 0) {
        return { result: { error: "Nothing to change." }, status: "refused" };
      }
      const [after] = await db
        .update(interests)
        .set(patch)
        .where(eq(interests.id, input.id))
        .returning();
      return { result: { before, after }, before, after, status: "ok" };
    },
  },

  {
    name: "count_hosts_matching",
    description:
      "How many host students match a filter. Use this to show an admin the real consequence of a change before making it — 'that would leave 3 eligible hosts' is the kind of thing they need to hear.",
    schema: z.object({
      grade: z.number().int().min(1).max(12).optional(),
      gender: z.enum(["M", "F"]).optional(),
      hasCalendar: z.boolean().optional(),
      activeOnly: z.boolean().optional(),
    }),
    write: false,
    run: async (input: {
      grade?: number;
      gender?: "M" | "F";
      hasCalendar?: boolean;
      activeOnly?: boolean;
    }) => {
      const conds = [];
      if (input.grade !== undefined) conds.push(eq(hostStudents.grade, input.grade));
      if (input.gender !== undefined) conds.push(eq(hostStudents.gender, input.gender));
      if (input.activeOnly) conds.push(eq(hostStudents.active, true));
      if (input.hasCalendar === true) conds.push(sql`${hostStudents.icsUrl} is not null`);
      if (input.hasCalendar === false) conds.push(sql`${hostStudents.icsUrl} is null`);
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(hostStudents)
        .where(conds.length ? and(...conds) : undefined);
      return { result: { count: row?.n ?? 0, filter: input }, status: "ok" };
    },
  },

  // --- code ---------------------------------------------------------------
  // Reading is unrestricted within the policy in repo.ts; writing goes to a
  // branch and a pull request, never to a running environment. The build of
  // that branch is the gate.

  {
    name: "list_code_files",
    description:
      "List the source files of this application, optionally filtered by a path prefix or extension. Use this to orient yourself before reading. Files covering authentication, secrets, database schema and the assistant's own code are omitted — they are not editable and not your concern.",
    schema: z.object({
      prefix: z.string().optional().describe("e.g. 'src/app/admin' or 'src/components'"),
      extension: z.string().optional().describe("e.g. 'tsx' or 'css'"),
    }),
    write: false,
    run: async (input: { prefix?: string; extension?: string }) => {
      let files = await listTree();
      if (input.prefix) files = files.filter((f) => f.path.startsWith(input.prefix!));
      if (input.extension) files = files.filter((f) => f.path.endsWith(`.${input.extension}`));
      return {
        result: {
          branch: BASE_BRANCH,
          count: files.length,
          files: files.slice(0, 300).map((f) => ({ path: f.path, bytes: f.size })),
        },
        status: "ok",
      };
    },
  },

  {
    name: "read_code_file",
    description:
      "Read one source file in full. Always read a file before proposing an edit to it — you must send back the complete new contents, so you need the current contents exactly.",
    schema: z.object({ path: z.string() }),
    write: false,
    run: async (input: { path: string }) => {
      try {
        const file = await readFile(input.path);
        return { result: file, status: "ok" };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not read that file.";
        return { result: { error: message }, status: "refused", message };
      }
    },
  },

  {
    name: "search_code",
    description:
      "Find which files contain a string or regular expression, with matching lines. Far cheaper than reading files one by one — use it to locate the code behind a feature before reading anything.",
    schema: z.object({
      pattern: z.string().describe("Plain text or a JavaScript regular expression."),
      prefix: z.string().optional(),
      maxFiles: z.number().int().min(1).max(40).optional(),
    }),
    write: false,
    run: async (input: { pattern: string; prefix?: string; maxFiles?: number }) => {
      let re: RegExp;
      try {
        re = new RegExp(input.pattern, "i");
      } catch {
        return { result: { error: "That isn't a valid search pattern." }, status: "refused" };
      }
      let files = await listTree();
      if (input.prefix) files = files.filter((f) => f.path.startsWith(input.prefix!));
      // Source only, and skip anything large — the data URIs in the help page
      // would otherwise blow the context for no benefit.
      files = files.filter(
        (f) => /\.(tsx|ts|css|sql|md)$/.test(f.path) && (f.size ?? 0) < 120_000,
      );

      const limit = input.maxFiles ?? 12;
      // Hard cap on files opened, not just on hits. A rare pattern would
      // otherwise read every file in the repo one request at a time and eat
      // the whole 60s function budget before the model gets to reply.
      const SCAN_CAP = 70;
      const scanned = files.slice(0, SCAN_CAP);
      const truncated = files.length > SCAN_CAP;
      const hits: { path: string; lines: { n: number; text: string }[] }[] = [];
      // Sequential on purpose: a parallel fan-out over the whole tree would
      // burn the GitHub rate limit and the 60s budget on one search.
      for (const f of scanned) {
        if (hits.length >= limit) break;
        let content: string;
        try {
          content = (await readFile(f.path)).content;
        } catch {
          continue;
        }
        const lines = content.split("\n");
        const matched: { n: number; text: string }[] = [];
        for (let i = 0; i < lines.length && matched.length < 8; i++) {
          if (re.test(lines[i])) matched.push({ n: i + 1, text: lines[i].slice(0, 200) });
        }
        if (matched.length) hits.push({ path: f.path, lines: matched });
      }
      return {
        result: {
          pattern: input.pattern,
          searched: scanned.length,
          truncated,
          hits,
          ...(truncated
            ? { note: "Only part of the codebase was searched. Narrow it with a prefix if you did not find what you need." }
            : {}),
        },
        status: "ok",
      };
    },
  },

  {
    name: "propose_code_change",
    description:
      "Write changed files to a new branch and open a pull request. Send the COMPLETE new contents of each file, not a diff or a fragment — whatever you send replaces the file. Read each file first. Vercel builds the branch automatically; if the build fails the change goes nowhere, so a broken edit is safe but wasted. Explain to the admin in plain language what will visibly change before calling this.",
    schema: z.object({
      summary: z
        .string()
        .min(8)
        .max(72)
        .describe("Short imperative title, e.g. 'Add a dark mode toggle'."),
      explanation: z
        .string()
        .describe("What changes and why, in the admin's own terms. Goes in the pull request."),
      files: z
        .array(z.object({ path: z.string(), content: z.string() }))
        .min(1)
        .max(20),
    }),
    write: true,
    preview: (input: { summary: string; files: { path: string }[] }) =>
      `${input.summary} (${input.files.length} file${input.files.length === 1 ? "" : "s"})`,
    run: async (input: {
      summary: string;
      explanation: string;
      files: { path: string; content: string }[];
    }) => {
      for (const f of input.files) {
        const v = canWrite(f.path);
        if (!v.allowed) {
          return { result: { error: v.reason }, status: "refused", message: v.reason };
        }
      }
      const branch = branchNameFor(input.summary);
      try {
        const pr = await proposeChange({
          branch,
          message: input.summary,
          body: `${input.explanation}\n\n---\nProposed by the Shadow Visit admin assistant.`,
          files: input.files,
        });
        return {
          result: {
            ...pr,
            note: "Vercel is building a preview of this branch now. Tell the admin a preview is being built and that you'll confirm when it's ready.",
          },
          after: { branch: pr.branch, prUrl: pr.prUrl, files: input.files.map((f) => f.path) },
          status: "ok",
          message: input.summary,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not open the pull request.";
        return { result: { error: message }, status: "error", message };
      }
    },
  },

  {
    name: "check_change_status",
    description:
      "Check whether a proposed code change has finished building, and publish it to the sandbox site if the build passed. Builds take a minute or two, so after proposing a change tell the admin you will check back, then call this when they next ask. If the build failed, read the files again and fix the problem — never try to publish a failed build.",
    schema: z.object({
      branch: z.string().describe("The branch returned by propose_code_change."),
    }),
    write: true,
    preview: (input: { branch: string }) => `Check the build for ${input.branch}`,
    run: async (input: { branch: string }) => {
      try {
        const status = await checkAndMerge(input.branch);
        return {
          result: status,
          after: status.merged ? { merged: status.branch, pr: status.prNumber } : undefined,
          status: status.state === "failed" ? "error" : "ok",
          message: status.detail,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not check the build.";
        return { result: { error: message }, status: "error", message };
      }
    },
  },
];

export const TOOLS = new Map(toolList.map((t) => [t.name, t]));

export function anthropicToolSpecs() {
  return toolList.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: zodToJsonSchema(t.schema),
  }));
}

export function isWriteTool(name: string): boolean {
  return TOOLS.get(name)?.write ?? false;
}

export function previewFor(name: string, input: unknown): string {
  const t = TOOLS.get(name);
  if (!t?.preview) return `Run ${name}`;
  try {
    return (t.preview as (i: unknown) => string)(input);
  } catch {
    return `Run ${name}`;
  }
}

// Minimal zod -> JSON Schema. The tool schemas here are deliberately flat
// (objects of primitives, enums and optionals), so a full converter would be
// a dependency carrying far more than this needs. Anything more elaborate
// should be flattened rather than handled here.
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const shape = (schema as z.ZodObject<z.ZodRawShape>).shape ?? {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, raw] of Object.entries(shape)) {
    let field = raw as z.ZodTypeAny;
    let optional = false;
    let description: string | undefined;
    // Unwrap optional/describe wrappers to reach the base type.
    for (let i = 0; i < 5; i++) {
      const def = field._def as { typeName?: string; innerType?: z.ZodTypeAny; description?: string };
      if (def.description) description = def.description;
      if (def.typeName === "ZodOptional" || def.typeName === "ZodDefault") {
        optional = true;
        field = def.innerType as z.ZodTypeAny;
        continue;
      }
      break;
    }
    const def = field._def as { typeName?: string; values?: string[] };
    let json: Record<string, unknown>;
    switch (def.typeName) {
      case "ZodString":
        json = { type: "string" };
        break;
      case "ZodNumber":
        json = { type: "integer" };
        break;
      case "ZodBoolean":
        json = { type: "boolean" };
        break;
      case "ZodEnum":
        json = { type: "string", enum: def.values ?? [] };
        break;
      default:
        json = { type: "string" };
    }
    if (description) json.description = description;
    properties[key] = json;
    if (!optional) required.push(key);
  }
  return { type: "object", properties, required, additionalProperties: false };
}
