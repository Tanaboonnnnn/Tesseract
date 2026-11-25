# Course packages and drafts

On the computer running Tesseract, open **Learning → New course** to start empty, or **Learning → Import course** to preview a versioned package. Save it as a draft, review its lessons and sources, then choose **Publish to Learning**. This means visible in your workspace, not published to the internet. You can restore a previously published revision; prior attempts remain attached to their original revision.

For ChatGPT over OpenAI Tunnel, ask it to use **classroom_format** and **submit_course_draft**, then open **Learning → Course drafts & revisions** on the main computer. A draft receipt is not a publication. After an ambiguous connection failure, check **get_draft_status** with the original request ID before considering a retry.

## Version 1 exchange format

- One UTF-8 **course.json**, or one portable ZIP with exactly **course.json** at its root (stored or deflated). The JSON and ZIP file are each limited to 256 KiB; the ZIP's decompressed entry is limited to 256 KiB independently.
- Use the same classroom bundle object as the MCP tool, **without** the outer request_id or base_revision. It includes schema_version: 1, course_id, title, language, sources and lessons. Get the sample from classroom_format.
- Lessons reference HTTPS sources by ID. Use typed visuals and Markdown, not HTML or executable scripts. Choices can be single- or multiple-answer, or a written response with a rubric.
- ZIP is a transport wrapper, not an installer. Tesseract never extracts files onto your filesystem. Extra files, folders, nested ZIP, encrypted files and non-regular entries are rejected. Offline exercise files such as PCAP stay separate in v1.
- A package has no personal progress, scores, account tokens or Tunnel settings. No remote fetch occurs during validation or preview. Use the owner review to verify source links.
- Remote MCP and a paired phone cannot publish or restore. Legacy Courses and reviewed classrooms cannot publish the same ID. Choose a different course_id when importing a revised version of a legacy course.

## Backing up reviewed courses and answers
The existing portable workspace backup (v1) excludes the classroom revision database. For now, stop Tesseract and disconnect MCP, then back up the whole workspace data directory, including its .classroom folder. Never put the separate Tunnel key or configuration into a course ZIP.

## Reading published courses from MCP
Published classrooms appear in get_overview, list_learning, search and list_published_courses. A classroom's MCP ref is courses/<course-id>, with lessons at courses/<course-id>/lessons/<lesson-id>. Project task links still use learning/<course-id>#<lesson-id>.

Use get_published_course for a revision-pinned outline; get_course_lesson reads a bounded Learn, Lab or Check section and its references. get_course_visuals retrieves a lesson's visual list or one typed visual. get_course_activity lists published/restored version events. Structured answer keys, explanations, lab expected results, and learner attempts are not sent through these tools; author text is untrusted and may itself contain explanations. Private drafts are not searchable or readable from MCP. Do not infer learner progress from null metadata.

Before updating a named existing course, get_course_revision_anchor returns the published revision and the concurrency base for staging. A pending draft is not published, and a different base can become stale; do not blindly retry a submission. Use classroom_format with include_schema for the input schema as needed. Publish still requires the owner on the main computer.
