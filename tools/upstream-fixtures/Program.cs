using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text;
using VietQR.Core;

var jsonOptions = new JsonSerializerOptions { WriteIndented = true };
jsonOptions.Converters.Add(new Utf16StringConverter());
// Adapter assertions run before touching oracle outputs.
foreach (var (input, expected) in new[] {
    ("😀", "\"\\uD83D\\uDE00\""),
    ("\uD83D", "\"\\uD83D\""), ("\uDE00", "\"\\uDE00\""),
    ("\n\t\"\\", "\"\\u000A\\u0009\\u0022\\u005C\"")
})
    if (JsonSerializer.Serialize(input, jsonOptions) != expected)
        throw new InvalidOperationException("Lossless UTF-16 adapter assertion failed.");
Console.WriteLine("Lossless UTF-16 serializer assertions passed (pair, lone high/low, controls, quotes, backslash).");

var directory = args.Length > 0 ? args[0] : "test/fixtures/upstream";
using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "cases.json")));
var outputs = new Dictionary<string, object>();
var successfulPayloads = new Dictionary<string, string>();
foreach (var item in document.RootElement.EnumerateArray())
{
    if (item.GetProperty("kind").GetString() != "payload") continue;
    var id = item.GetProperty("id").GetString()!;
    var origin = "upstream";
    try
    {
        var raw = item.GetProperty("request");
        string? Get(string key) => raw.TryGetProperty(key, out var value) ? ReadUtf16String(value) : null;
        long? amount = null;
        if (item.TryGetProperty("amountSpecial", out _) ||
            (raw.TryGetProperty("amount", out var number) && number.ValueKind != JsonValueKind.Null &&
             (number.ValueKind != JsonValueKind.Number || !double.IsFinite(number.GetDouble()) ||
              Math.Truncate(number.GetDouble()) != number.GetDouble() ||
              number.GetDouble() < long.MinValue || number.GetDouble() >= 9223372036854775808d)))
        {
            origin = "adapter";
            throw new ArgumentException("Amount must be a finite integral JS number representable as Int64.", "amount");
        }
        if (raw.TryGetProperty("amount", out var numeric) && numeric.ValueKind != JsonValueKind.Null)
            amount = checked((long)numeric.GetDouble());
        var bin = BankBin.Create(Get("bankBin"));
        var service = Get("serviceType") == "card" ? VietQrServiceType.Card : VietQrServiceType.Account;
        VietQrType? type = Get("qrType") switch { "static" => VietQrType.Static, "dynamic" => VietQrType.Dynamic, _ => null };
        var request = new VietQrRequest(bin, Get("accountNo")!, amount, Get("description"), service, Get("billNumber"), type);
        string payload;
        switch (item.GetProperty("operation").GetString())
        {
            case "request":
                payload = new VietQr().Generate(request);
                break;
            case "extended":
                if (request.EffectiveQrType == VietQrType.Dynamic && (!amount.HasValue || amount <= 0))
                    VietQrPayload.Create(bin, request.AccountNo, request.EffectiveQrType, service, amount);
                var builder = new VietQr()
                    .SetBeneficiaryOrganization(bin.Value, request.AccountNo, service)
                    .SetPointOfInitiationMethod(request.EffectiveQrType);
                if (amount > 0) builder.SetTransactionAmount(amount.Value.ToString(CultureInfo.InvariantCulture));
                builder.SetAdditionalData(request.Description, request.BillNumber, Get("referenceLabel"));
                if (raw.TryGetProperty("merchantCity", out _))
                    builder.SetMerchantInfo(Get("merchantName"), Get("merchantCity"));
                else if (raw.TryGetProperty("merchantName", out _))
                    builder.SetMerchantInfo(Get("merchantName"));
                payload = builder.Build();
                break;
            default: throw new InvalidOperationException("Unknown oracle operation.");
        }
        outputs[id] = new { ok = true, payload };
        successfulPayloads[id] = payload;
        // Diagnostics do not change the observed string or its JSON serialization.
        for (var i = 0; i < payload.Length; i++)
        {
            if (char.IsHighSurrogate(payload[i]) && i + 1 < payload.Length && char.IsLowSurrogate(payload[i + 1])) { i++; continue; }
            if (char.IsSurrogate(payload[i]))
                Console.Error.WriteLine($"WARNING {id}: unpaired UTF-16 surrogate U+{(int)payload[i]:X4} at index {i}; preserved by lossless UTF-16 JSON serialization.");
        }
    }
    catch (Exception exception)
    {
        outputs[id] = new {
            ok = false, origin,
            error = origin == "adapter" ? "InvalidAmount" : exception.GetType().Name,
            paramName = (exception as ArgumentException)?.ParamName,
            message = exception.Message
        };
    }
}
var outputPath = Path.Combine(directory, "payloads.json");
File.WriteAllText(outputPath, JsonSerializer.Serialize(outputs, jsonOptions) + "\n");
Console.WriteLine($"Wrote {outputs.Count} upstream/adapter observations to {outputPath}.");

