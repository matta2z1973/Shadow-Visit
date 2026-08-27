function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export type ParsedCourseRow = {
  code: string | null;
  title: string;
  description: string | null;
};

export type ParseCourseCatalogResult = {
  rows: ParsedCourseRow[];
  warnings: string[];
};

const TITLE_HEADERS = ["course name", "course title", "title", "name", "class"];
const DESCRIPTION_HEADERS = ["description", "course description", "desc", "summary"];
const CODE_HEADERS = ["course code", "code", "catalog #", "catalog number", "course #"];

// Course catalogs typically export as one header row + one row per course,
// with a name/title column and a description column (column order and exact
// header text vary by school SIS export, so match loosely by name).
export function parseCourseCatalogRows(
  rows: (string | number | null)[][],
): ParseCourseCatalogResult {
  const warnings: string[] = [];
  if (!rows.length) return { rows: [], warnings: ["File is empty."] };

  const header = rows[0].map((c) => norm(String(c ?? "")));
  const titleIdx = header.findIndex((h) => TITLE_HEADERS.includes(h));
  const descIdx = header.findIndex((h) => DESCRIPTION_HEADERS.includes(h));
  const codeIdx = header.findIndex((h) => CODE_HEADERS.includes(h));

  if (titleIdx === -1) {
    warnings.push(
      "Couldn't find a course name/title column. Expected a header like \"Course Name\" or \"Title\".",
    );
    return { rows: [], warnings };
  }
  if (descIdx === -1) {
    warnings.push(
      "No description column found — matching will rely on course titles only, which is less accurate.",
    );
  }

  const out: ParsedCourseRow[] = [];
  for (const r of rows.slice(1)) {
    const rawTitle = r[titleIdx];
    const title = rawTitle != null ? String(rawTitle).trim() : "";
    if (!title) continue;
    const rawDesc = descIdx !== -1 ? r[descIdx] : null;
    const rawCode = codeIdx !== -1 ? r[codeIdx] : null;
    out.push({
      title,
      description: rawDesc != null && String(rawDesc).trim() ? String(rawDesc).trim() : null,
      code: rawCode != null && String(rawCode).trim() ? String(rawCode).trim() : null,
    });
  }
  if (!out.length) warnings.push("No course rows found under the header.");
  return { rows: out, warnings };
}
