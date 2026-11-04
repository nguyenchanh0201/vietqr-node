# Spike record: SVG text export, image header inspection, local ZXing WASM

**Date:** 2026-11-04
**Branch:** `feat/vietqr-node`
**Spike code:** throwaway, under `spike/` (gitignored, deleted after this record was written)
**Decided artefacts:** this file is the contract for Tasks 6, 7, 8 and 9.

---

## Decisions

1. **SVG for `compact`/`print` uses `@napi-rs/canvas` SVG export with `SvgExportFlag.ConvertTextToPaths`.** It works: text becomes `<path>`, Vietnamese diacritics are correct, the logo is embedded as a lossless `data:image/png`. **The hand-written base64 `@font-face` fallback is NOT needed.** `qr_only` keeps the hand-written string builder (port of `VietQrSvgRenderer.cs`), unchanged from the spec.
2. **We implement our own bounded header parser** (`sniffImageSize`) for PNG `IHDR`, JPEG `SOFn`, WebP `VP8 `/`VP8L`/`VP8X`. `@napi-rs/canvas` does expose dimensions without a full decode, but only by constructing an `Image`, which is undocumented for this purpose, silently reports `0×0` for unparseable input instead of failing, and allocates the decoded raster on the `loadImage` path. Header parsing is 3–4 orders of magnitude cheaper and gives a format discriminator we need anyway.
3. **ZXing initialises from `wasmBinary` read off disk with zero network access.** Verified with a hardened `--import` hook: 0 recorded network attempts across module init plus 5 decodes. The negative control proves the assertion is not vacuous (the default path hits `https://fastly.jsdelivr.net` and is blocked). Ship `dist/reader/zxing_reader.wasm` from the pinned dependency.

---

## Environment and exact versions

| Item | Value |
|---|---|
| Node used for the spike | **v24.22.1** (dev machine default) |
| Node also re-verified on | **v20.20.2** (installed via nvm specifically to satisfy the Node ≥ 20 constraint) |
| npm | 11.19.1 (Node 24) / 10.8.2 (Node 20) |
| `@napi-rs/canvas` | **1.1.0** |
| `zxing-wasm` | **3.1.6** |
| `qrcode` | **1.5.4** |

`npm ls --depth=0` output:

```
spike@1.0.0 /Users/jimmy_nguyen/jimmy_dev/vietqr-node/spike
├── @napi-rs/canvas@1.1.0
├── qrcode@1.5.4
└── zxing-wasm@3.1.6
```

Lockfile (`package-lock.json`) resolved versions match exactly: `@napi-rs/canvas => 1.1.0`, `zxing-wasm => 3.1.6`, `qrcode => 1.5.4`.

Declared `engines`: `@napi-rs/canvas` `>= 10`, `qrcode` `>=10.13.0`, `zxing-wasm` none. Licenses: all three MIT.

**The original spike snippets were executed on both v24.22.1 and v20.20.2 with identical results.** Node 20 was installed for that check. Review-round changes and their narrower fresh verification are recorded below; the future `readAsset` integration is prescribed, not yet implemented or tested.

### Notes for Task 2 (package.json)

- `zxing-wasm` is `"type": "module"` and publishes real dual ESM/CJS through `exports` (`import` → `dist/es/...`, `require` → `dist/cjs/...`). Both work; verified `require('zxing-wasm/reader')` under Node 20 with CJS.
- `@napi-rs/canvas` ships prebuilt platform binaries as `optionalDependencies` (12 platforms). The darwin-arm64 binary is ~29 MB on disk — that is a consumer install-time download, not a package asset. Nothing to bundle.
- `zxing-wasm`'s `files` field is `["./dist"]`, so the WASM is inside the published tarball; the whole package is 3.7 MB.

---

## Decision 1 — SVG export with `ConvertTextToPaths` (PASS)

### What was proved

The spike registered `.upstream/src/VietQR.Core/Resources/fonts/GoogleSans-Regular.ttf`, created an SVG canvas, drew `"NGUYỄN VĂN ĐỨC – Số thẻ"` plus a bank logo PNG, and inspected the result.

Structural evidence (quoted output):

```
registerFromPath => {}
has font family: true [ 'Google Sans' ]
measureText width = 348.9375
logo natural size = 811 x 311
svg bytes = 80080
text tag count = 0
data:image/png occurrences = 1
largest data URI length = 42846
path element count = 24
```

- **No `<text>`:** `textTags.length === 0` asserted; a second regex `<text[\s>]` check also returns false.
- **Logo is an embedded `data:image/png`:** the logo lands inside `<defs>` as
  `<image id="img_0" width="811" height="311" xlink:href="data:image/png;base64,..."/>`
  and is placed with `<use transform="matrix(0.199753 0 0 0.199357 24 140)" xlink:href="#img_0"/>`.
- **Repeated `drawImage` of the same `Image` emits one `<defs>` entry per call site** (three draws of the same logo produced three `data:image/png` occurrences and three `id="img_N"`). Not a problem for a card (one logo), but do not assume deduplication.

### Vietnamese diacritics — the real check

**Review-round visual check (2026-11-04): PASS.** Reproduced only the SVG→PNG round trip with pinned `@napi-rs/canvas@1.1.0`, upstream `GoogleSans-Regular.ttf` and bank logo `Resources/logos/970422.png`. Used `read_image` on the 1000×280 raster: the full text `NGUYỄN VĂN ĐỨC – Số thẻ` is legible, the circumflex/tilde on `Ễ`, breve on `Ă`, stroke on `Đ`, horn/acute on `Ứ`, circumflex/acute on `ố`, hook on `ẻ`, and en dash are visible without clipping or tofu; the MB logo is intact. Original SVG and PNG are preserved in ignored `.superpowers/sdd/2026-11-04-vietqr-node/task-1-review-visual.{svg,png}`. The controller independently inspected the PNG with `read_image` and explicitly accepted the full text, accents, en dash and intact MB logo with no tofu or clipping.

