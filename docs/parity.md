# Parity checklist: vietqr-core `1b92450` → vietqr-node

Every public type and member in upstream `src/VietQR.Core` and `src/VietQR.Deeplink.Client` (enumerated with
`grep -rn "public " .upstream/src/VietQR.Core .upstream/src/VietQR.Deeplink.Client | grep -v "///"`), mapped to its
TypeScript equivalent or to the spec non-goal that excludes it. Paths are relative to upstream `src/VietQR.Core/` unless noted.

## Payload (`Emv/*`, `Banks/BankBin.cs`, `Internal/DiacriticsNormalizer.cs`)

| Upstream | vietqr-node |
|---|---|
| `VietQrPayload.Create(...)` (both overloads), `VietQr.Generate(VietQrRequest)` | `createPayload(req: PayloadRequest)` |
| `VietQrPayload.CreateStatic` / `CreateDynamic` | `createStatic` / `createDynamic` |
| `VietQrPayload.CreateStaticAccount` / `CreateStaticCard` / `CreateDynamicAccount` / `CreateDynamicCard` | same names, camelCase |
| `VietQrRequest` record + `CreateStatic*`/`CreateDynamic*` factories, `EffectiveQrType` | `PayloadRequest` object; `qrType` explicit or inferred from `amount` exactly as `EffectiveQrType` |
| `VietQr` fluent builder: `SetPointOfInitiationMethod(bool \| VietQrType)` | `PayloadRequest.qrType: 'static' \| 'dynamic'` |
| `VietQr.SetTransactionAmount(string?)` | `PayloadRequest.amount` (same validation → `qr.invalid_amount`) |
| `VietQr.SetBeneficiaryOrganization(acquirerId, consumerId, serviceCode)` | `PayloadRequest.bankBin`, `accountNo`, `serviceType` |
| `VietQr.SetAdditionalData(AdditionalDataOptions)` / `SetAdditionalData(bill, reference, purpose)` | `PayloadRequest.billNumber`, `referenceLabel`, `description` (same 25-char truncation, 99 cap) |
| `VietQr.SetAdditionalDataFieldTemplate(content)` | `PayloadRequest.description` (upstream forwards to `purpose`) |
| `VietQr.SetMerchantInfo(name, city = "HANOI")` | `PayloadRequest.merchantName`, `merchantCity` (same normalization and default city) |
| `VietQr.Build()` | `createPayload` returns the built string |
| `AdditionalDataOptions` (`BillNumber`, `ReferenceLabel`, `Purpose`) | `PayloadRequest` fields above; parse side: `AdditionalDataOptions` type on `VietQrInfo.additionalData` |
| `VietQrServiceType` enum (`Account`, `Card`) | `ServiceType = 'account' \| 'card'` |
| `VietQrType` enum (`Static`, `Dynamic`) | `QrType = 'static' \| 'dynamic'` |
| `VietQr.CalcCRC(string \| ReadOnlySpan<char>)` | `calcCrc(str): number` |
| `VietQr.GenCRCCode(content)` | `genCrcCode(content): string` |
| `VietQr.VerifyCRC(content)` | `verifyCrc(payload): boolean` (lowercase hex accepted, as upstream) |
| `VietQr.ExtractBinFromEmvCo(content)` | `extractBinFromEmvCo(payload): string \| null` |
| `VietQr.RemoveDiacritics(text)`, `DiacriticsNormalizer.Normalize` | `removeDiacritics(text)` |
| `VietQr.ConvertLength(int)` | internal (TLV length is `String(n).padStart(2, '0')`); not exported |
| Constants `DefaultPayloadFormatIndicator`, `MethodStatic`, `MethodDynamic`, `NapasAid`, `ServiceCodeAccount`, `ServiceCodeCard`, `DefaultCurrency`, `DefaultCountry` | internal constants, emitted byte-for-byte in every payload (pinned by `test/fixtures/upstream/payloads.json`); not exported |
| `EmvTag`, `TlvBuilder` (`Add`, `Length`, `ToString`) | internal TLV helpers in `src/emv/payload.ts`; not exported |
| `BankBin` record (`Create`, `Value`, implicit conversions) | plain `string`; validated by `createPayload` → `qr.invalid_bin` |
| `IQrGenerator` | excluded: .NET DI abstraction (spec Non-goals) |

## Parse / decode (`Parsing/*`)

