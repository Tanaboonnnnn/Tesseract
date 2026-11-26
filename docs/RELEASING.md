# Releasing Tesseract

1. Keep `DESKTOP_VERSION` in `app/scripts/desktop-identity.ts` in sync with the tag. Verify the exact commit with tests, type-check and the desktop build. Record the platform and any skipped tests.
2. Add the version-specific changes and verification results to the GitHub Release description.
3. Include the full [Windows install and restart section](RELEASE-WINDOWS.md) in **every** GitHub Release description, including prereleases. Copy the section itself, not only a link: the commands and old-process warning must be visible in the Release page. Keep the markers so the section can be updated without replacing the rest of the notes.
4. Read back the GitHub Release after publishing. Check the tag, stable/prerelease state, and make sure the install and restart block is present.
