import { z } from 'zod';
import { isValidPhone } from '../lib/security';

export const CreateCustomerSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome muito curto.')
    .max(100, 'Nome muito longo.')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Nome inválido.'),
  phone: z.string().refine(isValidPhone, 'Telefone inválido.'),
  email: z.string().email('Email inválido.').max(255).toLowerCase().optional().or(z.literal('')),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
    .optional()
    .or(z.literal(''))
    .refine((date) => {
      if (!date) return true;
      const value = new Date(date);
      return value <= new Date() && value >= new Date('1900-01-01');
    }, 'Data de nascimento inválida.'),
  gender: z.string().max(40).optional().or(z.literal('')),
  tags: z.array(z.string().min(1).max(30)).max(10).default([]),
  preferences: z.string().max(1000).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'vip', 'new']).default('new'),
  origin: z.enum(['whatsapp', 'instagram', 'referral', 'delivery', 'in_person']).default('whatsapp'),
});

export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;
