// Quick sanity check for the host-schedule CSV parser against the real fixture.
// Run: npm run test:parsers
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseHostScheduleCsv } from "../src/lib/schedule/parse-host-csv";

const here = dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(
  join(here, "..", "fixtures", "host-schedule-sample.csv"),
  "utf8",
);

const result = parseHostScheduleCsv(csv);
console.log(JSON.stringify(result, null, 2));

const academic = result.blocks.filter((b) => b.isAcademic);
console.log(
  `\nParsed ${result.blocks.length} blocks (${academic.length} academic). ` +
    `Student=${result.studentName} grade=${result.grade} ` +
    `date=${result.date} dayType=${result.dayType}`,
);
if (result.warnings.length) console.log("Warnings:", result.warnings);
