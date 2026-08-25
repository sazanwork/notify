# catalogue — what every card looks like

Builds the page the owner reads to see every kind of notification this package
sends: `telegram-cards.html`, published as an Artifact.

    npm run build && node catalogue/build.mjs && node catalogue/assemble.mjs

Run from the package root, and build `dist/` first — the page is rendered by
the package's OWN renderer, never by hand.

`cards.mjs` holds one entry per card with the arguments its real sender passes.
Two rules keep it honest, and both exist because the page has already lied:

- `expectTag` declares the tag line the sender produces, and the build refuses
  to write the page if the renderer disagrees. Six cards once showed a tag that
  never exists, because the entry dropped the `key` the sender passes.
- Anything without an event is `raw` — the free-text report goes through
  `sendReport`, which standardises delivery and not the format, so it has no
  tag line at all.

When a sender changes, change its entry here in the same turn. A card that no
sender can produce is worse than no card: he plans against this page.