The original run did **not** perform the required by-eye check. Its following per-glyph comparisons are supplementary mechanical evidence, not equivalent to visual inspection:

```
char | code   | ink | top | bottom | diacriticInk | residual(0-1) | bestOffset
"N"  | U+004E | 1732 |  50 |    119 |          213 | 0.0053 | 0,0
"Ễ"  | U+1EC4 | 1661 |  23 |    119 |          693 | 0.0129 | 0,0
"Ă"  | U+0102 | 1610 |  32 |    119 |          333 | 0.0098 | 0,0
"Đ"  | U+0110 | 1800 |  51 |    119 |          332 | 0.0060 | 0,0
"Ứ"  | U+1EE8 | 1558 |  33 |    121 |          379 | 0.0068 | 0,0
"ố"  | U+1ED1 | 1413 |  37 |    121 |          264 | 0.0090 | 0,0
"ẻ"  | U+1EBB | 1086 |  45 |    121 |          158 | 0.0085 | 0,0
WHOLE STRING {"ink":24406,"minY":23,"maxY":121,"meanAbsResidual":0.0071,"bestDx":0,"bestDy":0}
DIACRITIC CHECK: PASS (alignment-aware residual + diacritic-band ink present on Ễ Ă Đ Ứ ố ẻ)
```

Three independent signals, all positive:

1. **Placement identical.** Best alignment offset for the whole string is `(dx, dy) = (0, 0)`; no glyph needed a shift to line up. Mean absolute residual over the whole string is 0.71 % of full scale.
2. **Marks present, not dropped.** The `top` row of accented chars sits at y = 23–45 versus y = 49–51 for unaccented caps — the marks are rendered *above* cap height. Counting ink in the band above cap height (`y < 60`, baseline 120, 96 px font): `Ễ` 693, `Ă` 333, `Đ` 332, `Ứ` 379, `ố` 264, `ẻ` 158. A missing glyph would show the fallback `.notdef` box or zero band ink; neither occurs.
3. **Shapes survive.** Worst per-glyph residual after alignment is 0.0129 (1.3 % of scale), i.e. antialiasing noise only. If the font subset or path conversion were broken, this would be a shape ratio in the tens of percent.

Note the `–` (U+2013 en dash) also renders (322 ink pixels, inside the text), so punctuation outside Latin-1 is fine.

### Logo fidelity and font independence

```
source logo file bytes = 29202  embedded png bytes = 32118  byte-identical = false
source dims = 811 x 311  embedded dims = 811 x 311
max per-channel pixel delta source vs embedded = 0
rasterised ink pixels with no custom font registered = 2486
LOGO + FONT-INDEPENDENCE: PASS
```

The embedded PNG is **re-encoded, not byte-identical** (29 202 → 32 118 bytes), but **pixel-identical (`maxDelta = 0`)** and keeps its dimensions. Later tasks must not assert byte equality of the embedded image against the source file; assert pixel equality if they assert anything.

The SVG was rasterised in a process where **Google Sans was never registered** and produced full ink. That is the property that matters for `compact`/`print`: the viewer needs no font.

### Feature coverage for `QrImageService`

The card renderer uses text alignment, a synthesised bold weight, rounded rectangles, clipping and alpha. All were drawn into an SVG canvas and compared against the same commands drawn into a raster canvas:

```
has <text> = false  has clipPath = true  has opacity = true
path count = 34
direct ink = 13117  svg ink = 13438  core-solid in both = 6451  core differing = 9  (0.14%)
FEATURES: PASS (textAlign, bold, roundRect, clip, globalAlpha, multiline all survive as paths)
```

A naive whole-image pixel diff shows ~25 % differing pixels — **this is antialiasing on glyph edges, not a feature failure.** Once edge pixels are excluded, 9 of 6451 solid-core pixels differ (0.14 %) and the whole-image mean |Δ| is 0.895/255. **Do not build a naive pixel-diff assertion in later tasks; it will produce false failures.** Use the edge-aware metric or a per-glyph alignment search.

QR modules survive exactly:

```
qr version = 7 modules = 45 ec = { bit: 3 }
svg bytes = 63448  path count = 0
module agreement = 2025/2025 (100.00%)
QR SVG: PASS
```

(45×45 = 2025 modules. `path count = 0` because one `fillRect` per module emits one `<rect>` each, not `<path>` — 1067 `<rect>` elements for 1066 dark modules plus the white background. Sampling the centre of every module in the direct raster and in the SVG raster agreed 100 %.)

Two size facts for whoever writes the QR drawing code:

| Drawing style (45-module QR, cell = 11 px, total 521 px) | SVG bytes | elements |
|---|---|---|
| one `fillRect` per module | 51 002 | 1067 `<rect>` |
| one `ctx.rect()` per horizontal run + single `fill()` | **21 223** | 1 `<path>` (535 subpaths) |

Both rasterise to **identical pixels** (`dark px = 128 986` in each; module agreement 2025/2025), so run-merging is safe. It is also closer to upstream's approach. A non-integer cell size (e.g. `cell = 10.66`) inflates every coordinate to a long float and pushes the per-module form to 63 KB — **choose an integer module cell size.**

Note `qr.modules.get(r, c)` returns a **number** (`1`/`0`), not a boolean. Comparing it with `===` against a boolean silently yields all-false; cast with `!== 0` or read `qr.modules.data[r * size + c]`.

### Exact API — copy-pasteable

