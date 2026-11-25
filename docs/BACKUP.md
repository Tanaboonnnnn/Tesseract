# Offline workspace backup and recovery

Run these commands from `app/`. Close Tesseract, its desktop launcher, any MCP process writing to this workspace, and any other concurrent writer first. The exporter checks the files twice; it is not a live database snapshot.

```sh
npm run backup -- export ../data /path/to/private-backups/tesseract-2026-11-25.json
npm run backup -- restore /path/to/private-backups/tesseract-2026-11-25.json /path/to/private-backups/restored-workspace
npm run build:desktop
npm run server -- --restore-preview --data /path/to/private-backups/restored-workspace --port 4321
```

Open http://127.0.0.1:4321 and verify notes, projects, learning progress and completed quiz scores. Preview is local only; it does not use the normal profile's Google sync, phone pairing, OpenAI Tunnel or Git commits. It reads and writes the selected recovery copy, not the running workspace. The archive and restore directory must not already exist. The CLI does not switch the original workspace or perform in-place recovery.

On Windows, substitute ordinary PowerShell paths (quote names with spaces), for example `"$env:USERPROFILE\Documents\Backups\tesseract-2026-11-25.json"`. Keep both the archive and restored directory outside every Git checkout. Ensure the parent directory exists. Unix owner-only permissions are requested for backups; use a private folder/appropriate OS ACLs on Windows. The archive is **not encrypted**. Keep it in private storage, not in a Git repository. The checksum detects damage, not authenticity. Restore only archives you trust.

**Included:** recognized Markdown/YAML for notes, projects, tasks, maps, learning, typed visuals, goals, skills, assessments, quizzes and local schedule records. Max 32 MiB or 10,000 files per backup. No package installation or archive extraction is performed by restore.

**Excluded:** Google settings, OAuth credentials, device pairing and OpenAI Tunnel settings/keys, Git metadata, undo history, arbitrary inbox attachments and the test-only Classroom database. If you have pasted a secret into the body of a note or other included record, treat that backup as containing the secret. Google event IDs in existing schedule records are not credentials; preview never contacts Google. Copy raw inbox files separately if you want them, after reviewing them for secrets.

**From Panya:** close the original app and copy its data directory privately. Use that copy as the export source, restore to a new directory and check it in preview. The export leaves the source unchanged and does not import Panya's tokens, app preferences, or Tunnel key.
