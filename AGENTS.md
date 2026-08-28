# CoachPoint implementation guidance

- The approved durable plan is `webmcp-implementation-phases.md`.
- Complete and verify the therapist-side Phase 0–4 gate before starting patient camera work.
- This project uses Next.js 16. Read the relevant installed guide in `node_modules/next/dist/docs/` before changing framework conventions.
- WebMCP tools must reuse the same validated domain operations as the human UI.
- The agent may create a visible draft, but only a human therapist may confirm a prescription.
- Do not add real patient PII or autonomous diagnosis/prescribing behavior.
- Prefer direct top-level `document.modelContext.registerTool()` calls with `AbortController` cleanup.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