```ts
import { createCanvas, GlobalFonts, SvgExportFlag, loadImage } from '@napi-rs/canvas'

// Returns a FontKey object (truthy), or null on failure. Print it as
// "[object Object]" — do NOT use it as the family name.
const key = GlobalFonts.registerFromPath(fontPath, 'Google Sans')
if (!key) throw new Error(`failed to register font ${fontPath}`)

const canvas = createCanvas(width, height, SvgExportFlag.ConvertTextToPaths)
const ctx = canvas.getContext('2d')      // normal SKRSContext2D
ctx.fillStyle = '#ffffff'
ctx.fillRect(0, 0, width, height)
ctx.font = '28px "Google Sans"'          // must match the alias, quoted
ctx.fillStyle = '#1a1a1a'
ctx.fillText('NGUYỄN VĂN ĐỨC – Số thẻ', 24, 60)
ctx.drawImage(logoImage, 24, 140, 162, 62)   // logoImage = await loadImage(pngBuffer)

const svg: Buffer = canvas.getContent()      // Buffer, UTF-8 XML
```

**Hard facts later tasks must honour:**

- `createCanvas(w, h, flag)` returns an `SvgCanvas`, **not** a `Canvas`. `SvgCanvas` has `width`, `height`, `getContext('2d')`, `getContent()`, and **no `toBuffer()`** (`svgCanvas.toBuffer is not a function`). TypeScript types this correctly through the overload at `index.d.ts:1062`; if you hold the value in a variable, type it `SvgCanvas`.
- **`SvgExportFlag` values are not combinable.** The enum is `ConvertTextToPaths = 1`, `NoPrettyXML = 2`, `RelativePathEncoding = 4`, but the native binding accepts only `1`, `2`, `4` individually. `1 | 2 = 3` throws `value '3' does not match any variant of enum SvgExportFlag`. `0` also throws. **Use exactly `SvgExportFlag.ConvertTextToPaths`.**
- Flag behaviour, measured:

  | flag | `<text>` | `<path>` | `font-family` in output |
  |---|---|---|---|
  | `ConvertTextToPaths` (1) | false | 1 | none |
  | `NoPrettyXML` (2) | **true** | 0 | `Google Sans` |
  | `RelativePathEncoding` (4) | **true** | 0 | `Google Sans` |

  With `ConvertTextToPaths`, no `font-family` attribute survives anywhere — text is geometry.
- The root element is `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="W" height="H">`. **There is no `viewBox` and no `preserveAspectRatio`.** If a later task wants the SVG to scale (responsive embedding, print), it must inject `viewBox="0 0 W H"` itself or accept fixed pixel dimensions. Record this as a known limitation, not a bug.
- Output is **deterministic**: two identical builds produced the same SHA-256 prefix (`55d02988264e404a`). Safe to snapshot in tests.
- `getContent()` on an empty canvas returns a self-closing `<svg .../>` root — valid XML, no children.
- Empty string/whitespace text draws nothing; there is no `<text>` fallback path for us to worry about.
- Font registration affects `measureText`: with the alias registered, `measureText('ỄĂĐỨốẻ')` at 32 px returned 120.19 px versus 120.80 px for a missing family. To prove the bundled face is really selected, compare rendered pixels against a different family (2 917 differing px vs `Menlo`) — the numbers are close but the pixels are not.
- **`GlobalFonts.registerFromPath(fontPath)` without an alias also works**, and the real family name inside the TTF is already `Google Sans`. Passing the alias explicitly is still recommended so the TTF's internal name cannot change the contract.

### Consequence for Tasks 7 and 8

Implement `compact`/`print` exactly as above — one drawing routine that takes a `CanvasRenderingContext2D`, called either on a raster `Canvas` (PNG/JPEG/WebP) or on an `SvgCanvas`. **Do not implement the base64 `@font-face` fallback.** Do not hand-write the card SVG.

`qr_only` stays a hand-written string builder per the spec; upstream's `VietQrSvgRenderer.Render` (`.upstream/.../Rendering/VietQrSvgRenderer.cs`) is the port source, and it is independent of all of this.

---

## Decision 2 — Own header parser, not `loadImage`

### What was measured

`@napi-rs/canvas` has three ways to learn dimensions. All were timed on a 6000×4000 (24 Mpx, deliberately over the 16 Mpx budget) image:

```
small png (example): loadImage 1.7ms dims=260x260
6000x4000 png:  loadImage 18.7ms dims=6000x4000
6000x4000 jpeg: loadImage 30.1ms dims=6000x4000
6000x4000 webp: loadImage 46.3ms dims=6000x4000
new Image(); src=png: width=6000 height=4000 complete=true took 0.0ms
manual IHDR read: 6000x4000 in 8.04us
```

Isolated processes, 8000×2000 PNG (16 Mpx exactly, 72 KB on disk), RSS after `global.gc()`:

```
== mem-a (read bytes only) ==          bytes 72780 rss 48.3 MiB
== mem-b (new Image + src, no draw) == dims 8000x2000 rss 58.1 MiB t 2.20ms
== mem-c (loadImage) ==                dims 8000x2000 rss 119.2 MiB t 22.61ms
```

`loadImage` costs **+71 MiB and ~10× the time** — it allocates the full RGBA raster (8000×2000×4 = 64 MiB). `new Image(); im.src = bytes` costs ~10 MiB and 2 ms.

**The spec (`Image resource limits`) says checking dimensions after `loadImage` is insufficient. That is confirmed: the raster is already allocated by then.**

### Why the `new Image()` shortcut is still rejected

`new Image(); im.src = bytes; im.width/im.height` does give dimensions without a decode — but it is unusable as the gate:

