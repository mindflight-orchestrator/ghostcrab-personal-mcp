import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function undetectedMutations(report) {
  return Object.entries(report.files).flatMap(([file, entry]) => {
    const lines = entry.source.split("\n");
    const offset = ({ line, column }) =>
      lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0) +
      column -
      1;
    return entry.mutants
      .filter((mutant) => ["Survived", "NoCoverage"].includes(mutant.status))
      .map((mutant) => ({
        file,
        mutator: mutant.mutatorName,
        original: entry.source.slice(
          offset(mutant.location.start),
          offset(mutant.location.end)
        ),
        replacement: mutant.replacement,
        status: mutant.status
      }));
  });
}

const key = ({ file, mutator, original, replacement }) =>
  JSON.stringify([file, mutator, original, replacement]);

export function verifyMutationReview(report, reviews) {
  if (!report?.files || !Object.keys(report.files).length)
    throw new Error("Empty mutation report");
  const budgets = new Map(
    reviews.map((review) => {
      if (
        !review.reason?.trim() ||
        !Number.isInteger(review.count) ||
        review.count < 1
      )
        throw new Error("Invalid mutation review");
      return [key(review), review.count];
    })
  );
  const unreviewed = [];
  for (const mutation of undetectedMutations(report)) {
    const signature = key(mutation);
    const remaining = budgets.get(signature) ?? 0;
    if (remaining === 0) unreviewed.push(mutation);
    else budgets.set(signature, remaining - 1);
  }
  if (unreviewed.length)
    throw new Error(
      `Unreviewed undetected mutations:\n${JSON.stringify(unreviewed, null, 2)}`
    );
  return undetectedMutations(report).length;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const report = JSON.parse(
    readFileSync("reports/mutation/mutation.json", "utf8")
  );
  const reviews = JSON.parse(
    readFileSync("tests/fixtures/mutation-review.json", "utf8")
  );
  console.log(
    `Mutation review verified: ${verifyMutationReview(report, reviews)} undetected mutations have explicit reviews.`
  );
}