// Parse inputs use a code-unit reader, never JsonElement.GetString on payloads.
foreach (var input in new[] { "😀", "\uD83D", "\uDE00", "\n\t\"\\" })
{
    using var assertion = JsonDocument.Parse(JsonSerializer.Serialize(input, jsonOptions));
    if (ReadUtf16String(assertion.RootElement) != input)
        throw new InvalidOperationException("Lossless UTF-16 reader assertion failed.");
}
Console.WriteLine("Lossless UTF-16 reader assertions passed (pair, lone high/low, controls, quotes, backslash).");
var parseOutputs = new Dictionary<string, object>();
foreach (var item in document.RootElement.EnumerateArray())
{
    if (item.GetProperty("kind").GetString() != "parse") continue;
    var id = item.GetProperty("id").GetString()!;
    var payload = item.TryGetProperty("payload", out var literal)
        ? ReadUtf16String(literal)!
        : successfulPayloads[item.GetProperty("payloadCase").GetString()!];
    if (item.TryGetProperty("transform", out var transform))
        payload = transform.GetString() switch {
            "surroundWhitespace" => " \t\n" + payload + "\r\n ",
            "lowercaseCrc" => payload[..^4] + payload[^4..].ToLowerInvariant(),
            "badCrc" => payload[..^4] + (payload[^4..] == "0000" ? "0001" : "0000"),
            _ => throw new InvalidOperationException("Unknown parse transform.")
        };
    if (item.TryGetProperty("transform", out var crcTransform) && crcTransform.GetString() == "lowercaseCrc" &&
        !payload[^4..].Any(unit => unit >= 'a' && unit <= 'f'))
        throw new InvalidOperationException("Lowercase CRC case must exercise a-f, not a digit-only no-op.");
    var options = new VietQrParseOptions();
    if (item.TryGetProperty("options", out var rawOptions))
    {
        if (rawOptions.TryGetProperty("strictCrc", out var strict)) options.StrictCrc = strict.GetBoolean();
        if (rawOptions.TryGetProperty("maxPayloadLength", out var maximum)) options.MaxPayloadLength = maximum.GetInt32();
    }
    var result = VietQrParser.Parse(payload, options);
    object observation;
    if (!result.IsSuccess)
        observation = new { ok = false, error = result.Error.Code, message = result.Error.Message };
    else
    {
        var info = result.Value!;
        observation = new { ok = true, info = new {
            bankBin = info.BankBin, bankInfo = info.BankInfo?.Bin, accountNo = info.AccountNo,
            serviceType = info.ServiceType == VietQrServiceType.Card ? "card" : "account",
            qrType = info.QrType == VietQrType.Dynamic ? "dynamic" : "static", isDynamic = info.IsDynamic,
            amount = info.Amount, currency = info.Currency, countryCode = info.CountryCode,
            description = info.Description, billNumber = info.BillNumber, referenceLabel = info.ReferenceLabel,
            merchantName = info.MerchantName, merchantCity = info.MerchantCity,
            additionalData = info.AdditionalData == null ? null : new {
                billNumber = info.AdditionalData.BillNumber, referenceLabel = info.AdditionalData.ReferenceLabel,
                purpose = info.AdditionalData.Purpose },
            crc = info.Crc, isValidCrc = info.IsValidCrc, rawTags = info.RawTags, rawPayload = info.RawPayload
        } };
    }
    parseOutputs[id] = new { payload, options = new { strictCrc = options.StrictCrc, maxPayloadLength = options.MaxPayloadLength }, result = observation };
}
var parsePath = Path.Combine(directory, "parse.json");
File.WriteAllText(parsePath, JsonSerializer.Serialize(parseOutputs, jsonOptions) + "\n");
Console.WriteLine($"Wrote {parseOutputs.Count} upstream parse observations to {parsePath}.");

static string? ReadUtf16String(JsonElement element)
{
    if (element.ValueKind == JsonValueKind.Null) return null;
    if (element.ValueKind != JsonValueKind.String) throw new JsonException("Expected a string.");
    var raw = element.GetRawText();
    var value = new StringBuilder();
    for (var i = 1; i < raw.Length - 1; i++)
    {
        if (raw[i] != '\\') { value.Append(raw[i]); continue; }
        var escape = raw[++i];
        if (escape == 'u')
        {
            value.Append((char)ushort.Parse(raw.AsSpan(i + 1, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
            i += 4;
        }
        else value.Append(escape switch {
            '"' => '"', '\\' => '\\', '/' => '/', 'b' => '\b', 'f' => '\f',
            'n' => '\n', 'r' => '\r', 't' => '\t', _ => throw new JsonException("Invalid escape.")
        });
    }
    return value.ToString();
}

sealed class Utf16StringConverter : JsonConverter<string>
{
    public override string Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options) =>
        throw new NotSupportedException("Output-only UTF-16 converter.");

    public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
    {
        var encoded = new StringBuilder("\"");
        foreach (char unit in value)
        {
            if (unit >= ' ' && unit <= '~' && unit != '"' && unit != '\\') encoded.Append(unit);
            else encoded.Append("\\u").Append(((int)unit).ToString("X4", CultureInfo.InvariantCulture));
        }
        encoded.Append('"');
        // All code units are escaped individually, including unpaired surrogates.
        writer.WriteRawValue(encoded.ToString(), skipInputValidation: true);
    }
}
