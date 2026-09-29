# AGENTS.md: generators

One repo, several bun workspace packages:
- `kit` (`@voxolith/gen-kit`, the authoring toolkit, plus `/preview`, a headless CPU renderer
  for tools);
- the entity generators `tree`, `bush`, `grass`, `rock`, `building` and `creature` (rigged and
  animated);
- `terrain` (`@voxolith/gen-terrain`, ground and water for a region);
- the private `contract` package, which checks every registered generator.

## Commands

```sh
bun run --cwd generators typecheck
bun run --cwd generators verify              # every package's verify, the quick contract pass included
bun run --cwd generators/contract full       # the full contract, every finer scale (CI runs this)
bun run --cwd generators/contract fine       # only the finer scales
bun run --cwd generators/tree preview species  # contact sheets into generators/tree/previews/
bun run --cwd generators/creature bench      # crowd cost
```

CI's job is `check`. Contact sheets on the site come from the site's `bun run previews`; re-run
them when a generator's look changes.

## The contract (what `contract` enforces)

- Identity and roles.
- Defaults inside their specs, and on the ParamSpec step grid.
- Determinism, and no mutation of the parameters.
- Values within roles, and the anchor inside the model.
- Nothing floating: models are one connected piece (`looseRoles` may float at finer scales).
- Share codes round-trip, and every parameter extreme works.
- A `voxelsPerMetre: 10` context gives the byte-identical model.
- Every finer scale stays within one native voxel of the native model: each fine voxel, divided
  by k, lies in or next to (26 neighbours) an occupied native voxel, loose roles included. A
  level-of-detail chain covers its fine levels with the native occupancy grown by one; a fine
  voxel outside that cover is not drawn. Checked in `full` and `fine` (about 1.5 s of the run).

A default off its step grid means a share code of the default rebuilds a different model. Fix the
default, never the step: a new step silently changes what old codes decode to.

## How generators are built

- `generate(params, rng, ctx?)` is pure. All randomness comes from `rng`, never `Math.random`.
  Voxel values are role indices.
- Parameters are in **10 voxels per metre**. Finer scales (`scales: [20, 50, 100]`; the creature is
  built at one scale and sized with `atScale`) are built natively at 10 and then refined by
  `gen-kit`'s `refine`, with per-role rules (smooth, crisp, leaves, blades, skip, plus a `detail`
  function). Never generate a fine model natively: whole-volume passes cost 1000× at 10×
  resolution.
- Tree, bush and grass redraw wood and blades from their skeletons (`drawSkeletonFine`).
  Buildings refine outside faces only, and redraw masonry at real size.
- Big models are sparse (8³ bricks, `data` empty); read them with `modelAt`.
- Limbs of radius ≥ 1 use `capsule`; thinner ones must use `line3`, whose face crossing keeps them
  6-connected.
- **Copy a shape, don't fork a generator.** Vegetation shares `growBranches`, `placeClusters`,
  `carveCanopy` and `shadeByExposure`. Solid masses start from `blob` (a noise-displaced
  superellipsoid) cleaved by `facet`. They differ only in parameters, roles and presets.
- Every ParamSpec carries `help`: the site renders the live specs, defaults, presets and roles.
- `gen-kit/preview` imports `node:zlib`, so it belongs in tools, not browser bundles.
- Creature rules:
  - nothing animated is thinner than 2 voxels (the tail tip aside);
  - joints are at least 4 voxels apart;
  - the detail budget goes on the head;
  - rigs author through `RiggedVolume`, where later fills own what they overwrite.
  - See `creature/README.md`.

## Working in the Voxolith repos

- **Layout.** Every Voxolith repo is checked out side by side under one bun workspace root, and
  depends on its siblings as `"workspace:*"`. Run `bun install` from that root, never inside a
  repo. [CONTRIBUTING](https://github.com/voxolith/.github/blob/main/CONTRIBUTING.md) lists
  which siblings each repo needs.
- **Toolchain: bun only.** There is no npm or node step anywhere. It is TypeScript 7 and Vite 8;
  scripts run `tsc`, `vite` and `bun tools/x.ts`. Use current dependency versions.
- **`tsconfig.base.json` is byte-identical in every repo**, because consumers compile the
  renderer's and engine's sources under their own flags. Change it everywhere or nowhere.
- **WebGPU, not WebGL.** Dev servers are HTTPS (`@vitejs/plugin-basic-ssl`), because WebGPU needs a
  secure context. Checks cannot see pixels: anything that changes what is drawn must be looked
  at in a WebGPU browser, with a before/after screenshot in the pull request.
- **Docs live on the site** ([voxolith.github.io](https://voxolith.github.io/docs/), repo
  `voxolith.github.io`). READMEs stay short and link there. The API reference is generated from
  the sources, so doc comments are published content: every exported symbol has a `/** */`, and
  entry files open with `@packageDocumentation`.
- **Credit research.** When an idea comes from a paper, cite it (authors, title, venue, DOI) in
  the code comment, in the docs (the page's References and `/docs/credits/`) and in the commit
  body. Check the citation against the paper or DataCite; don't cite from memory.
- **Prose.** British spelling in prose and comments (`colour`, `normalise`); identifiers follow the
  web platform (`lightColor`). "Voxolith" is capitalised in prose; lowercase is only for the
  wordmark.
- **Commits.** History is linear and read as prose:
  - The subject says what is now true, in plain words: no `feat:` prefixes, no trailing full
    stop, about 70 characters at most.
  - The body says why, what it costs and what it deliberately does not do, wrapped at about 72
    columns.
  - One change per commit. AI-assisted commits keep their `Co-Authored-By` trailer.
  - Pull requests are squash-merged or rebased; there are no merge commits.
  - Don't push, tag or publish unless asked.
- **Community files** (CONTRIBUTING with the AI policy, CODE_OF_CONDUCT, SECURITY, templates) live
  once in `voxolith/.github` and apply org-wide; don't copy them in here.
- **CI's job names are required checks** on `main` (rulesets). Renaming a job breaks merging.
