import { z } from 'zod';
import { env } from '../env.js';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const GroqChatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().optional().nullable(),
        }),
      }),
    )
    .min(1),
});

export const isGroqConfigured = () => Boolean(env.GROQ_API_KEY);

export const generateGroqReply = async (messages: ChatMessage[]) => {
  if (!env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY_NOT_CONFIGURED');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL ?? 'llama-3.1-8b-instant',
        messages,
        temperature: 0.4,
        max_completion_tokens: 450,
      }),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(`GROQ_REQUEST_FAILED_${response.status}`);
    }

    const parsed = GroqChatResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new Error('GROQ_INVALID_RESPONSE');
    }

    const content = parsed.data.choices[0].message.content?.trim();
    if (!content) {
      throw new Error('GROQ_EMPTY_RESPONSE');
    }

    return content.slice(0, 1800);
  } finally {
    clearTimeout(timeout);
  }
};