```
truncated-100 src: dims = 8000x2000 complete = true      // PNG: header present, body absent
truncated-64 jpeg: dims = 0x0                            // JPEG: SOF not yet reached
garbage src: dims = 0x0                                  // no throw, no error
bomb src: dims = 30000x30000                             // 900 Mpx header, 0.5 MiB RSS, 0.91ms
bomb loadImage threw: Error Unsupported image type
```

- **Failure is silent.** Garbage input yields `0×0` with no exception, forcing callers to special-case zero dimensions — and a caller who forgets gets a "valid" 0-pixel image instead of a `VietQrError`.
- **Format is unknown.** `Image` does not tell you *what* it parsed. The spec needs stable `VietQrError` codes for malformed/unsupported input, which means discriminating PNG/JPEG/WebP ourselves anyway.
- **`0×0` is ambiguous** between "not an image" and "a legitimately empty image".
- The success case works, but it is an accident of the DOM-compatible API rather than a documented metadata API, and the brief's expected answer ("does not reliably expose dimensions") is borne out.

So: **parse the header ourselves.** The measured simple-header cases took ~0.6 µs per call and cannot allocate a raster. PNG and these WebP layouts need only 24–30 bytes; JPEG must walk markers to SOF, potentially past 60 KB APP segments (tested below), bounded by the caller's **10 MiB encoded-input cap**. Never slice every format to 30 bytes before inspecting it.

### Tested parser sketch for Task 6

This is a tested internal sketch, not the public interface or a complete image validator. Returns `null` for unrecognised/truncated headers; a plausible header still needs native decode validation. Task 6 must implement the binding public `inspectImageHeader(bytes)` wrapper, translating invalid headers into `VietQrError` with `qr.invalid_image`, plus `assertImageBytes(bytes)` enforcing the 10 MiB cap before inspection and dimension limits with `qr.image_too_large` before pixel allocation. Preserve those published interfaces, not this helper's nullable return type. The review regressions extract and execute this code block verbatim (only removing TypeScript syntax).

```ts
export interface ImageSize {
  format: 'png' | 'jpeg' | 'webp'
  width: number
  height: number
}

/**
 * Reads header dimensions only; JPEG may scan to SOF. Never decodes pixels.
 * Returns null for unrecognised, truncated or malformed input.
 * Callers must treat null as a malformed-image error, and must reject
 * dimensions outside the limits (<= 8192 per axis, <= 16_000_000 pixels,
 * > 0 on both axes) BEFORE handing the bytes to @napi-rs/canvas.
 */
export function sniffImageSize(buf: Uint8Array): ImageSize | null {
  if (buf.length < 12) return null

  // ---- PNG ----
  // Magic: 89 50 4E 47 0D 0A 1A 0A (offsets 0..7)
  // Offset 8:  u32be chunk length (13 for IHDR; not validated)
  // Offset 12: ASCII "IHDR"
  // Offset 16: u32be width
  // Offset 20: u32be height
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    if (buf.length < 24) return null
    if (String.fromCharCode(buf[12], buf[13], buf[14], buf[15]) !== 'IHDR') return null
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    return { format: 'png', width: view.getUint32(16), height: view.getUint32(20) }
  }

  // ---- JPEG ----
  // Offset 0: FF D8 (SOI). Then a sequence of segments:
  //   FF <marker> <u16be segmentLength including these 2 length bytes> <payload>
  // SOFn markers are C0..CF EXCEPT C4 (DHT), C8 (JPG), CC (DAC).
  // Within an SOFn payload: +0 precision, +1..2 u16be height, +3..4 u16be width.
  // Standalone markers with no length field: D8 (SOI), D9 (EOI), D0..D7 (RSTn).
  // Padding FF bytes may repeat before a marker.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    let off = 2
    while (off < buf.length) {
      if (buf[off] !== 0xff) return null
      while (off < buf.length && buf[off] === 0xff) off++
      if (off >= buf.length) return null // padding must end in a marker
      const marker = buf[off++]
      if (marker === 0xd9 || marker === 0xda) return null // no SOF before EOI/SOS
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (marker === 0 || off + 2 > buf.length) return null
      const len = view.getUint16(off)
      if (len < 2 || off + len > buf.length) return null
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (len < 7) return null // length + precision + height + width must be inside segment
        // `off` points at the 2-byte segment length; payload starts at off + 2.
        // payload+1..2 = height, payload+3..4 = width  =>  off+3 and off+5.
        return { format: 'jpeg', width: view.getUint16(off + 5), height: view.getUint16(off + 3) }
      }
      off += len
    }
    return null
  }

  // ---- WebP ----
  // Offset 0: "RIFF", 4: u32le file size, 8: "WEBP", 12: four-character chunk id.
  if (
    buf.length >= 30 &&
    String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) === 'RIFF' &&
    String.fromCharCode(buf[8], buf[9], buf[10], buf[11]) === 'WEBP'
  ) {
    const chunk = String.fromCharCode(buf[12], buf[13], buf[14], buf[15])
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    if (chunk === 'VP8 ') {
      // Lossy. Chunk payload starts at 20: 3-byte frame tag, then start code 9D 01 2A.
      // Offsets 26 and 28: u16le width, height; low 14 bits are the value.
      if (buf.length < 30) return null
      if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null
      return { format: 'webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
    }
    if (chunk === 'VP8L') {
      // Lossless. Offset 20: signature 0x2F. Offset 21: u32le bitstream,
      // bits 0..13 = width-1, bits 14..27 = height-1.
      if (buf.length < 25 || buf[20] !== 0x2f) return null
      const bits = view.getUint32(21, true)
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8X') {
      // Extended. Offset 24: u24le canvasWidth-1, offset 27: u24le canvasHeight-1.
      if (buf.length < 30) return null
      const w = buf[24] | (buf[25] << 8) | (buf[26] << 16)
      const h = buf[27] | (buf[28] << 8) | (buf[29] << 16)
      return { format: 'webp', width: w + 1, height: h + 1 }
    }
    return null
  }

  return null
}
```

