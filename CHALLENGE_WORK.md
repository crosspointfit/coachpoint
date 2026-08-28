# Pre-existing work and WebMCP Challenge work

The WebMCP Challenge evaluates meaningful WebMCP work completed after the
submission period opened on August 25, 2026.

## Pre-existing source material

The private Crosspoint `pt` project existed before the challenge and provides:

- A bilingual physical-therapy exercise catalog
- Exercise illustrations
- Search and selection concepts
- Crosspoint visual design tokens
- General product positioning for a home exercise program

The reference baseline inspected for this build was commit
`641c3b05a5a41fa0424aecc89f5e52d9e1959302` dated July 14, 2026.

## New challenge work

The competition edition is being implemented after August 25, 2026 and adds:

- A structured therapist case and prescription domain model
- Safety and clarification boundaries for agent-generated drafts
- A therapist-operable prescription editor
- Direct route-scoped WebMCP tools
- Visible human-versus-agent activity attribution
- Explicit human confirmation of prescriptions
- Anonymous patient program links and session persistence
- Browser-local pose sensing and exercise-set orchestration
- Agent adaptation based on browser-derived set summaries
- A therapist-patient adherence feedback loop
- WebMCP-specific lifecycle, contract, and browser verification

This document must be updated alongside material implementation changes so
judges can distinguish the challenge contribution from the source material.

## Current implementation checkpoint — August 28, 2026

Implemented in the new competition repository:

- Next.js 16.3.3 competition application with zero known production dependency
  vulnerabilities at the checkpoint
- Fifteen-item demo-only curated catalog with English-first metadata
- Search, case clarification, dosage bounds, time estimation, draft validation,
  and therapist-only confirmation domain operations
- Complete manual therapist workspace and versioned local demo persistence
- `search_exercises`, `get_exercise_details`, and `draft_program` WebMCP tools
- Direct `document.modelContext.registerTool()` lifecycle with a shared
  `AbortController`
- Plain JSON tool results, sanitized errors, execution cancellation, and
  read/write annotations
- Visible human/agent/system activity attribution
- Local patient program route backed by the therapist-confirmed program registry
- Immutable patient-session state transitions and progress calculation
- Timer/manual fallback UI with per-transition persistence
- Pause/resume, skip, stop, RPE, pain, and completion-summary paths
- Pain safety gate that stops the active set and blocks further exercise
- Self-hosted MediaPipe runtime and Pose Landmarker Lite model
- Pure half-squat angle, side-selection, debounced rep, quality, and summary
  engine
- Isolated Motion Lab with deterministic replay and optional camera overlay

Native Codex in-app Browser verification confirmed that all three tools are
discoverable and callable on `/therapist`, update the shared visible draft, and
are absent after navigating to `/`.

The same-browser patient flow was also verified from therapist confirmation to
session completion, including persistence after reload and the 5/10 pain gate.

The isolated motion lab was verified with a deterministic three-repetition
browser replay and a self-hosted GPU pose-runtime/model load. Real-camera
accuracy remains a human-assisted acceptance gate.
