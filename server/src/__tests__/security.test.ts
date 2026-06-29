import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/syntra_test';
process.env.JWT_SECRET ??= 'test-jwt-secret-with-at-least-32-characters';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-secret-with-at-least-32-characters';

const { createWebhookSignature, verifyWebhookHmac } = await import('../middleware/verifyWebhookHmac.js');
const { redactSensitiveText, safeErrorForLog } = await import('../utils/logger.js');

const root = process.cwd();
const read = (file: string) => readFile(join(root, file), 'utf8');

test('webhook HMAC aceita assinatura válida', () => {
  const payload = JSON.stringify({ event: 'message.received', tenantId: crypto.randomUUID() });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secret = 'webhook-secret-with-more-than-32-characters';
  const signature = createWebhookSignature(payload, timestamp, secret);

  const result = verifyWebhookHmac({ payload, timestamp, secret, signature });

  assert.equal(result.ok, true);
});

test('webhook HMAC rejeita assinatura inválida', () => {
  const payload = JSON.stringify({ event: 'message.received' });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secret = 'webhook-secret-with-more-than-32-characters';

  const result = verifyWebhookHmac({ payload, timestamp, secret, signature: 'sha256=bad' });

  assert.equal(result.ok, false);
});

test('webhook HMAC rejeita replay fora da janela de 5 minutos', () => {
  const payload = JSON.stringify({ event: 'message.received' });
  const timestamp = Math.floor((Date.now() - 6 * 60 * 1000) / 1000).toString();
  const secret = 'webhook-secret-with-more-than-32-characters';
  const signature = createWebhookSignature(payload, timestamp, secret);

  const result = verifyWebhookHmac({ payload, timestamp, secret, signature });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timestamp_outside_tolerance');
});

test('reservas e pedidos validam customer_id pelo restaurantId logado', async () => {
  const reservations = await read('server/src/routes/reservations.ts');
  const orders = await read('server/src/routes/orders.ts');

  for (const source of [reservations, orders]) {
    assert.match(source, /eq\(customers\.id, input\.customer_id\)/);
    assert.match(source, /eq\(customers\.restaurantId, auth\.restaurantId\)/);
    assert.match(source, /eq\(customers\.isDeleted, false\)/);
  }
});

test('automações exigem plano Pro ou superior', async () => {
  const source = await read('server/src/routes/automations.ts');

  assert.match(source, /requirePlan\('pro'\)/);
  assert.match(source, /preHandler: \[app\.authenticate, requireRoles\('owner', 'admin'\), requirePlan\('pro'\)\]/);
});

test('Stripe webhook tem idempotência por event.id', async () => {
  const source = await read('server/src/routes/webhooks/stripe.ts');
  const schema = await read('server/src/db/schema.ts');

  assert.match(schema, /stripeWebhookEvents/);
  assert.match(source, /startStripeEventProcessing/);
  assert.match(source, /onConflictDoNothing/);
});