Notes on the code above (all of these bit me during the spike):

- Use `new DataView(buf.buffer, buf.byteOffset, buf.byteLength)`, not `buf.buffer` alone. A `Uint8Array` view into a larger `ArrayBuffer` (which is what a Node `Buffer` from `fs.readFileSync` usually is) will read the wrong bytes otherwise. The spike used `Buffer` methods (`readUInt32BE` etc.) which handle this correctly; the `DataView` form above is the portable equivalent for a package that accepts `Uint8Array`.
- Guard order matters: check the length **before** reading, and `RIFF`/`WEBP` before the chunk id.
- `VP8L` needs a 30-byte minimum read even though the fields end at offset 25; the outer gate enforces that.
- The `VP8 ` 14-bit masking (`& 0x3fff`) is required: the top 2 bits are a scaling hint, not part of the size.

### Validation evidence

**Review round 1 — JPEG bounds regression (test first):** extracted the published `sniffImageSize` block and removed only its TypeScript signature for execution. Ran `node --test jpeg-review.test.mjs` from ignored `spike/` before editing: **exit 1, 3 tests, 1 pass, 2 fail**. `FF D8` plus ten `FF` padding bytes threw `RangeError: Offset is outside the bounds of the DataView`; SOF with declared length 2 incorrectly returned 300×200 from bytes outside that segment. Fixed padding/marker/length-field bounds and required SOF length ≥ 7 for the fields this sketch reads. It is not full JPEG conformance validation. The same command then passed: **exit 0, 3 tests, 3 pass, 0 fail**, including a real canvas JPEG and the same JPEG with a 60 KB APP1 segment. No production files were introduced; Task 6 must retain these regressions for its public wrapper.

Original spike real encodings, dimensions chosen to be wrong if the offsets are wrong (1234×567):

```
png 1234x567: bytes=7541 chunk@12="IHDR" => {"format":"png","width":1234,"height":567}
jpeg 1234x567: bytes=8305 chunk@12="\u0001\u0000\u0000\u0001" => {"format":"jpeg","width":1234,"height":567}
webp(lossy) 1234x567: bytes=3596 chunk@12="VP8X" => {"format":"webp","width":1234,"height":567}
webp(flat) 321x123: bytes=520 chunk@12="VP8X" => {"format":"webp","width":321,"height":123}
garbage => null
empty => null
truncated png 20 bytes => null
png with bad IHDR tag => null
gif => null
bomb header => {"format":"png","width":30000,"height":30000}
1000 header reads = 0.0006 ms each
example vietqr-card.png => {"format":"png","width":260,"height":260} bytes 32843
example vietqr-compact.png => {"format":"png","width":260,"height":260} bytes 32781
example vietqr-custom-logo.png => {"format":"png","width":260,"height":260} bytes 27799
example vietqr-print.png => {"format":"png","width":260,"height":323} bytes 42354
example vietqr-qronly.png => {"format":"png","width":260,"height":260} bytes 27541
HEADER PARSER: PASS
```

**Finding worth flagging:** `@napi-rs/canvas` writes WebP through the **`VP8X`** (extended) chunk, not bare `VP8 `/`VP8L`. Both encodings the spike produced were `VP8X`. The `VP8 `/`VP8L` branches were therefore validated with synthetic buffers of the exact documented layout (the branch bodies are pure offset arithmetic, so this is sufficient):

```
VP8 => {"format":"webp","width":640,"height":480}
VP8L bits=0x1e8140 => {"format":"webp","width":321,"height":123}
VP8X => {"format":"webp","width":1024,"height":768}
VP8X huge => {"format":"webp","width":1000000,"height":1000000}
WEBP BRANCHES: PASS
```

The `VP8X huge` case (10⁶ × 10⁶, i.e. 10¹² pixels) confirms the parser will report outsized values rather than overflow — the limits check in the caller is what rejects them. **The parser is not a security boundary by itself; it is a cheap, allocation-free first read. Enforce `width > 0`, `height > 0`, `width <= 8192`, `height <= 8192`, `width * height <= 16_000_000` on its output before any `loadImage` call.**

The JPEG branch was also exercised with a 60 KB APP1/EXIF segment before the SOF and with a progressive frame:

```
APP1 16B: canvas dims=300x200  parser={"format":"jpeg","width":300,"height":200}  bytes=1152
APP1 60000B: canvas dims=300x200  parser={"format":"jpeg","width":300,"height":200}  bytes=61136
SOF2 (progressive): canvas dims= 300x200  parser= {"format":"jpeg","width":300,"height":200}
avif: canvas dims=300x200 parser=null
```

`avif` is a format `@napi-rs/canvas` can decode but the parser returns `null` for. Per the spec we only need PNG/JPEG/WebP; **AVIF inputs must be rejected as unsupported** (`sniffImageSize === null` → a stable unsupported-format error), not passed through to `loadImage`. That is a deliberate narrowing relative to what canvas could decode, and it should be stated in the public docs for `decodeImage` / custom logos.

---

## Decision 3 — ZXing WASM loaded from disk, zero network

### WASM path and identity

The file is exactly where the brief says (verified `existsSync` + `statSync`):

```
node_modules/zxing-wasm/dist/reader/zxing_reader.wasm
```

| Property | Value |
|---|---|
| Path (from package root) | `zxing-wasm/dist/reader/zxing_reader.wasm` |
| Size | **946 860 bytes** (0.903 MiB) |
| SHA-256 | `5003fb4b88c4fbd1fd518a2fd8c8ad365c519e183a08c03a322dddfea3cea84e` |
| Package export | `zxing-wasm/reader/zxing_reader.wasm` (documented subpath, `exports` maps it for both `import` and `require`) |
| Package total size | 3.7 MB (also contains `zxing_full.wasm` 1 544 947 B and `zxing_writer.wasm` 667 014 B) |

