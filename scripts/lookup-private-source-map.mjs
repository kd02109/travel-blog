import { lookupArchivedSource } from "./private-source-maps.mjs";

const [archiveDir, file, rawLine, rawColumn] = process.argv.slice(2);
if (
  process.argv.includes("--help") ||
  !archiveDir ||
  !file ||
  !rawLine ||
  !rawColumn
) {
  console.log(
    "Usage: node scripts/lookup-private-source-map.mjs <absolute-archive-build-dir> <chunks/file.js> <generated-line> <generated-column>\n" +
      "Lookup is offline and only valid when this archive came from the exact deployed build.",
  );
  process.exitCode = process.argv.includes("--help") ? 0 : 1;
} else {
  try {
    const result = await lookupArchivedSource({
      archiveDir,
      file,
      line: Number(rawLine),
      column: Number(rawColumn),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
