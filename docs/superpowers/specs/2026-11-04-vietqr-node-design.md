# vietqr-node — Design

Date: 2026-11-04
Status: draft, awaiting approval

## Intent

Port the .NET library [Ngochiendev/vietqr-core](https://github.com/Ngochiendev/vietqr-core) (VietQR.Core + VietQR.Deeplink.Client, MIT) to a TypeScript npm package, **`vietqr-node`**, with full feature parity.

Why: the goal is a package Vietnamese Node developers pick over the existing payload-only ones (`@viet-qr/core`, `vn-bank-qr-gen`, `@vn-skills/core`). The differentiator is doing everything in-process and offline, including rendering the payment card image server-side, so nobody has to call api.vietqr.io. mottanrung is the first consumer and the proof it works.

Reference source: upstream commit `1b92450` (2026-11-04). Paths below like `Emv/VietQr.cs` are relative to `src/VietQR.Core/` (or `src/VietQR.Deeplink.Client/` where noted) in that repo. Upstream has no test suite.

## Goals

1. **Payload build** — VietQR / NAPAS247 EMVCo merchant-presented payloads, account (`QRIBFTTA`) and card (`QRIBFTTC`) transfers, static and dynamic, optional bill number (tag 62.01), reference label (62.05) and description (tag 62.08), CRC16 tag 63. **Tag 62 limits follow upstream's code, not its docs** (user decision): each sub-tag is diacritics-stripped and silently truncated to 25 chars, and the whole tag 62 is capped at 99 (`Emv/VietQr.cs` `SetAdditionalData`). Upstream README/doc comments say 95; ignore that. Output must match upstream byte for byte. Port of `Emv/VietQr.cs`, `Emv/VietQrPayload.cs`, `Emv/TlvBuilder.cs`, `Internal/DiacriticsNormalizer.cs`.
2. **Parse / validate** — string → `VietQrInfo` (bankBin, bank, accountNo, amount, currency, countryCode, description, billNumber, referenceLabel, merchantName, merchantCity, additionalData, serviceType, qrType static/dynamic, isDynamic, crc, isValidCrc, rawTags, rawPayload). Preserve upstream nullable/absent-field semantics. Options `strictCrc` (default true), `maxPayloadLength` (default 1024). Port of `Parsing/VietQrParser.cs`, `Parsing/VietQrInfo.cs`.
3. **Decode from image** — PNG/JPEG/WebP bytes → raw text → parse. Port of `Parsing/VietQrDecoder.cs`.
4. **Embedded bank catalog** — upstream `Resources/banks.json` (76 banks, same shape as api.vietqr.io `/v2/banks`) and `Resources/logos/<bin>.png`, lookup by BIN / code / shortName. Port of `Banks/*`.
5. **Render** — PNG, JPEG, WebP, SVG. Templates `compact` (default), `print`, `qr_only`; "card" is not a separate template: it is any template with `serviceType: 'card'` (QRIBFTTC, label "Số thẻ"). Custom center logo (bytes or base64) with `centerLogoRatio` default 0.18, clamped 0.05–0.35. `size` (qr_only, default 500), `quality` (1–100, default 100). Port of `Rendering/QrImageService.cs` (~1160 lines), `Rendering/VietQrSvgRenderer.cs`, `Rendering/Templates/*`, options from `Rendering/QrRenderOptions.cs`. Output should look like upstream's `docs/image/*.png` samples.
6. **Deeplinks** — client for a deeplink gateway: `getSupportedApps()` and `createIntent(appCode, qrContent)` → `{ url, expiresInSeconds }`. Port of `VietQR.Deeplink.Client`. **Configurable**: by default it resolves the gateway through upstream's discovery (`vietqr-discovery.json`) with fallback `https://vietqr.hiendev.io.vn`, same as upstream; a `baseUrl` option points it at the user's own server and skips discovery. Keep upstream options: `baseUrl`, `discoveryUrl`, `defaultGateway`, `enableDiscovery` (true), `discoveryCacheHours` (12), `timeoutSeconds` (10). Validate CRC before calling the gateway, as upstream does.
7. **Runtimes** — plain Node (works in Express or anything else) plus an optional NestJS module.

## Feature parity acceptance

Parity is measured against upstream commit `1b92450`, not just the abbreviated API examples below. Before implementation is complete, commit a checklist mapping every public capability in `VietQR.Core` and `VietQR.Deeplink.Client` to its TypeScript equivalent or an explicit exclusion from this spec. No capability may be silently omitted.

| Capability | Required equivalent |
|---|---|
| Payload construction | Account/card × static/dynamic; amount; bill number, reference label and purpose; merchant name (59) and city (60), including upstream normalization/truncation and default-city behavior; CRC and diacritics utilities. Cover both convenience helpers and builder capabilities without requiring a .NET-style fluent API. |
| Parse / validate | All `VietQrInfo` fields listed above, including reference/merchant fields, currency/country, additional data, raw tags/payload and CRC; strict/non-strict parsing. |
| Decode | PNG/JPEG/WebP bytes to raw QR text and parsed information, fully offline. |
| Catalog / assets | Embedded banks, BIN/code/shortName lookup and logo access. |
| Render | Every template and account/card service type in PNG/JPEG/WebP/SVG; upstream render options or an explicitly documented equivalent. JPEG data URLs use `image/jpeg`. |
| Deeplinks / runtimes | Supported apps, intents, discovery/fallback/own gateway, Node entry points and optional NestJS integration as specified below. |

Only the exclusions in Non-goals and the documented image resource limits below narrow parity. Any further exclusion requires a spec update before approval; function naming and internal structure remain the builder's call.

## Non-goals

- A hosted API. The upstream ASP.NET Web API (`src/VietQR.Api`) becomes a small Express example in `examples/`, not package code.
- A browser build. Node only.
- Pixel-identical output to vietqr.io's `compact2` template.
- Owning deeplink app data (schemes/packages). That lives on the gateway.
- Upstream's .NET-isms: DI abstractions (`IQrGenerator`, `IQrAssetResolver`…), `Result<T>`, `RenderToStreamAsync`/LOH tuning.

## Anti-goals

- Any network call in payload / parse / decode / render / catalog. Only the deeplink client touches the network.
- Making NestJS (or any framework) a required install.
- Presenting the package as official VietQR / NAPAS or as upstream's author.

## Decisions (made with the user)

- Name: `vietqr-node` (free on npm as of 2026-11-04). `vietqr-core` was rejected to avoid looking like upstream's author.
- Deeplink: configurable between hiendev gateway (default) and the user's own server.
- Tool choices delegated to Claude; the user accepted the list below.
- License: MIT. Keep the original `Copyright (c) 2026 Ngochiendev` notice in LICENSE alongside ours. Port upstream `DISCLAIMER.md` (NAPAS/VietQR trademarks, bank logos are trademarks of their banks, AS-IS).

## Tooling (Claude's call, accepted)

| Concern | Choice | Why |
|---|---|---|
| Drawing / raster encode | `@napi-rs/canvas` | Skia, same engine as upstream SkiaSharp → near line-by-line port of `QrImageService`; prebuilt binaries; registers bundled TTF; encodes PNG, JPEG and WebP. `sharp` rejected: would need SVG→librsvg with unreliable custom fonts / Vietnamese text. |
| SVG output | `qr_only`: hand-written string builder (port of `VietQrSvgRenderer.cs`). `compact`/`print`: same drawing code as PNG through `@napi-rs/canvas` SVG export, text converted to paths | mirrors upstream (`SKSvgCanvas`, `QrImageService.cs:164`); no second layout implementation; no font needed on the viewer. **Spike this first** — unverified that it handles Vietnamese text and embedded PNG logos. If it doesn't, fall back to hand-writing card SVG with the font embedded as base64 `@font-face`. |
| QR matrix | `qrcode` | mature, gives raw module matrix and error-correction level |
| Image decode | `zxing-wasm/reader` | same ZXing family as upstream `ZXing.Net`, no native build; pixels come from `@napi-rs/canvas` `loadImage`. Configure `prepareZXingModule` with locally read WASM bytes before the first decode; never use its default CDN loading. Ship the matching `zxing_reader.wasm` from the pinned dependency version and initialize it once per module instance, sharing initialization across concurrent calls. |
| Build | `tsup` → ESM + CJS + `.d.ts` | |
| Tests | `vitest` | matches mottanrung |
| Node | ≥ 20 | |

## Image resource limits

Assume image inputs can come from untrusted HTTP uploads. These limits apply to `decodeImage`, `readQrText`, custom center logos and any other caller-supplied image bytes:

- Maximum compressed input: 10 MiB per image. For base64 logos, bound the encoded input before decoding it, then check the decoded byte length.
- Maximum decoded image: 16,000,000 pixels and 8192 pixels on either axis. Reject invalid, zero, non-finite or oversized dimensions before allocating a raster surface or invoking full pixel decode. Checking only after `loadImage` is insufficient; verify a bounded metadata inspection path during the image spike.
- Render `size` must be a finite integer from 1 through 4096. Any computed output surface, including fixed templates, must also fit the 16,000,000-pixel budget before allocation. Do not silently clamp oversized requests.
- Reject malformed/unsupported images and limit violations with documented, stable `VietQrError` codes. `readQrText` returns null only for a successfully decoded image with no QR text, not for a resource-limit failure.
- These are fixed package limits for the initial release, not new public configuration knobs. They are a deliberate safety restriction relative to upstream. They bound each operation, not aggregate server concurrency; consumers remain responsible for request concurrency limits.

## Public API shape

camelCase versions of upstream names; errors are thrown as a `VietQrError` with a `code` (port codes/messages from `Errors/VietQrErrors.cs`) instead of `Result<T>`. Rough surface:

```ts
// payload
createPayload(req): string              // full options incl. serviceType, billNumber, referenceLabel, merchantName, merchantCity
createStatic / createDynamic / createStaticAccount / createStaticCard / createDynamicAccount / createDynamicCard
calcCrc(str): number; verifyCrc(payload): boolean; removeDiacritics(text): string
// parse / decode
parse(payload, opts?): VietQrInfo        // throws
tryParse(payload, opts?): VietQrInfo | null
decodeImage(bytes: Buffer | Uint8Array, opts?): Promise<VietQrInfo>
readQrText(bytes): Promise<string | null>
// banks
banks: readonly BankInfo[]; findBank(binOrCode): BankInfo | undefined; getBankLogo(bin): Buffer | undefined
// render
render(payload, options): Promise<Buffer | string>   // Buffer for png/jpeg/webp, string for svg
renderDataUrl(payload, options): Promise<string>     // "data:image/png;base64,..."
// deeplink (separate entry, see below)
new VietQrDeeplinkClient(options).getSupportedApps() / .createIntent(appCode, qr)
```

Exact function names and overloads are the builder's call as long as every upstream public capability has an equivalent.

## Package layout

- `vietqr-node` — everything above except deeplink and NestJS.
- `vietqr-node/deeplink` — deeplink client (uses global `fetch`, no extra deps).
- `vietqr-node/nestjs` — `VietQrModule.forRoot({ deeplink?: {...} })` providing the services; `@nestjs/common` as optional peer dependency.
- Assets shipped in the package: `banks.json`, 76 logo PNGs, `GoogleSans-Regular.ttf`, `vietqr.png`, `vietqr_icon.png`, `napas247.png`, and the version-matched `zxing_reader.wasm` (with required third-party license notices). Resolved relative to the built module (must work from both ESM and CJS builds), never relative to the consumer's working directory. No runtime asset downloads or CDN fallback, including on the first decode in a fresh process.

## Bank catalog sync

Port upstream's `sync-banks.yml` (daily, appends new BINs from api.vietqr.io `/v2/banks`, downloads logos, rejects non-numeric BINs) but **open a PR** instead of pushing to main (Claude's call). If api.vietqr.io `/v2/banks` disappears, the job just fails; the embedded catalog keeps working.

