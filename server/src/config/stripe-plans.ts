export const STRIPE_PLUS_PRICE_ID = 'price_1Tf3U6Jnc9f1Q8Nk23y4xrt5';
export const STRIPE_PRO_PRICE_ID = 'price_1Tf3UfJnc9f1Q8Nkd2mMCGEz';
export const STRIPE_PREMIUM_PRICE_ID = 'price_1Tf3WGJnc9f1Q8Nk8Xd4Mr4j';
export const STRIPE_LIFETIME_PRICE_ID = 'price_1Tf3WoJnc9f1Q8NkGp1FuXTr';
export const STRIPE_FOUNDER_LIFETIME_PRICE_ID = STRIPE_LIFETIME_PRICE_ID;
export const STRIPE_WHATSAPP_OVERAGE_PRODUCT_ID = 'prod_UesD33gc2yyS8H';
export const STRIPE_WHATSAPP_OVERAGE_PRICE_ID = 'price_1TfrPwJnc9f1Q8Nkui5CKasp';
export const STRIPE_AI_OVERAGE_PRODUCT_ID = 'prod_UesA0tktK7vHCR';
export const STRIPE_AI_OVERAGE_PRICE_ID = 'price_1TfrTjJnc9f1Q8Nk5W8wUltX';

export const STRIPE_PRICE_MAP: Record<string, string> = {
  [STRIPE_PLUS_PRICE_ID]: 'plus',
  [STRIPE_PRO_PRICE_ID]: 'pro',
  [STRIPE_PREMIUM_PRICE_ID]: 'premium',
  [STRIPE_FOUNDER_LIFETIME_PRICE_ID]: 'founder_lifetime',
};

export const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  plus: 1,
  starter: 1,
  pro: 2,
  premium: 3,
  lifetime: 3,
  founder_lifetime: 3,
};