`zxing-wasm` also exports `ZXING_WASM_VERSION` (`"3.1.6"`) and `ZXING_WASM_SHA256` from `zxing-wasm/reader`, which is a convenient runtime assertion that the shipped WASM matches the JS.

**Native spike resolution probes — separate ESM and CJS calls:**

```js
// Native ESM (.mjs), no bundler:
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const wasmPath = require.resolve('zxing-wasm/reader/zxing_reader.wasm')
// Or, in native ESM only:
const wasmUrl = import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm')
```

```js
// Native CJS (.cjs), a DIFFERENT call site using native require:
const { prepareZXingModule, readBarcodes } = require('zxing-wasm/reader')
const wasmPath = require.resolve('zxing-wasm/reader/zxing_reader.wasm')
```

The native probes resolve the same on-disk file. The original Node 20 `.cjs` probe verified **native `require`**, not `createRequire(import.meta.url)` transpiled to CJS. Raw `import.meta.url` is ESM-only; it does not work in native CJS, and these probes provide **no evidence of tsup CJS compatibility** for that expression.

**Binding Task 9 packaging mechanism:** copy the version-matched `zxing_reader.wasm` from the pinned dependency into the package assets at build time, then load it with `readAsset('zxing_reader.wasm')`. This is required, not an optional alternative to runtime dependency-subpath resolution. Task 2's asset helper must resolve relative to the built module (`new URL('./assets/...', import.meta.url)` in ESM, `path.join(__dirname, 'assets', ...)` in CJS), never `process.cwd()`; the built ESM/CJS release smoke tests must verify both outputs. The native probes above are spike evidence only, not the production asset-loading prescription.

### The exact init and decode calls

The original native-ESM spike used `readFileSync(require.resolve(...))` with the ESM `createRequire` call above; native CJS used its own `require`. Both proved the `wasmBinary` init API, not a dual-build asset helper. Task 9 must substitute the binding copied-asset call below (integration is verified in Tasks 2/9, not claimed tested by this spike):

```ts
import { readAsset } from './assets'
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'

const wasmBinary = readAsset('zxing_reader.wasm')

// Module-level singleton. `fireImmediately: true` is REQUIRED for this overload to
// return a promise; without it prepareZXingModule returns void and instantiation is
// deferred to the first decode (also network-free, but the promise form is what we
// want to await once at module init).
const modulePromise = prepareZXingModule({
  overrides: { wasmBinary },
  fireImmediately: true,
})
```

`overrides` is `Partial<EmscriptenModule>`. **`wasmBinary` accepts either a `Buffer` or a `Uint8Array`** (both verified). Supplying it causes Emscripten to skip `locateFile`/fetch entirely.

Decoding, where `imageData` is an `@napi-rs/canvas` `ImageData`:

```ts
const img = await loadImage(bytes)                     // bytes = Buffer | Uint8Array
const canvas = createCanvas(img.width, img.height)
const ctx = canvas.getContext('2d')
ctx.drawImage(img, 0, 0)
const imageData = ctx.getImageData(0, 0, img.width, img.height)

await modulePromise
const results = await readBarcodes(imageData, { formats: ['QRCode'] })
```

**`ImageData` shape:** `@napi-rs/canvas` returns its own `ImageData` class — `constructor.name === 'ImageData'`, `.width`, `.height`, `.data` a `Uint8ClampedArray` of `width * height * 4` RGBA bytes (measured `260×260`, `data.length = 270400`). zxing-wasm **duck-types** it (`'width' in input && 'height' in input && 'data' in input`) and never references `globalThis.ImageData`, which matters because **Node 20 has no global `ImageData`** (`typeof globalThis.ImageData === 'undefined'` on v20.20.2; it exists on v24). Do not add a polyfill; do not pass a plain `{data,width,height}` unless you are sure — it works by duck-typing, but the canvas object is the supported path.

### Result shape (`ReadResult`) — Task 9 needs this

`readBarcodes` returns `Promise<ReadResult[]>`. Measured key listing for one decoded example:

```
isValid: boolean = true
error: string = ""
format: string = "QRCode"
symbology: string = "QRCode"
bytes: object = {...}                 // Uint8Array
bytesECI: object = {...}              // Uint8Array
text: string = "00020101021238560010A000000727012600069704220112056789799999"
contentType: string = "Text"
hasECI: boolean = false
position: object = {...}
rotation: number = 0
isMirrored: boolean = false
isInverted: boolean = false
symbologyIdentifier: string = "]Q1"
sequenceSize: number = -1
sequenceIndex: number = -1
sequenceId: string = ""
lineCount: number = 0
symbol: object = {...}
extra: string = "{\"DataMask\":0,\"UEC\":0.72,\"Version\":\"8\",\"ECLevel\":\"Q\"}"
version: string = "8"
readerInit: boolean = false
ecLevel: string = "Q"
orientation: number = 0
```

**The text is in `.text`.** Filter on `r.isValid` (or `r.format === 'QRCode'`); `r.text` is `''` when invalid. `r.ecLevel` is directly available (no need to parse `extra` for it). `r.bytes` is the raw QR payload as `Uint8Array` — for an EMVCo payload it is ASCII, so `Buffer.from(r.bytes).toString('utf8')` equals `r.text`.

**Invalid inputs do not throw.** `readBarcodes` resolves with a single invalid result instead:

```
junk 4 bytes      => count 1 [{"isValid":false,"format":"","error":"Failed to load image from memory","text":""}]
text bytes        => count 1 [{"isValid":false,"format":"","error":"Failed to load image from memory","text":""}]
8-byte png magic  => count 1 [{"isValid":false,"format":"","error":"Failed to load image from memory","text":""}]
```

