const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|password|pass|secret|token|api[_-]?key|signature|rawbody|checkouturl|checkout_url|sessionid|session_id|database[_-]?url|connection[_-]?string|creds|auth|qr)/i;

const SENSITIVE_VALUE = '[REDACTED]';

const SENSITIVE_TEXT_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:gsk|whsec|sk_(?:live|test)|rk_(?:live|test)|gh[pousr]|github_pat)_[A-Za-z0-9_-]+\b/gi,
  /postgres(?:ql)?:\/\/[^\s"'`]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /\b(?:access_token|refresh_token|password|pass|secret|api[_-]?key|token)\s*[:=]\s*[^\s,;]+/gi,
  /\b[A-Z0-9_]*(?:CLIENT_SECRET|WEBHOOK_SECRET)\b\s*[:=]\s*[^\s,;]+/gi,
  /\b(?:STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|WEBHOOK_SECRET|GATEWAY_SECRET|JWT_SECRET|REFRESH_TOKEN_SECRET|GROQ_API_KEY|WHATSAPP_ACCESS_TOKEN|DATABASE_URL|DIRECT_DATABASE_URL|META_APP_SECRET|EVOLUTION_API_KEY|DEV_ACCOUNT_PASSWORD|INTEGRATION_ENCRYPTION_KEY|MERCADO_PAGO_CLIENT_SECRET|MERCADO_PAGO_WEBHOOK_SECRET|ZOHO_SMTP_PASS)\b\s*[:=]\s*[^\s,;]+/gi,
];

export const redactSensitiveText = (value: string) =>
  SENSITIVE_TEXT_PATTERNS.reduce((current, pattern) => current.replace(pattern, SENSITIVE_VALUE), value);

export const safeErrorForLog = (value: unknown) => {
  if (!(value instanceof Error)) {
    return {
      type: typeof value,
      message: 'Non-Error value rejected from log',
      stack: '',
    };
  }
  const record = value as Error & { code?: unknown; statusCode?: unknown };
  return {
    type: value.name,
    code: typeof record.code === 'string' ? redactSensitiveText(record.code).slice(0, 100) : undefined,
    statusCode: typeof record.statusCode === 'number' ? record.statusCode : undefined,
    message: redactSensitiveText(value.message).slice(0, 300),
    stack: redactSensitiveText(value.stack ?? '').slice(0, 2000),
  };
};

export const redactSensitive = <T>(value: T, depth = 0): T => {
  if (typeof value === 'string') return redactSensitiveText(value) as T;
  if (value instanceof Error) return safeErrorForLog(value) as T;
  if (depth > 6 || !value || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1)) as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? SENSITIVE_VALUE : redactSensitive(item, depth + 1),
    ]),
  ) as T;
};

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.stripe-signature',
  'req.headers.x-webhook-signature',
  'req.headers.x-hub-signature-256',
  'req.headers.x-signature',
  'req.headers.x-integration-token',
  'req.headers.x-provider-token',
  'req.headers.x-gateway-signature',
  'req.headers.x-gateway-secret',
  'request.headers.authorization',
  'request.headers.cookie',
  'request.headers.x-webhook-signature',
  'request.headers.x-hub-signature-256',
  'request.headers.x-signature',
  'request.headers.x-integration-token',
  'request.headers.x-provider-token',
  'request.headers.x-gateway-signature',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.token',
  '*.access_token',
  '*.refresh_token',
  '*.secret',
  '*.apiKey',
  '*.api_key',
  '*.databaseUrl',
  '*.database_url',
  '*.connectionString',
  '*.connection_string',
  '*.jwtSecret',
  '*.jwt_secret',
  '*.refreshTokenSecret',
  '*.refresh_token_secret',
  '*.groqApiKey',
  '*.groq_api_key',
  '*.whatsappAccessToken',
  '*.whatsapp_access_token',
  '*.stripeSecretKey',
  '*.stripe_secret_key',
  '*.webhookSecret',
  '*.webhook_secret',
  '*.signature',
  '*.checkoutUrl',
  '*.checkout_url',
  '*.sessionId',
  '*.session_id',
  '*.rawBody',
  '*.rawbody',
  '*.reason',
  '*.errorMessage',
  '*.phone',
  '*.email',
  '*.from',
  '*.to',
  '*.remoteJid',
  '*.message',
  '*.body',
];

export const secureLoggerOptions = {
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  serializers: {
    err: safeErrorForLog,
    error: safeErrorForLog,
  },
  redact: {
    paths: redactPaths,
    censor: SENSITIVE_VALUE,
  },
  hooks: {
    logMethod(this: unknown, args: unknown[], method: (...input: unknown[]) => void) {
      method.apply(this, args.map((item) => redactSensitive(item)));
    },
  },
};

export const logDevelopmentOnly = (message: string, data?: unknown) => {
  if (process.env.NODE_ENV === 'production') return;
  if (data === undefined) {
    console.log(redactSensitiveText(message));
    return;
  }
  console.log(redactSensitiveText(message), redactSensitive(data));
};
