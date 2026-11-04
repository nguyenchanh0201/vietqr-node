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
foreach (var item in document.RootElement.EnumerateArray())
{
    if (item.GetProperty("kind").GetString() != "payload") continue;
    var id = item.GetProperty("id").GetString()!;
    var origin = "upstream";
    try
    {
        var raw = item.GetProperty("request");
        string? Get(string key) => raw.TryGetProperty(key, out var value) ? value.GetString() : null;
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
