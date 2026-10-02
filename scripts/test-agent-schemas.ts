// Every tool's JSON Schema must actually describe its zod schema. A wrong
// schema is invisible: the model sends what it was told to, zod rejects it,
// and the failure looks like a model mistake. This caught propose_code_change
// advertising an array of objects as a plain string.
import { anthropicToolSpecs, TOOLS } from "../src/lib/agent/tools";

const specs = anthropicToolSpecs();
let fail = 0;

for (const spec of specs) {
  const schema = spec.input_schema as {
    type: string;
    properties: Record<string, { type: string; items?: unknown }>;
    required: string[];
  };
  const props = Object.entries(schema.properties ?? {});
  console.log(`\n${spec.name}`);
  if (schema.type !== "object") {
    console.log("  FAIL root is not an object");
    fail++;
  }
  for (const [k, v] of props) {
    const detail = v.type === "array" ? ` items=${JSON.stringify(v.items)}` : "";
    console.log(`  ${k}: ${v.type}${detail}`);
    if (v.type === "array" && !v.items) {
      console.log(`  FAIL ${k} is an array with no item schema`);
      fail++;
    }
  }
}

// Round-trip: build a plausible payload from the JSON Schema and check the
// real zod schema accepts it. Catches type mismatches in both directions.
function sample(node: { type: string; properties?: Record<string, { type: string; items?: unknown; enum?: string[] }>; items?: { type: string; properties?: Record<string, { type: string }> }; enum?: string[] }): unknown {
  if (node.enum?.length) return node.enum[0];
  switch (node.type) {
    case "string": return "placeholder-value-long-enough";
    case "integer": return 3;
    case "boolean": return true;
    case "array": return [sample(node.items as never)];
    case "object": {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node.properties ?? {})) o[k] = sample(v as never);
      return o;
    }
    default: return null;
  }
}

console.log("\n--- round-trip ---");
for (const spec of specs) {
  const payload = sample(spec.input_schema as never);
  const def = TOOLS.get(spec.name)!;
  const r = def.schema.safeParse(payload);
  // A sample can legitimately fail a business rule (a uuid field, a min
  // length) — what must never happen is a *type* mismatch.
  const typeErrors = r.success
    ? []
    : r.error.issues.filter((i) => i.code === "invalid_type");
  const ok = typeErrors.length === 0;
  if (!ok) fail++;
  console.log(`${ok ? "pass" : "FAIL"}  ${spec.name}${ok ? "" : "  " + JSON.stringify(typeErrors)}`);
}

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
