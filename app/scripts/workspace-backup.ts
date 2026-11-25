import { exportWorkspace, restoreWorkspace } from "@tesseract/core";

const [mode, input, output, ...rest] = process.argv.slice(2);
if (!input || !output || rest.length || (mode !== "export" && mode !== "restore")) {
  console.error("Usage: npm run backup -- export <data-directory> <new-backup.json>");
  console.error("       npm run backup -- restore <backup.json> <new-data-directory>");
  process.exitCode = 2;
} else {
  try {
    const result = (mode === "export" ? exportWorkspace : restoreWorkspace)(input, output);
    console.log(`${mode === "export" ? "Exported" : "Restored"} ${result.files} workspace files.`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : "Workspace backup failed");
    process.exitCode = 1;
  }
}
