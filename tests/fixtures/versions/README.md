# Game-format regression matrix

`matrix.json` records the input and expected inventory properties for every tested
format boundary. Only the existing `26.3/` responses are captures from a real
server. New versioned SNBT examples are explicitly hand-authored regression cases,
not claimed live-server observations.

- 1.20.4: legacy Count/tag and inventory equipment slots.
- 1.20.5: count/components, JSON text, nested enchantment levels.
- 1.21.4: existing component-era fixture with legacy equipment slots.
- 1.21.5: equipment compounds, NBT text, direct enchantment levels.
- 1.21.11: modern custom model data and item model references.
- 26.3: preserve and replay the existing captured responses.

Primary format references:
https://www.minecraft.net/en-us/article/minecraft-java-edition-1-20-5
https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-5

For a new supported release, capture responses with `scripts/capture-fixtures.ts`
on an isolated disposable test server, retain the capture metadata, and add a
matrix entry. Do not replace the originals or label authored examples as captures.
