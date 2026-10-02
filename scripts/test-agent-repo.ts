// Read-only smoke test of the agent's GitHub access. Never writes.
import { listTree, readFile, canWrite } from "../src/lib/agent/repo";

async function main() {
  const tree = await listTree();
  console.log(`tree: ${tree.length} readable files on sandbox/agent`);

  const denied = ["src/lib/agent/tools.ts", "src/lib/auth.ts", ".env.local", "src/lib/db/schema.ts"];
  const leaked = tree.filter((f) => denied.includes(f.path));
  console.log(`denied files present in tree: ${leaked.length} (must be 0)`);

  const css = await readFile("src/app/globals.css");
  console.log(`read globals.css: ${css.content.length} bytes, mentions @custom-variant: ${css.content.includes("@custom-variant")}`);

  try {
    await readFile("src/lib/auth.ts");
    console.log("FAIL: read a denied file");
  } catch (e) {
    console.log(`refused denied read: ${(e as Error).message.slice(0, 60)}…`);
  }

  console.log(`canWrite(globals.css): ${canWrite("src/app/globals.css").allowed}`);
  console.log(`canWrite(agent/tools.ts): ${canWrite("src/lib/agent/tools.ts").allowed}`);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