| Upstream | vietqr-node |
|---|---|
| `VietQrParser.Parse(payload, options)` → `Result<VietQrInfo>` | `parse(payload, opts): VietQrInfo` (throws `VietQrError`) |
| `VietQrParser.TryParse(...)` | `tryParse(payload, opts): VietQrInfo \| null` |
| `VietQrInfo` (all properties incl. `RawTags`, `RawPayload`, `Crc`, `IsValidCrc`, `IsDynamic`, `QrType`, `AdditionalData`, merchant fields) | `VietQrInfo` (camelCase). `rawTags` is a plain object, so integer-like keys enumerate in ascending order rather than upstream insertion order (see README) |
| `VietQrParseOptions` (`StrictCrc`, `MaxPayloadLength`) | `ParseOptions` (`strictCrc` default true, `maxPayloadLength` default 1024) |
| `VietQrDecoder.Decode(byte[] \| ReadOnlySpan<byte> \| Stream \| SKBitmap, options)`, `DecodeAsync(Stream)` | `decodeImage(bytes: Uint8Array, opts?): Promise<VietQrInfo>`; read a stream into a `Buffer` first. `SKBitmap` overload excluded (.NET/Skia type) |
| `VietQrDecoder.ReadRawQrText(SKBitmap)` | `readQrText(bytes): Promise<string \| null>` |

## Banks (`Banks/*`, `Abstractions/IBankCatalog.cs`)

| Upstream | vietqr-node |
|---|---|
| `EmbeddedBankCatalog.Instance`, `GetAll()`, `GetAllAsync()` | `banks: readonly BankInfo[]` |
| `EmbeddedBankCatalog.Find(binOrCode)`, `FindAsync(...)` | `findBank(binOrCodeOrShortName): BankInfo \| undefined` |
| `BankInfo` (`Bin`, `Code`, `ShortName`, `Name`, `Logo`) | `BankInfo` (camelCase; `logo` stays the cdn.vietqr.io URL from `banks.json`) |
| Embedded `Resources/logos/<bin>.png` | `getBankLogo(bin): Buffer \| undefined` |
| `IBankCatalog` | excluded: .NET DI abstraction (spec Non-goals) |

## Rendering (`Rendering/*`)

| Upstream | vietqr-node |
|---|---|
| `QrImageService.RenderBytesAsync`, `RenderPngBytesAsync`, `RenderWebpBytesAsync`, `GenerateQrOnlyBytes` | `render(payload, opts): Promise<Buffer>` with `format` / `template` |
| `QrImageService.RenderSvgAsync`, `VietQrSvgRenderer.Render` | `render(payload, { format: 'svg' }): Promise<string>` (`qr_only` hand-written SVG; cards via canvas SVG export, text as paths) |
| `QrImageService.GenerateVietQrBase64Async` (both overloads), `GenerateQrOnlyBase64(Async)` | `renderDataUrl(payload, opts)` (`image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`) |
| `QrImageService.SaveAsync`, `SavePngAsync`, `SaveWebpAsync` | `fs.promises.writeFile(path, await render(...))` |
| `QrImageService.RenderToStreamAsync`, `SkiaQrImageRenderer.RenderToStreamAsync` | excluded: `RenderToStreamAsync`/LOH tuning is a .NET-ism (spec Non-goals); `render` returns the whole buffer |
| `SkiaQrImageRenderer.RenderPngAsync` / `RenderAsync`, `IQrImageRenderer` | `render`; the interface is excluded as a .NET DI abstraction |
| `IQrTemplate`, `CompactTemplate`, `PrintTemplate`, `QrOnlyTemplate` (`Name`, `RenderAsync`, `RenderToStreamAsync`) | `RenderOptions.template: 'compact' \| 'print' \| 'qr_only'`; unknown → `qr.invalid_template` |
| `QrRenderOptions.Template`, `Size`, `Format`, `Quality` | `template`, `size` (1–4096, `qr_only` only, as upstream), `format` (adds `jpeg`), `quality` (clamped 1–100) |
| `QrRenderOptions.BankBin`, `BankName`, `BankFullName`, `AccountNo`, `AccountName`, `Amount`, `Description`, `BillNumber`, `ServiceType` | same names, camelCase. Bank name/logo auto-filled from the catalog like upstream |
| `QrRenderOptions.BankLogoUrl` | `bankLogo: Uint8Array` bytes (offline replacement for a URL/file path); default `getBankLogo(bin)` |
| `QrRenderOptions.CustomCenterLogo` / `CustomCenterLogoBase64` | `centerLogo: Uint8Array \| string` (base64 or data URL) |
| `QrRenderOptions.CenterLogoRatio` | `centerLogoRatio` (default 0.18, clamped 0.05–0.35) |
| `QrImageFormat` (`Png`, `Webp`, `Svg`) | `ImageFormat = 'png' \| 'jpeg' \| 'webp' \| 'svg'` |
| `VietQrImageConverter.ToBytes` / `ToStream` | `Buffer.from(s.replace(/^data:[^,]*,/, ''), 'base64')` (Node built-in) |
| `VietQrImageConverter.ToDataUrl(bytes)` | `renderDataUrl`, or `` `data:image/png;base64,${buf.toString('base64')}` `` |
| `VietQrImageConverter.SaveToFileAsync` | `fs.promises.writeFile` |
| `VietQrImageConverter.ToHtmlImgTag` | `` `<img src="${await renderDataUrl(...)}" alt="VietQR Payment">` `` |
| `VietQrGenerateResult` (`QrCode`, `QrDataURL`) | API model; reproduced by `examples/express` `GET /generate` |
| Image input limits | narrowed on purpose: see README "Image limits" (spec "Image resource limits") |

