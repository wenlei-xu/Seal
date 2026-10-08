---
name: video-use
description: Analyze supplied video and audio, locate spoken or visual moments, plan conversational edits and review finished footage in BeefTV. Read transcript and actual frames on demand, then use native editing tools.
metadata:
  version: 0.1.0-beeftv.1
---

# Video Use in BeefTV

The original Browser Use Video Use suite at commit
b877063835e6ea6e457124da7e28a0ae26691dc3 is preserved in `upstream/`,
including its helpers, examples and MIT attribution. Read
`upstream/SKILL.md` for editorial reasoning and relevant helper source on demand.
The execution contract below takes precedence over upstream setup instructions.

Use the current project's referenced assets, actual ASR timestamps and real frames.
Never infer footage from its filename. Cache and reuse completed transcription;
ask for word-level output when choosing word cuts. Segment-level output must not
be represented as precise word alignment. Preserve speech with reasonable padding.
Use frame inspection for source selection and rendered-output review. Combine
visual review with the existing official HyperFrames check, timing and audio checks.

All execution uses product tools: local ASR or configured channels for recognition;
existing image/video/audio generation and asset tasks; edit_* for existing clips;
HyperFrames checked candidates for new animation; Hypit for its production workflow.
Keep editable native projects and use the existing preview/export path.
Respect the user's existing requested scope and paid-generation authorization.
Do not add a mandatory confirmation to an already authorized edit.

Do not request ElevenLabs keys, write .env, run upstream installers, npm/npx,
pip/uv, start another editor, use hosted rendering, or assume Python/Manim/Remotion
and sub-agent tools exist. Helpers are reference resources, not executable grants.
Read assets through owned product tools, not arbitrary computer paths.
Persist reusable editorial methods and explicit user style as user Skills via
skill-creator; use durable product task records for production progress.
