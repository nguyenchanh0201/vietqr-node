# Upstream fixture oracle

Pinned upstream: `1b92450` (read-only `.upstream`). Requires .NET 10.

```sh
dotnet run --project tools/upstream-fixtures -- test/fixtures/upstream
```

Run from repository root. Tests consume committed JSON only, never .NET/network.
`payloads.json` is immutable oracle output; do not hand-edit it.

### Authorized lossless UTF-16 persistence

The first uncommitted generation exposed upstream's UTF-16 truncation bug: 24 `x` + emoji truncates to 24 `x` + lone U+D83D, CRC `A632`. Default System.Text.Json replaced that unit with U+FFFD without changing CRC. Work stopped and the user explicitly authorized **Preserve upstream UTF-16 losslessly** via controller message. The initial uncommitted representation was regenerated using an output-only string converter: printable ASCII except quote/backslash is literal; every other UTF-16 code unit is deterministically `\uXXXX`. This preserves original upstream code units and CRC; no upstream values, truncation, or CRC are repaired. Startup assertions cover paired emoji, lone high/low surrogates, controls, quote and backslash. JSON.parse in Node preserves these code units. Task4 must not use .NET JsonElement.GetString on unpaired fixture strings without a lossless reader: .NET may reject/replace them. This generator does not read its outputs.

## Ordered call contract

Each case records `operation`. `request` cases exercise `new VietQr().Generate(new VietQrRequest(...))`:
1. Validate JS numeric representability (adapter, below).
2. `BankBin.Create(bankBin)`.
3. Construct `VietQrRequest` with explicit `QrType`, or null: `EffectiveQrType` infers dynamic only for amount > 0.
4. `VietQr.Generate` calls `VietQrPayload.Create` with effective type. Dynamic missing/nonpositive amounts throw `ArgumentOutOfRangeException(amount)`.
5. That upstream implementation calls `SetBeneficiaryOrganization`, then `SetPointOfInitiationMethod` (manual override), then `SetTransactionAmount` only for positive amounts, then `SetAdditionalData(purpose, billNumber)` when either is nonblank, then `Build`.
Missing/0/-1 amounts infer static and emit no tag54. Explicit static with positive amount keeps static while emitting tag54. Bill number cannot override manual QR type.

`extended` cases are the deterministic direct-builder equivalent for reference/merchant fields absent from `VietQrRequest`:
1. Same adapter validation and `BankBin.Create`.
2. Construct `VietQrRequest` to obtain `EffectiveQrType`.
3. Enforce the same dynamic amount precondition by calling `VietQrPayload.Create` only when that precondition fails (records the real upstream exception, never fabricates it).
4. `new VietQr().SetBeneficiaryOrganization(bin.Value, accountNo, serviceType)`.
5. `SetPointOfInitiationMethod(request.EffectiveQrType)` BEFORE amount/additional fields. This suppresses automatic bill/reference dynamic flipping, matching request semantics.
6. `SetTransactionAmount(amount.ToString(InvariantCulture))` only for positive amounts.
7. `SetAdditionalData(purpose: description, billNumber: billNumber, referenceLabel: referenceLabel)`.
8. If either merchant field is present, `SetMerchantInfo(merchantName, merchantCity)`; when city is absent call the one-argument overload so upstream default `HANOI` applies. Neither field present means do not call it.
9. `Build`: tags 00,01,38,53,54,58,59,60,62,63 in order.

TS helpers are equivalent requests: static helpers explicitly select static; dynamic helpers explicitly select dynamic; account/card helpers set service type. `createPayload` selects the extended equivalent only when supplementary fields are present. `extractBinFromEmvCo` maps to upstream `VietQr.ExtractBinFromEmvCo` (parser with non-strict CRC, then AID/string fallback).

`parse` cases reserve inputs for Task4. They reference a generated payload id plus `surroundWhitespace` or `lowercaseCrc` transformation. Task3 does not generate parser observations or alter successful payloads for these cases.

## JS-to-.NET adapter

Parse raw JSON per case; do not deserialize the whole array into nullable long amounts. Missing/null amount maps to null. Numeric amounts must be finite, integral JS numbers and within signed Int64 range; reject before converting, with origin `adapter`, error `InvalidAmount`, paramName `amount`. No rounding/coercion to long. JSON cannot encode NaN/Infinity; adapter-only cases use `amountSpecial` tokens `NaN`, `Infinity`, `-Infinity` to represent JS nonfinite inputs. Out-of-range JSON numbers are likewise adapter errors. Valid representable inputs invoke only the recorded upstream path. Each case has its own try/catch; invalid input never aborts other cases.

Outputs: `{ id: { ok: true, payload } | { ok: false, origin: 'upstream' | 'adapter', error, paramName?, message } }`. Upstream exception type and ParamName are observations, not TS error codes.

## Error mapping contract (independent test table)

| Origin / recorded operation / exception / parameter | TS code |
|---|---|
| adapter / request or extended / InvalidAmount / amount | qr.invalid_amount |
| upstream / request or extended / ArgumentException / raw (BankBin.Create) | qr.invalid_bin |
| upstream / request or extended / ArgumentException / acquirerId (beneficiary) | qr.invalid_bin |
| upstream / request or extended / ArgumentException / consumerId (beneficiary) | qr.missing_param |
| upstream / request or extended / ArgumentOutOfRangeException / amount (Create) | qr.invalid_amount |
| upstream / request or extended / ArgumentException / money (SetTransactionAmount) | qr.invalid_amount |
| upstream / either / explicit Error.Code string | identical code |

Unexpected observations are not mapped by a generic ArgumentException fallback. Stop for controller review on suspicious/contradictory output, including dangling-surrogate JSON serialization.