test('rotas sensíveis têm rate limit específico', async () => {
  const auth = await read('server/src/routes/auth.ts');
  const billing = await read('server/src/routes/billing.ts');
  const whatsapp = await read('server/src/routes/whatsapp.ts');
  const whatsappWebhook = await read('server/src/routes/webhooks/whatsapp.ts');

  assert.match(auth, /\/auth\/login'.*rateLimit/s);
  assert.match(billing, /\/billing\/checkout'.*rateLimit/s);
  assert.match(whatsapp, /\/whatsapp\/gateway\/messages\/text'.*rateLimit/s);
  assert.match(whatsappWebhook, /\/webhooks\/whatsapp'.*rateLimit/s);
});

test('webhooks WhatsApp usam HMAC com proteção de replay', async () => {
  const gatewayWebhook = await read('server/src/routes/webhooks/whatsapp.ts');
  const providerWebhook = await read('server/src/routes/whatsapp.ts');

  assert.match(gatewayWebhook, /createWebhookHmacMiddleware/);
  assert.match(providerWebhook, /createWebhookHmacMiddleware/);
  assert.match(providerWebhook, /replayPrefix: 'whatsapp-provider'/);
});

test('logs sensíveis do Stripe não expõem URL nem session ID de checkout', async () => {
  const billing = await read('server/src/routes/billing.ts');

  assert.doesNotMatch(billing, /checkoutUrl:/);
  assert.doesNotMatch(billing, /checkoutSessionId/);
  assert.equal(billing.includes("console.log('[stripe checkout response]"), false);
});

test('Stripe checkout inclui precos de excedente nas assinaturas', async () => {
  const plans = await read('server/src/config/stripe-plans.ts');
  const billing = await read('server/src/routes/billing.ts');

  assert.match(plans, /STRIPE_WHATSAPP_OVERAGE_PRICE_ID = stripePriceId\('STRIPE_WHATSAPP_OVERAGE_PRICE_ID', 'price_1TfrPwJnc9f1Q8Nkui5CKasp'\)/);
  assert.match(plans, /STRIPE_AI_OVERAGE_PRICE_ID = stripePriceId\('STRIPE_AI_OVERAGE_PRICE_ID', 'price_1TfrTjJnc9f1Q8Nk5W8wUltX'\)/);
  assert.match(billing, /line_items\[1\]\[price\].*STRIPE_WHATSAPP_OVERAGE_PRICE_ID/s);
  assert.match(billing, /line_items\[2\]\[price\].*STRIPE_AI_OVERAGE_PRICE_ID/s);
  assert.match(billing, /if \(mode === 'subscription'\).*addSubscriptionOveragePrices\(body\)/s);
  assert.doesNotMatch(billing, /line_items\[1\]\[quantity\]|line_items\[2\]\[quantity\]/);
});

test('Stripe checkout usa dominio confiavel da requisicao para voltar ao site', async () => {
  const billing = await read('server/src/routes/billing.ts');
  const plans = await read('server/src/config/stripe-plans.ts');

  assert.match(billing, /trustedCheckoutOrigins/);
  assert.match(billing, /https:\/\/www\.sioucrm\.com/);
  assert.match(billing, /const checkoutAppUrl = \(request: FastifyRequest\)/);
  assert.match(billing, /success_url: `\$\{appUrl\}\/app\/planos\?checkout=success/);
  assert.match(billing, /cancel_url: `\$\{appUrl\}\/app\/planos\?checkout=cancelled`/);
  assert.doesNotMatch(billing, /success_url: `\$\{env\.APP_URL\}\/app\/planos/);
  assert.match(plans, /process\.env\[key\]\?\.trim\(\) \|\| fallback/);
  assert.match(billing, /CheckoutPublicError/);
  assert.match(billing, /missing_stripe_secret/);
  assert.match(billing, /resource_missing/);
  assert.doesNotMatch(billing, /request\.log\.(?:warn|error|info)\([^)]*data\.error\?\.message/s);
});

test('headers de seguranca fortes e cache privado estao configurados', async () => {
  const app = await read('server/src/app.ts');
  const staticServer = await read('server/local-static.cjs');
  const vercel = await read('vercel.json');

  for (const source of [app, staticServer, vercel]) {
    assert.match(source, /Permissions-Policy/);
  }
  assert.match(app, /Cache-Control.*no-store/s);
  assert.match(staticServer, /Content-Security-Policy/);
  assert.match(vercel, /Cross-Origin-Opener-Policy/);
  assert.match(vercel, /Strict-Transport-Security/);
  assert.match(vercel, /connect-src 'self' https:\/\/\*\.onrender\.com/);
});

test('frontend pode apontar para backend hospedado na Render', async () => {
  const api = await read('src/lib/api.ts');
  const readme = await read('server/README.md');

  assert.match(api, /VITE_BACKEND_URL/);
  assert.match(api, /configuredBackendUrl\.replace/);
  assert.match(api, /\/api`/);
  assert.match(readme, /VITE_BACKEND_URL=https:\/\/sua-api-na-render\.onrender\.com/);
});

test('deploy da Vercel encaminha webhooks e limita conexoes serverless', async () => {
  const vercel = await read('vercel.json');
  const handler = await read('api/index.ts');
  const database = await read('server/src/db/client.ts');
  const vercelIgnore = await read('.vercelignore');

  assert.match(vercel, /"source": "\/api\/:path\*"/);
  assert.match(vercel, /"destination": "\/api\?__path=\/api\/:path\*"/);
  assert.match(vercel, /"source": "\/webhooks\/:path\*"/);
  assert.match(vercel, /"destination": "\/api\?__path=\/webhooks\/:path\*"/);
  assert.match(handler, /normalizeVercelApiUrl/);
  assert.match(handler, /BACKEND_URL/);
  assert.match(handler, /shouldProxyToBackend/);
  assert.match(handler, /proxyToBackend/);
  assert.match(handler, /proxyTimeoutMs/);
  assert.match(handler, /UPSTREAM_TIMEOUT/);
  assert.match(handler, /searchParams\.get\('__path'\)/);
  assert.match(handler, /req\.url = normalizeVercelApiUrl\(req\.url\)/);
  assert.match(database, /max:\s*process\.env\.VERCEL \? 1 : 10/);
  assert.match(vercelIgnore, /whatsapp-gateway\//);
  assert.match(vercelIgnore, /\*\*\/sessions\//);
});

test('rotas de autenticacao validam origem do navegador', async () => {
  const auth = await read('server/src/routes/auth.ts');

  assert.match(auth, /requireTrustedBrowserOrigin/);
  assert.match(auth, /sec-fetch-site/);
  assert.match(auth, /trustedBrowserOrigins\.add\('https:\/\/www\.sioucrm\.com'\)/);
  assert.match(auth, /trustedBrowserOrigins\.add\('https:\/\/sioucrm\.com'\)/);
  assert.match(auth, /normalizedOrigin !== requestOrigin\(request\)/);
  assert.match(auth, /const origin = request\.headers\.origin;[\s\S]*if \(origin\)[\s\S]*trustedBrowserOrigins\.has[\s\S]*const secFetchSite = request\.headers\['sec-fetch-site'\]/);
  assert.match(auth, /\/auth\/refresh'.*requireTrustedBrowserOrigin/s);
  assert.match(auth, /\/auth\/logout'.*requireTrustedBrowserOrigin/s);
});
test('respostas publicas nao retornam detalhes internos de validacao', async () => {
  const routeFiles = [
    'server/src/routes/auth.ts',
    'server/src/routes/customers.ts',
    'server/src/routes/reservations.ts',
    'server/src/routes/automations.ts',
    'server/src/routes/campaigns.ts',
    'server/src/routes/whatsapp.ts',
    'server/src/routes/webhooks/whatsapp.ts',
    'server/src/routes/ai-settings.ts',
  ];

  for (const file of routeFiles) {
    assert.doesNotMatch(await read(file), /details:\s*parsed\.error\.flatten/);
  }
});

test('logger sanitiza erros e valores sensiveis', async () => {
  const logger = await read('server/src/utils/logger.ts');
  const audit = await read('server/src/utils/audit.ts');

  assert.match(logger, /safeErrorForLog/);
  assert.match(logger, /SENSITIVE_TEXT_PATTERNS/);
  assert.match(logger, /x-hub-signature-256/);
  assert.match(audit, /redactAuditPrivateData/);
});

test('redaction remove credenciais de mensagens e stack traces', () => {
  const samples = [
    'STRIPE_SECRET_KEY=sk_test_fake_123456789',
    'GROQ_API_KEY=gsk_fake_123456789',
    'JWT_SECRET=jwt-fake-secret-value',
    'REFRESH_TOKEN_SECRET=refresh-fake-secret-value',
    'WHATSAPP_ACCESS_TOKEN=whatsapp-fake-token-value',
    'DATABASE_URL=postgresql://user:password@localhost:5432/syntra',
    'ZOHO_SMTP_PASS=zoho-fake-password',
    'RESEND_API_KEY=re_fake_123456789',
  ];

  for (const sample of samples) {
    assert.doesNotMatch(redactSensitiveText(sample), /fake|password@localhost/);
    const safeError = safeErrorForLog(new Error(sample));
    assert.doesNotMatch(`${safeError.message} ${safeError.stack}`, /fake|password@localhost/);
  }
});

test('gitignore protege credenciais e sessoes do WhatsApp', async () => {
  const gitignore = await read('.gitignore');

  assert.match(gitignore, /whatsapp-gateway\/\*\*\/sessions\//);
  assert.match(gitignore, /\*\*\/creds\.json/);
  assert.match(gitignore, /\*\.session/);
  assert.match(gitignore, /\*\.log/);
});

test('launcher do gateway nunca imprime .env ou saida bruta', async () => {
  const launcher = await read('abrir-whatsapp-gateway.cmd');
  const startScript = await read('scripts/start-whatsapp-gateway.ps1');

  assert.doesNotMatch(launcher, /GATEWAY_SECRET=|Get-Content.*\.env|>>.*gateway-window\.log/i);
  assert.doesNotMatch(launcher, /-AppDir/);
  assert.doesNotMatch(startScript, /Write-Host\s+\$gatewaySecret|Write-Output\s+\$gatewaySecret/i);
  assert.match(startScript, /Protect-LogLine/);
  assert.match(startScript, /REDACTED_SESSION_DUMP/);
  assert.match(startScript, /Get-NetTCPConnection -LocalPort 3001/);
  assert.match(startScript, /NativeCommandError/);
  assert.match(startScript, /decryptWarningShown/);
  assert.match(startScript, /cmd\.exe \/d \/s \/c/);
  assert.match(startScript, /Variavel encontrada/);
  assert.match(startScript, /Variavel ausente/);
});

test('segredos com prefixo VITE sao recusados', async () => {
  const envSource = await read('server/src/env.ts');
  assert.match(envSource, /forbiddenFrontendSecretKeys/);
  assert.match(envSource, /VITE_WHATSAPP_ACCESS_TOKEN/);
  assert.match(envSource, /VITE_STRIPE_SECRET_KEY/);
});

test('frontend nao contem cliente Supabase nem persiste access token', async () => {
  const authProvider = await read('src/providers/AuthProvider.tsx');
  const authPages = await read('src/pages/AuthPages.tsx');
  const dataHooks = await read('src/hooks/useRestaurantData.ts');

  for (const source of [authProvider, authPages, dataHooks]) {
    assert.doesNotMatch(source, /from ['"].*supabase/);
    assert.doesNotMatch(source, /localStorage\.setItem\([^)]*access_token/s);
  }
});

test('cookie de renovacao usa politica segura e consistente', async () => {
  const auth = await read('server/src/routes/auth.ts');
  const api = await read('src/lib/api.ts');
  const tokens = await read('server/src/utils/tokens.ts');

  assert.match(auth, /httpOnly:\s*true/);
  assert.match(auth, /sameSite:\s*'lax'/);
  assert.match(auth, /secure:\s*env\.NODE_ENV === 'production' \|\| isHttpsRequest\(request\)/);
  assert.match(auth, /priority:\s*'high'/);
  assert.match(auth, /const refreshSessionTtlDays = 30/);
  assert.match(auth, /maxAge:\s*refreshSessionTtlSeconds/);
  assert.match(auth, /reply\.setCookie\(refreshCookieName, tokens\.refreshToken, refreshCookieOptions\(request\)\)/);
  assert.match(auth, /const clearRefreshCookie = \(request: FastifyRequest, reply: FastifyReply\)/);
  assert.doesNotMatch(auth, /clearCookie\(refreshCookieName,\s*\{\s*path:\s*'\/'\s*\}\)/s);
  assert.match(tokens, /\.setExpirationTime\('30d'\)/);
  assert.match(api, /credentials:\s*'include'/);
  assert.doesNotMatch(api, /localStorage\.setItem\([^)]*access_token/s);
  assert.match(api, /async refresh\(\)\s*\{\s*return refreshAccessToken\(\);\s*\}/s);
});

test('cadastro entra direto, cria sessao segura e leva para planos', async () => {
  const auth = await read('server/src/routes/auth.ts');
  const api = await read('src/lib/api.ts');
  const authPages = await read('src/pages/AuthPages.tsx');
  const protectedRoute = await read('src/components/layout/ProtectedRoute.tsx');
  const app = await read('src/App.tsx');
  const layout = await read('src/components/layout/DashboardLayout.tsx');

  assert.match(auth, /emailVerifiedAt:\s*new Date\(\)/);
  assert.match(auth, /validateEmailDomainForSignup\(email\)/);
  assert.match(auth, /Use um email real para criar sua conta/);
  assert.match(auth, /reply\.setCookie\(refreshCookieName, tokens\.refreshToken, refreshCookieOptions\(request\)\)/);
  assert.match(auth, /access_token:\s*tokens\.accessToken/);
  assert.match(auth, /requires_email_verification:\s*false/);
  assert.doesNotMatch(auth, /sendUserVerificationEmail/);
  assert.doesNotMatch(auth, /generateVerificationToken/);
  assert.doesNotMatch(auth, /requiresEmailVerification/);
  assert.match(api, /setAccessToken\(result\.access_token\)/);
  assert.match(authPages, /startApiSession\(result\)/);
  assert.match(authPages, /navigate\('\/app\/planos'/);
  assert.doesNotMatch(protectedRoute, /email_confirmed_at/);
  assert.match(app, /RequirePaidPlan/);
  assert.match(app, /paidPlans\.has\(restaurant\?\.plan \|\| 'free'\)/);
  assert.match(layout, /planLocked/);
});

test('cadastro bloqueia dominio de email sem DNS de email', async () => {
  const validator = await read('server/src/utils/emailValidation.ts');

  assert.match(validator, /resolveMx/);
  assert.match(validator, /resolveMxWithTimeout/);
  assert.match(validator, /emailDomainValidationTimeoutMs/);
  assert.match(validator, /blockedEmailDomains/);
  assert.match(validator, /domainCache/);
  assert.match(validator, /invalid_domain/);
  assert.doesNotMatch(validator, /console\.log|request\.log/);
});

test('RBAC protege cobranca, IA, automacoes e configuracao do WhatsApp', async () => {
  const billing = await read('server/src/routes/billing.ts');
  const aiSettings = await read('server/src/routes/ai-settings.ts');
  const automations = await read('server/src/routes/automations.ts');
  const whatsapp = await read('server/src/routes/whatsapp.ts');

  assert.match(billing, /requireRoles\('owner'\)/);
  assert.match(aiSettings, /requireRoles\('owner', 'admin'\)/);
  assert.match(automations, /requireRoles\('owner', 'admin'\)/);
  assert.match(whatsapp, /gateway\/session'.*requireRoles\('owner', 'admin'\)/s);
});

test('campanhas enviam WhatsApp pelo backend com plano, limite e trava anti-spam', async () => {
  const campaigns = await read('server/src/routes/campaigns.ts');
  const page = await read('src/pages/CampaignsPage.tsx');
  const hooks = await read('src/hooks/useRestaurantData.ts');
  const api = await read('src/lib/api.ts');

  assert.match(campaigns, /\/campaigns\/:id\/send/);
  assert.match(campaigns, /requirePlan\('plus'\)/);
  assert.match(campaigns, /requireRoles\('owner', 'admin', 'manager'\)/);
  assert.match(campaigns, /const campaignSendLimit = 25/);
  assert.match(campaigns, /checkWhatsAppSendAllowed/);
  assert.match(campaigns, /recordUsage\(auth\.restaurantId, 'whatsapp'\)/);
  assert.match(campaigns, /sendWhatsAppMessage\(to, message\)/);
  assert.doesNotMatch(campaigns, /request\.log\.\w+\([^)]*WHATSAPP_ACCESS_TOKEN/s);
  assert.match(api, /sendCampaign/);
  assert.match(hooks, /useSendCampaign/);
  assert.match(page, /Enviar agora/);
});

test('payloads grandes usam paginacao e configuracao da IA nao retorna PDF base64', async () => {
  const customers = await read('server/src/routes/customers.ts');
  const orders = await read('server/src/routes/orders.ts');
  const whatsapp = await read('server/src/routes/whatsapp.ts');
  const aiSettings = await read('server/src/routes/ai-settings.ts');

  for (const source of [customers, orders, whatsapp]) {
    assert.match(source, /parsePagination/);
    assert.match(source, /paginationMeta/);
  }
  assert.match(aiSettings, /menu_pdf_data:\s*null/);
});

test('agent recebe somente dados basicos de clientes', async () => {
  const customers = await read('server/src/routes/customers.ts');
  const format = await read('server/src/utils/format.ts');
  const basicCustomerDto = format.split('export const toReservationDto')[0].split('export const toBasicCustomerDto')[1] ?? '';

  assert.match(customers, /auth\.role === 'agent' \? toBasicCustomerDto : toCustomerDto/);
  assert.match(format, /toBasicCustomerDto/);
  assert.doesNotMatch(basicCustomerDto, /notes:|preferences:|email:/);
});

test('Meu Plano protege valores financeiros por RBAC', async () => {
  const planRoute = await read('server/src/routes/plan.ts');
  const app = await read('server/src/app.ts');
  const menu = await read('src/components/layout/DashboardLayout.tsx');
  const routes = await read('src/App.tsx');

  assert.match(planRoute, /requireRoles\('owner', 'admin', 'manager', 'agent'\)/);
  assert.match(planRoute, /financialsVisible = auth\.role === 'owner'/);
  assert.match(planRoute, /estimated_additional_amount: financialsVisible \? estimatedAdditionalAmount : null/);
  assert.match(app, /app\.register\(planRoutes, \{ prefix: '\/api' \}\)/);
  assert.match(menu, /label: 'Meu Plano'.*roles: allRoles/);
  assert.doesNotMatch(menu, /label: 'Aniversários'/);
  assert.match(routes, /path="meu-plano"/);
});

test('Meu Plano usa linguagem humana sem termos tecnicos', async () => {
  const page = await read('src/pages/PlanPage.tsx');

  for (const forbidden of ['Token', 'Webhook', 'Request', 'Payload', 'Metered Billing', 'Input', 'Output', 'Prompt']) {
    assert.doesNotMatch(page, new RegExp(`\\b${forbidden}\\b`, 'i'));
  }
  assert.match(page, /Você está dentro do seu plano/);
  assert.match(page, /Vou|Valor extra até agora|Sem cobrança adicional/);
});

test('dashboard nao inventa conversas recentes a partir de clientes', async () => {
  const dashboard = await read('src/pages/DashboardPage.tsx');

  assert.match(dashboard, /const recentConversations = conversations\.slice\(0, 5\)\.map/);
  assert.doesNotMatch(dashboard, /demoConversationPreviews/);
  assert.doesNotMatch(dashboard, /demoRecentConversations/);
  assert.doesNotMatch(dashboard, /customers\.slice\(0, 5\)\.map/);
  assert.doesNotMatch(dashboard, /Queria reservar|entregam no Centro|Conversa recente/);
});

test('WhatsApp aplica protecoes contra spam e respeita pedido para parar', async () => {
  const safety = await read('server/src/services/whatsappSafety.ts');
  const routes = await read('server/src/routes/whatsapp.ts');
  const webhook = await read('server/src/routes/webhooks/whatsapp.ts');
  const gateway = await read('whatsapp-gateway/whatsapp-gateway/src/services/sessionManager.ts');

  assert.match(safety, /WHATSAPP_OPT_OUT_TAG/);
  assert.match(safety, /isWhatsAppOptOutRequest/);
  assert.match(safety, /isWhatsAppInboundDuplicate/);
  assert.match(safety, /últimas 24 horas/);
  assert.match(safety, /Limite seguro de mensagens para este cliente/);
  assert.match(safety, /Esta mensagem já foi enviada/);
  assert.match(routes, /checkWhatsAppSendAllowed/);
  assert.match(webhook, /registerWhatsAppOptOut/);
  assert.match(webhook, /auto reply blocked by safety policy/);
  assert.match(gateway, /Envio para grupos bloqueado/);
  assert.match(gateway, /assertOutboundPacing/);
});
