# Hendychrist Portfolio

Static HTML, Sass, and JavaScript portfolio deployed directly through GitHub Pages.

## Structure

```text
index.html            # Home page and GitHub Pages entry point
projects/             # Portfolio project detail pages
assets/sass/          # Sass source files
assets/css/           # Generated CSS and vendor styles
assets/js/            # JavaScript entry point, features, and vendor scripts
assets/parallax-1080-30fps-frame/ # Local 1080p masters and committed WebP hero sequence
images/               # Site images
scripts/              # Asset generation and repository validation
```

## Development

```sh
pnpm install
pnpm run dev
```

The development server runs at `http://127.0.0.1:4173`. Sass changes are watched and compiled automatically.

### Parallax frame assets

The local master sequence contains 306 JPEG files exported from Premiere Pro at
1920×1080 and 30 fps, named `hvec000.jpg` through `hvec305.jpg`. These source
files are intentionally ignored by Git. Install the
`cwebp` command-line tool and make sure it is available in `PATH`, then generate
the publishable assets with:

```sh
pnpm run build:parallax
```

The conversion runs at most four `cwebp` processes at once and skips outputs
whose modification time is newer than both the matching source and conversion
script. It produces:

```text
assets/parallax-1080-30fps-frame/webp/frame000.webp ... frame305.webp
# 1920×1080, quality 82
```

The WebP directory is a production asset and must be committed so GitHub Pages
can serve the complete sequence. Keep the ignored JPEG masters locally for
future regeneration. The obsolete `assets/parallax/` directory is also ignored.

## Production CSS

```sh
pnpm run build
```

Edit files in `assets/sass/`. The files `assets/css/main.css` and `assets/css/noscript.css` are generated build artifacts and must remain committed for GitHub Pages.

## Link Check

```sh
pnpm run check:links
```

This verifies local HTML links and assets, CSS imports and URLs, and the JavaScript module graph. It also detects filename case mismatches that can work locally on macOS but fail on GitHub Pages, and requires all 306 committed WebP frames to exist and be non-empty.

## Parallax sequence hero

The home page maps all 306 frames to a three-viewport, scroll-driven hero.
Frames are loaded around the current scroll target and painted to a responsive
canvas. The 1080p, 30 fps source keeps decoding and network work practical while
retaining every frame from the web export.

GSAP and ScrollTrigger 3.15.0 are version-pinned through jsDelivr. The first
WebP remains available as a poster when JavaScript, the CDN, or motion effects
are unavailable.
