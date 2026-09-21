# Mockups

Each `*.dc.html` is a self-contained artboard (plain HTML with inline styles; the
`<script src="./support.js">` line is the Claude Design runtime hook and can be
ignored when reading them as HTML). Images referenced by filename are in `art/`.
The same artboards are published as an editable Claude Design canvas:
https://claude.ai/code/artifact/9311d049-ae74-4481-a855-843669972bfa

## Page 1 — title pages, within the current design (WP-12)

| Artboard | Frame | Shows |
|---|---|---|
| `Main.dc.html` | 390×844, dark | Show page: standard header with back, hero as the home page's featured card, one meta/score/action row, progress card with the next episode inline, season chips over a list built from the still tile, cast rail, tab bar kept. |
| `Episode.dc.html` | 390×844, dark | Episode page on the same skeleton: still card with neighbours peeking, chip row, "Watched" state as the primary, thumbs, synopsis, "How did it feel" as a chip row with line icons and tallies, previous/next tiles, cast. |
| `Movie.dc.html` | 390×844, **light** | Film page following the light theme like any other page; "Your verdict" card combines the rating slider and the feelings chips, under the actions. |
| `ShowDesktop.dc.html` | 1280×900, dark | The same show page wide: ordinary header, hero card with the poster tucked in, two columns (progress + synopsis + cast / seasons list). |

Tokens used are the app's own: Geist / Geist Mono, ink ramp (`#07070c`, `#11111c`,
`#171724`, `#232336`, `#6f6f8f`, `#9a9ab8`, `#e6e6f2`), flare violet (`#7c3aed`,
`#8b5cf6`, `#a78bfa`), ember `#fbbf24`, fresh `#34d399`; 16 px card radius, 12 px
tile radius, 48 px phone controls / 44 px desktop.

## Page 2 — concept: "the reel" (section 6 of the plan)

| Artboard | Frame | Shows |
|---|---|---|
| `ConceptHome.dc.html` | 390×844 | "Tonight": one sentence in display type, the featured reel, then one row per show on the go (name, reel, next), Landing as a dated list, Trending as small uniform posters. Plain tab bar with mono labels. |
| `ConceptShow.dc.html` | 390×844 | Show page: title block on the plain surface with the poster small at the right, the season reel as the hero, next episode + "Log it", three stats, season rail as numbers, episode rows with reel frames. |
| `ConceptDesktop.dc.html` | 1440×900 | "Tonight" wide: reels in the left column, Landing + Trending + three numbers on the right. |

Type: Bricolage Grotesque (display, titles only), Geist (body), Geist Mono
(numbers, labels). Surface `#0b0b0f`, hairline `#1e1e26`, text `#f2f1ee`, muted
`#8f8f9c`, faint `#5c5c68`, accent `#8b5cf6` used only for "next".
