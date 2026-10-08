# Pinned local execution contract

The product ships HyperFrames CLI 0.8.130 with its browser and media tools. Never
upgrade it from a skill instruction. Skill Hub controls loading; the next turn
receives an immutable enabled-skill snapshot, preserving the same Pi session.

`hyperframes_context` supplies dimensions, duration, fps, timeline and selection.
`hyperframes_candidate` accepts `html` (body content), `css`, `script`, `duration`,
`width`, `height`, optional `assets` ({source,path}, both project-relative).
Only local project assets may be copied. Images, audio and video use relative
paths in the scene; video declares `muted` or `data-has-audio="true"`.

The runtime makes the `<template>` and composition root, scopes CSS to the scene,
and provides the native scoped `document` and `gsap`. Your script must define a
paused `tl` GSAP timeline, e.g.:

```js
const tl = gsap.timeline({paused:true});
tl.fromTo('#title', {y:90,opacity:0}, {y:0,opacity:1,duration:1}, 0);
tl.to('#title', {opacity:0,duration:0.5}, 3.5);
```

The runtime registers it under the actual mount ID, including replacement/split
mounts. Do not register global timelines yourself or animate using timers/CSS
animations/requestAnimationFrame. Body markup must contain no scripts, iframe,
external links or event handlers. Candidate code has no shell, network or parent
window API. Use self-contained GSAP/DOM code. Reference examples requiring other
libraries must be adapted to the shipped runtime; do not install dependencies.

`hyperframes_check` takes candidateId and command `lint` or `check`; the actual
official CLI checks a private mounted project with copied local GSAP. `check`
produces a digest-bound gate. No browser run, a changed file, or failed check
prevents timeline submission. Snapshot returns actual PNGs to the model.
The candidate's scene.html, assets and source provenance are immutable.

`hyperframes_add_scene` takes candidateId, optional start/track/append or an exact
replaceSceneId. Submission goes through existing source transactions and native
history. It uses the candidate's starting revision and never force-rebases.
After submission Studio can move, split, trim and edit addressable native elements;
arbitrary GSAP programs are still edited by producing a replacement candidate.

`hyperframes_export` starts the existing export task on a frozen current revision;
`hyperframes_exports` reads saved status. Files remain in the normal export list
for download/asset-library import. This does not create a separate render service.

Upstream `init` -> product candidate scaffold; `preview`/`present` -> current
Studio; `render` -> frozen export; `skills install/update` -> shipped Skill Hub
package; hosted `publish`/cloud/Framey -> no local equivalent, explain the boundary.
Registry examples present in this package may be read locally. Do not assume the
hosted registry's entire catalog is bundled or call online `add`/model downloads.
