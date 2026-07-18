import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseNlbFromPdf } from "@/lib/pdf/nlb-parse";

/**
 * Local-only validation of the positional NLB parser against the REAL Тутунска statements
 * (gitignored `Фактури/ФАКТУРИ НЛБ`). Skips automatically when the folder is absent (CI / clean
 * checkout), so no real financial data is required or committed. When present, EVERY statement
 * must pass the integrity gate — the column-aware direction is what makes this possible.
 */
const DIR = fileURLToPath(new URL("../../../Фактури/ФАКТУРИ НЛБ", import.meta.url));
const present = existsSync(DIR);

describe.skipIf(!present)("NLB positional parser — real statements (local only)", () => {
  it("parses every real statement with a passing integrity gate", async () => {
    const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
    expect(files.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const f of files) {
      const s = await parseNlbFromPdf(readFileSync(`${DIR}/${f}`));
      if (!s.integrity.ok)
        failures.push(`#${s.statementNumber}: ${s.integrity.messages.join("; ")}`);
    }
    expect(
      failures,
      `${failures.length}/${files.length} failed:\n${failures.join("\n")}`,
    ).toHaveLength(0);
  });
});
