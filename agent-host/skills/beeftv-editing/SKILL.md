---
name: beeftv-editing
description: Edit an existing HyperFrames timeline in BeefTV through the conversation. Use for changing clip timing or tracks, splitting or removing clips, editing text and visual styles, and making simple audio-level adjustments.
---

# BeefTV timeline editing

Use the native `edit_*` tools supplied by BeefTV. These tools operate on the current editing project and create normal HyperFrames editing-history entries. Do not use shell commands, rewrite project files by hand, or invent tool names.

## Edit an existing project

1. Read `index.html` with `edit_read` before making a change. Use the current selection from the editing context when the user refers to a selected clip. Otherwise identify the target from the timeline or ask which clip they mean if it is ambiguous.
2. Make the smallest requested change with `edit_patch_element`, `edit_split_element`, or `edit_remove_element`. Keep all unspecified attributes and styles unchanged. Use the element's exact `id` or `data-hf-id` as the target.
3. After a successful change, describe what changed in plain language. If a write is rejected because the project changed, reread the project before deciding what to do next.

## Native edits available

- `edit_patch_element` can change text content, inline CSS styles, and HyperFrames `data-*` attributes. Common timing attributes include `data-start`, `data-duration`, `data-media-start`, and `data-track-index`.
- For an existing audio clip, simple placement and level adjustments use the same timing attributes and `data-volume`. For fades or automation, read the enabled HyperFrames audio Skill and its attribute contract before patching `data-automation`; do not invent curves or units.
- Inline CSS supports position, size, opacity, and color. For new animations, transitions or keyframe scenes, read the enabled `hyperframes` Skill and use its candidate/check/snapshot/add-scene tools. If that Skill is disabled, explain that it must be enabled in Skill Hub. Do not overwrite a scene program through text or timing patches.
- `edit_split_element` splits one clip and preserves its source in-point. `edit_remove_element` removes one target element.
- For undo, read `edit_history` first, identify the exact requested entry, then call `edit_undo_entry` with that entry ID. Never choose an entry to undo by guessing.

## Keep the edit scoped

The editing context is frozen for the current Agent turn. Only edit the project bound to that context. Do not move generated Hypit scene source by patching arbitrary HTML: use Hypit candidate and scene tools for generated scenes, then let HyperFrames own the final timeline placement.