So `readQrText`'s "return `null` only for a successfully decoded image with no QR text" contract must be implemented on our side: distinguish `results.length === 0` (decoded, no QR), `results[0].isValid === false` with an `error` (input was not a decodable image → throw a `VietQrError`), and a valid result (success). Do not rely on zxing to throw.

Blank-image behaviour (the normal "no QR here" case):

```
E) blank image results = []
F) blank + returnErrors results = 0 []
```

`returnErrors: true` did **not** produce an entry for a decodable-but-QR-less image — it stays an empty array. Empty array is the no-QR signal.

### Zero-network proof

`spike/block-net.mjs` is an `--import` hook that patches **and records** five primitives, each throwing on use:

| Patched | Detail recorded |
|---|---|
| `net.Socket.prototype.connect` | `host:port` (object or positional args) |
| `tls.connect` | `host:port` |
| `dns.lookup` | hostname (calls back with an error) |
| `dns.promises.lookup` | hostname (rejects) |
| `globalThis.fetch` | request URL |

Run exactly as the brief specifies, from `spike/`:

```
$ node --import ./block-net.mjs ./decode-spike.mjs
[block-net] installed: net.Socket.prototype.connect, tls.connect, dns.lookup, dns.promises.lookup, globalThis.fetch
network attempts recorded before decode: 0
require.resolve("zxing-wasm/reader/zxing_reader.wasm") =>
   /Users/jimmy_nguyen/jimmy_dev/vietqr-node/spike/node_modules/zxing-wasm/dist/reader/zxing_reader.wasm
wasm size = 946860 bytes ( 0.903 MiB )
wasm sha256 = 5003fb4b88c4fbd1fd518a2fd8c8ad365c519e183a08c03a322dddfea3cea84e
resolved file exists = true
prepareZXingModule resolved, module keys sample = wasmBinary,_malloc,_free,HEAPU8,ReadResults,readBarcodesFromImage
examples: vietqr-card.png, vietqr-compact.png, vietqr-custom-logo.png, vietqr-print.png, vietqr-qronly.png

vietqr-card.png  260x260  results=1  valid=1  14.2ms
   format="QRCode" symbology="QRCode" isValid=true ecLevel="Q" bytes=142
   text="00020101021238600010A00000072701300006970422011697042220284939970208QRIBFTTC5303704540410005802VN62330108CARD-0010817Chuyen vao the MB63041DE1"

vietqr-compact.png  260x260  results=1  valid=1  1.1ms
   format="QRCode" symbology="QRCode" isValid=true ecLevel="Q" bytes=138
   text="00020101021238560010A0000007270126000697042201120567897999990208QRIBFTTA5303704540420005802VN62330110HD202610290815Thanh toan cafe63049695"

vietqr-custom-logo.png  260x260  results=1  valid=1  0.9ms
vietqr-print.png  260x323  results=1  valid=1  0.7ms
vietqr-qronly.png  260x260  results=1  valid=1  0.7ms
   (all three decode to the same 138-byte payload as vietqr-compact.png)

network attempts after decode: 0
ZERO-NETWORK ASSERTION: PASS (0 recorded attempts across init + 5 decodes)
```

All five examples decode to valid `QRCode` results at `ecLevel: "Q"`. `vietqr-card.png` carries a card-specific payload (`...QRIBFTTC...CARD-001...Chuyen vao the MB...`, 142 bytes); the other four share the standard transfer payload.

The assertion is a real `assert.equal(attempts.length, 0, ...)` that names every offending attempt in the failure message, executed **after** module init and all five decodes.

### Negative control (the assertion is not vacuous)

A control run proves the hook catches real attempts **and** that zxing's default path really is a network fetch:

```
$ node --import ./block-net.mjs ./control-net.mjs
direct probes thrown = 3 recorded = 3 ["net.Socket.prototype.connect","globalThis.fetch","dns.promises.lookup"]
[block-net] BLOCKED globalThis.fetch: https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/reader/zxing_reader.wasm
[block-net] BLOCKED globalThis.fetch: https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/reader/zxing_reader.wasm
wasm streaming compile failed: Error: network access blocked by block-net.mjs (...)
failed to asynchronously prepare wasm: both async and sync fetching of the wasm failed
Aborted(both async and sync fetching of the wasm failed)
default-path recorded attempts = 2
NEGATIVE CONTROL: PASS — default zxing path would hit https://fastly.jsdelivr.net; blocked and recorded
```

The CDN URL is baked into the package source (`dist/es/share.js`: `locateFile` → `https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/${dir}/${file}`). **Without `wasmBinary`, the first decode fetches from jsDelivr — twice (streaming attempt, then ArrayBuffer fallback).** That is exactly the failure the spec forbids, which is why `wasmBinary` is mandatory and why Task 9 must initialise eagerly rather than lazily on first decode.

### Init variants, for Task 9's convenience

```
A) prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true })   attempts = 0
B) prepareZXingModule({ overrides: { wasmBinary } }) + first readBarcodes     attempts = 0
C) no prepare at all                                                          attempts = 2   (CDN, then Aborted)
```

Both A and B are network-free. **Use A**: it surfaces a bad WASM path as a rejected promise at startup instead of as an `Aborted(...)` thrown from the first user decode, and it warms the module so the first decode is not penalised. B is an acceptable fallback if a consumer environment makes top-level await awkward — but it moves the failure into the first request.

Caching/concurrency, measured:

