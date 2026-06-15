import { z } from 'zod';

const checkoutResponseSchema = z.object({
  url: z.string().url().optional(),
  link: z.string().url().optional(),
  checkout_url: z.string().url().optional(),
  invoice_slug: z.string().optional(),
  slug: z.string().optional(),
});

const paymentCheckSchema = z.object({
  paid: z.boolean().optional(),
  status: z.string().optional(),
  amount: z.coerce.number().nonnegative().optional(),
  paid_amount: z.coerce.number().nonnegative().optional(),
});

const infinitePayFetch = async <T>(path: string, init: RequestInit): Promise<T> => {
  const response = await fetch(`https://api.infinitepay.io${path}`, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error('InfinitePay request failed');
  return body as T;
};

export const createInfinitePayCheckout = async ({
  handle,
  orderId,
  amount,
  description,
  webhookUrl,
  redirectUrl,
}: {
  handle: string;
  orderId: string;
  amount: number;
  description: string;
  webhookUrl: string;
  redirectUrl: string;
}) => {
  const raw = await infinitePayFetch<unknown>('/invoices/public/checkout/links', {
    method: 'POST',
    body: JSON.stringify({
      handle,
      order_nsu: orderId,
      webhook_url: webhookUrl,
      redirect_url: redirectUrl,
      items: [{ quantity: 1, price: Math.round(amount * 100), description }],
    }),
  });
  const parsed = checkoutResponseSchema.parse(raw);
  const url = parsed.url ?? parsed.link ?? parsed.checkout_url;
  if (!url) throw new Error('InfinitePay checkout URL missing');
  return { url, slug: parsed.invoice_slug ?? parsed.slug ?? null };
};

export const checkInfinitePayPayment = async ({
  handle,
  orderId,
  transactionNsu,
  slug,
}: {
  handle: string;
  orderId: string;
  transactionNsu: string;
  slug: string;
}) => {
  const params = new URLSearchParams({
    handle,
    order_nsu: orderId,
    transaction_nsu: transactionNsu,
    slug,
  });
  const raw = await infinitePayFetch<unknown>(`/invoices/public/checkout/payment_check?${params.toString()}`, {
    method: 'GET',
  });
  return paymentCheckSchema.parse(raw);
};