## First consumer: mottanrung

File: `~/jimmy_dev/mottanrung-mono/apps/server/src/features/payment/vietqr-client.ts` (Express 5, ESM, already depends on `sharp`).

Signatures stay exactly the same:

- `generateVietQr(input: VietQrInput): Promise<{ qrDataURL: string; qrCode: string } | null>` — build dynamic account payload from `bankBin, accountNo, amount, addInfo`; render template `compact` (closest to vietqr.io `compact2`, Claude's call) as PNG data URL with `accountName`; `qrCode` = the EMVCo string. `VIETQR_CLIENT_ID` / `VIETQR_API_KEY` are removed entirely, code and deploy config (user decision: no on/off switch replaces them). Keep "any error → log + return null" behaviour.
- `listVietQrBanks(): Promise<VietQrBank[]>` — map embedded catalog to `{ bin, shortName, name, logo }`; `logo` stays the cdn.vietqr.io URL from `banks.json`. Cache/TTL logic and `__resetBankCache` can stay or become trivial.
- `vietqr-client.test.ts` is rewritten (it asserts the api.vietqr.io call, headers and `compact2` body, which no longer exist). Other mottanrung tests, e.g. `payment-bank-routes.test.ts`, must keep passing.
- `buildTransferNote` unchanged.

Until `vietqr-node` is on npm, mottanrung consumes it via a local path / tarball (builder's call). The mottanrung change is a separate PR in that repo after the package works.

## Testing

- **Pinned upstream fixtures (release gate):** commit a small .NET fixture generator and its input/output fixtures produced from upstream commit `1b92450`, with reproduction instructions recording the commit and generator command. Assert complete payload-string equality, not just CRC equality. Tests consume committed fixtures and do not require .NET or network access. A bank-app scan is supplemental evidence, not a substitute for upstream equality.
- Golden payload cases: account/card × static/dynamic, README sample, amount boundaries and invalid values (missing, zero, negative, fractional, over 13 digits), explicit versus inferred QR type, bill number, reference label, description, whitespace/control-character handling, Vietnamese normalization, 25-char truncation and merchant name/city normalization/defaults. Capture upstream rejection behavior as well as successful outputs. Verify the 99-char tag 62 ceiling; the three supported 25-char values plus headers total only 87, so do not invent an unreachable public-input case to reach 99.
- Parse round-trip for every build case, plus independently generated upstream fixtures asserting every exposed `VietQrInfo` field; bad CRC with `strictCrc` on/off; oversize and malformed payloads.
- Decode: render → decode round-trip for each template and format (including JPEG; SVG via raster), plus upstream `Resources/examples/*.png`.
- Render smoke tests: each template × format × service type × custom logo produces a non-empty image of the expected dimensions; verify MIME types for data URLs, including `image/jpeg`; snapshot PNGs for visual review, not pixel-strict.
- Image limits: test below/at/above byte and dimension/pixel limits, oversized base64 logos, malformed image headers and invalid render sizes. Use header fixtures or spies to verify oversized dimensions are rejected before full raster decoding/allocation, without allocating huge images in tests.
- Deeplink client: mocked `fetch` for discovery, fallback, own `baseUrl`, 404 → null, network error.
- NestJS module: one boot test.
- **Published-package smoke test (release gate):** build and run `npm pack`, then install that exact tarball into clean ESM and CJS consumer projects outside the source tree. Use only declared dependencies, without NestJS installed. In fresh processes and with all outbound network access blocked, import the main entry, build/parse a payload, look up a bank/logo, render a Vietnamese-text card with bundled assets in every output format, and decode it. The first-ever decode must succeed without an existing WASM cache. Assert zero network attempts, not merely successful output. Resolve assets while the process working directory differs from the installed package directory. Verify declaration-file resolution for both consumers and separately boot the NestJS entry with its required peers installed. Run this smoke test in CI before publishing; source-level tests alone are insufficient.

## Left to the builder

- Internal file structure, exact names and overloads, error code strings.
- How bundled asset paths resolve in ESM/CJS.
- Whether `getBankLogo` returns bytes or a data URL (or both).
- `examples/` contents beyond an Express app equivalent to upstream's QrCodes/Banks/Deeplink controllers.
- CI and npm publish workflow.
