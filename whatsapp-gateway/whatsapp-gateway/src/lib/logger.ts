import pino from "pino";

const redacted = "[REDACTED]";
const sensitiveKeyPattern =
  /(authorization|cookie|password|secret|token|api[_-]?key|signature|database[_-]?url|connection[_-]?string|creds|auth|qr)/i;

const sensitiveTextPatterns = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:gsk|whsec|sk_(?:live|test)|rk_(?:live|test)|gh[pousr]|github_pat)_[A-Za-z0-9_-]+\b/gi,
  /postgres(?:ql)?:\/\/[^\s"'`]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /\b(?:STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|WEBHOOK_SECRET|GATEWAY_SECRET|JWT_SECRET|REFRESH_TOKEN_SECRET|GROQ_API_KEY|WHATSAPP_ACCESS_TOKEN|DATABASE_URL|DIRECT_DATABASE_URL|META_APP_SECRET|EVOLUTION_API_KEY|DEV_ACCOUNT_PASSWORD)\b\s*[:=]\s*[^\s,;]+/gi,
];

export const redactSensitiveText = (value: string) =>
  sensitiveTextPatterns.reduce((current, pattern) => current.replace(pattern, redacted), value);

const safeError = (value: unknown) => {
  if (!(value instanceof Error)) return { type: typeof value, message: "Non-Error value rejected from log" };
  const record = value as Error & { code?: unknown; statusCode?: unknown };
  return {
    type: value.name,
    code: typeof record.code === "string" ? redactSensitiveText(record.code).slice(0, 100) : undefined,
    statusCode: typeof record.statusCode === "number" ? record.statusCode : undefined,
    message: redactSensitiveText(value.message).slice(0, 300),
    stack: redactSensitiveText(value.stack ?? "").slice(0, 2000),
  };
};

export const redactSensitive = (value: unknown, depth = 0): unknown => {
  if (typeof value === "string") return redactSensitiveText(value);
  if (value instanceof Error) return safeError(value);
  if (depth > 6 || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? redacted : redactSensitive(item, depth + 1),
    ]),
  );
};

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "warn",
  serializers: {
    err: safeError,
    error: safeError,
  },
  redact: {
    paths: [
      "*.authorization",
      "*.cookie",
      "*.password",
      "*.secret",
      "*.token",
      "*.apiKey",
      "*.api_key",
      "*.signature",
      "*.databaseUrl",
      "*.database_url",
      "*.connectionString",
      "*.connection_string",
      "*.headers.authorization",
      "*.headers.cookie",
      "*.headers.x-webhook-signature",
      "*.headers.x-gateway-signature",
      "*.headers.x-gateway-secret",
      "*.key",
      "*.creds",
      "*.auth",
      "*.qr",
      "*.qrCode",
      "*.qrString",
      "*.phone",
      "*.remoteJid",
      "*.message",
      "*.body",
      "*.from",
      "*.to",
      "*.tenantId",
      "*.messageId",
    ],
    censor: redacted,
  },
  hooks: {
    logMethod(args, method) {
      const safeMethod = method as unknown as (...input: unknown[]) => void;
      safeMethod.apply(this, args.map((item) => redactSensitive(item)));
    },
  },
});