```
B) repeat prepareZXingModule = 0.02 ms          // same overrides -> cached module, no re-instantiation
D) 20 concurrent decodes = 21.6 ms total; all valid = true
G) tryHarder=true results = 1 true
H) raw PNG bytes input results = 1 true 00020101021238560010   // Uint8Array of PNG works too
J) purge + re-prepare = 4.0 ms  (29.1 ms on Node 20)
K) decode after purge valid = true
```

`prepareZXingModule` caches per-factory and reuses the module when `overrides` compare shallow-equal via the default `equalityFn` (`Object.is` per key — note `wasmBinary` is compared **by reference**, so always reuse the same `Buffer`/`Uint8Array` instance; re-reading the file per call would re-instantiate). Concurrent decodes share the one instance safely. `purgeZXingModule()` exists but should not be called in normal operation.

**`overrides.wasmBinary` must be the same object identity on every `prepareZXingModule` call.** Reading the WASM once at module scope and reusing the variable is therefore required, not merely an optimisation.

---

## Problems encountered

1. **`SvgExportFlag` values cannot be OR-ed.** `SvgExportFlag.ConvertTextToPaths | SvgExportFlag.NoPrettyXML` → `3` → `Error: value '3' does not match any variant of enum SvgExportFlag`. The TypeScript `enum` invites this; the native binding rejects it. Documented above; later tasks must pass a single flag.
2. **`SvgCanvas` is not a `Canvas`.** It has no `toBuffer()` and fails an `instanceof` check against `Canvas`. Only `getContent()` returns bytes.
3. **Naive pixel diffs between direct raster and SVG-raster are useless.** Antialiasing on path edges produced 25 % apparent mismatch for visually identical output. The spike switched to an alignment-aware, edge-excluding metric (9/6451 core pixels differ). **Later tasks must not assert on raw pixel equality between a canvas render and an SVG rasterisation of the same drawing.**
4. **`new Image().src = garbage` returns `0×0` silently**, and a PNG truncated after the header reports full dimensions with `complete === true`. This is why the `Image` shortcut was rejected as the limits gate even though it is fast.
5. **`@napi-rs/canvas` encodes WebP as `VP8X`**, so the `VP8 `/`VP8L` header branches could only be validated with synthetic buffers. Flagged for whoever reviews the parser.
6. **Node 20 is not the machine default** (v24.22.1 is). Node 20.20.2 was installed via nvm and every spike was re-run on it; results matched. The only observable difference: `globalThis.ImageData` is undefined on Node 20 (harmless — zxing duck-types), and `purgeZXingModule` + re-init was 29 ms versus 4 ms (irrelevant, not on any real path).
7. **Memory measurement is noisy without isolation.** The first attempt to measure `loadImage`'s allocation in one process gave nonsense because the source canvas was still alive. Re-measured in three separate processes with `--expose-gc`, which produced the clean 48 / 58 / 119 MiB figures.
8. **The original run omitted the required by-eye check** and deleted its images. Mechanical glyph comparisons did not satisfy that requirement. Review round 1 regenerated the SVG/PNG with pinned canvas and upstream assets; the implementer and controller both used `read_image` and accepted the visible text/diacritics/logo. The original review artifacts remain in ignored SDD storage, not in deleted scratch.

## Things later tasks must know that the above does not already say

- **Asset resolution rule.** Font, logos and the build-copied, version-matched WASM must all use the module-relative `readAsset` mechanism. Task 9 loads `readAsset('zxing_reader.wasm')`; runtime dependency-subpath resolution is not an alternative. The release gate must exercise ESM and CJS with cwd outside the package. Raw `import.meta.url` belongs only in the ESM resolution branch, never unmodified CJS.
- **`decodeImage` order of operations** (Task 6 + Task 9): bound the encoded input at 10 MiB → `sniffImageSize` → reject `null` as unsupported/malformed → apply the dimension limits → only then `loadImage` → draw to a canvas → `getImageData` → `readBarcodes`. Nothing allocates before the limits check.
- **AVIF and GIF will be rejected** by this parser even though `@napi-rs/canvas` could decode them. That is the intended narrowing; state it in the `decodeImage` / custom-logo docs and give it a stable error code rather than a generic "unsupported".
- **`qr_only` SVG remains hand-written.** Decision 1 only covers `compact`/`print`. Do not route `qr_only` through an `SvgCanvas` — upstream's own `qr_only` SVG is a different code path and the spec pins it.
- **The exported SVG has no `viewBox`.** If print/responsive embedding needs scaling, Tasks 7/8 must inject `viewBox="0 0 W H"` into the root element (a one-line string replacement on `getContent()`), or document fixed-size output.
- **Text drawing must set `ctx.font` with the exact registration alias**, quoted (`'28px "Google Sans"'`). Without the alias the browser-style family lookup can silently fall back to a system sans-serif and Vietnamese diacritics would still *look* fine but the layout would differ from the raster path — the regression would be a width/shape mismatch, not obviously broken text. Register once at module load and assert the `FontKey` is truthy.
- **`GlobalFonts.registerFromPath` returns a `FontKey` object, or `null`.** Check it; printing it yields `[object Object]`, which is easy to mistake for an empty result in logs.
- The spike's throwaway directory `spike/` was deleted. Everything needed to reproduce it is in the code blocks above; the deleted scripts were `svg-spike.mjs`, `svg-verify.mjs`, `logo-verify.mjs`, `svg-features.mjs`, `svg-qr.mjs`, `flag-matrix.mjs`, `header-probe.mjs`, `header-parse.mjs`, `sniff.mjs`, `webp-branches.mjs`, `header-formats.mjs`, `exif-jpeg.mjs`, `mem-a/b/c.mjs`, `bomb-mem.mjs`, `block-net.mjs`, `decode-spike.mjs`, `decode-more.mjs`, `junk-check.mjs`, `control-net.mjs`, `init-variants.mjs`, `resolve-cjs.cjs`.