## Errors and results (`Errors/*`)

| Upstream | vietqr-node |
|---|---|
| `Result<T>` (`Ok`, `Fail`, `IsSuccess`, `Value`, `Error`) | thrown `VietQrError` (`code`, `message`); `tryParse` for the non-throwing parse |
| `VietQrErrors.MissingParam`, `InvalidAmount`, `InvalidBin`, `BankNotFound`, `InvalidTemplate`, `SystemError`, `InvalidPayload`, `InvalidCrc`, `NotVietQr`, `ImageDecodeFailed` | same codes and Vietnamese messages (`qr.missing_param` … `qr.image_decode_failed`), plus `qr.image_too_large`, `qr.invalid_image`, `qr.invalid_render_size` for the image limits |

## Configuration and DI (`VietQrOptions.cs`, `Extensions/*`, `Abstractions/*`)

| Upstream | vietqr-node |
|---|---|
| `VietQrOptions` (`SectionName`, `DefaultTemplate`, `DataPath`) | excluded: .NET configuration binding (spec Non-goals). Default template is `compact`; assets are bundled, no `DataPath` |
| `ServiceCollectionExtensions.AddVietQrCore` | `VietQrModule.forRoot()` from `vietqr-node/nestjs`; plain Node needs no registration |
| `IQrAssetResolver` | excluded: .NET DI abstraction; assets resolve relative to the built module |

## Deeplink client (`src/VietQR.Deeplink.Client/`)

| Upstream | vietqr-node (`vietqr-node/deeplink`) |
|---|---|
| `VietQrDeeplinkClient.GetSupportedAppsAsync(ct)` | `getSupportedApps(signal?)` |
| `VietQrDeeplinkClient.CreateIntentAsync(appCode, qrContent, ct)` | `createIntent(appCode, qrContent, signal?)` |
| `VietQrDeeplinkClient.CreateIntentAsync(VietQr, appCode, ct)`, `VietQrExtensions.ToDeeplinkUrlAsync` | `createIntent(appCode, createPayload(...))` |
| `VietQrDeeplinkClient.IsConfigured`, `VietQrDeeplinkOptions.IsConfigured` | `isConfigured` |
| `VietQrDeeplinkOptions` (`BaseUrl`, `DiscoveryUrl`, `DefaultGateway`, `EnableDiscovery`, `DiscoveryCacheHours`, `TimeoutSeconds`) | `DeeplinkOptions` with the same names and defaults, plus `fetch` |
| `VietQrDeeplinkOptions.SectionName` | excluded: .NET configuration binding |
| `DeeplinkEndpointResolver.ResolveBaseUrlAsync`, `IDeeplinkEndpointResolver` | internal to the client (same discovery, 4 s discovery timeout, 12 h / 15 min caches); the interface is a .NET DI abstraction |
| Discovery document (`Gateway`, `FallbackGateways`, `UpdatedAt`) | `gateway` is read; `fallbackGateways`/`updatedAt` are ignored, as upstream |
| `DeeplinkBankAppInfo` (`AppCode`, `Bin`, `ShortName`, `AppName`, `Logo`, `SupportsAutofill`, `SupportsIos`, `SupportsAndroid`) | `DeeplinkBankAppInfo` (camelCase, same defaults) |
| `DeeplinkIntentRequest` (`AppCode`, `QrContent`) | request body `{ appCode, qrContent }` |
| `DeeplinkIntentResult` (`Url`, `ExpiresInSeconds`) | `DeeplinkIntentResult` |
| Gateway envelope (`Code`, `Desc`, `Data`) | unwrapped internally |
| `VietQrDeeplinkException` | not needed: the client returns `null`/`[]` on failure exactly like upstream; caller cancellation rethrows the abort reason |
| `IVietQrDeeplinkClient`, `ServiceCollectionExtensions.AddVietQrDeeplink` | `VietQrModule.forRoot({ deeplink })` provides `VietQrDeeplinkClient` in NestJS; the interface is a .NET DI abstraction |

## API host (`src/VietQR.Api`)

Not package code (spec Non-goals). `examples/express/server.ts` ports the QrCodes (`generate`, `image`, `decode`, `parse`), Banks and Deeplink controllers. Diagnostics (`gallery`, `self-test`, `benchmark-school-test`) are not ported.
