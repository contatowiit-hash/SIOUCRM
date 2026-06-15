import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('Digite um email válido.').max(255).toLowerCase(),
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.').max(128),
});

export const RegisterSchema = z
  .object({
    fullName: z.string().min(2, 'Informe seu nome.').max(100),
    restaurantName: z.string().min(2, 'Informe o nome do restaurante.').max(120),
    email: z.string().email('Digite um email válido.').max(255).toLowerCase(),
    password: z
      .string()
      .min(10, 'Use pelo menos 10 caracteres.')
      .max(128)
      .regex(/[A-Z]/, 'Inclua uma letra maiúscula.')
      .regex(/[a-z]/, 'Inclua uma letra minúscula.')
      .regex(/[0-9]/, 'Inclua um número.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas precisam ser iguais.',
    path: ['confirmPassword'],
  });

export const ResetPasswordSchema = z.object({
  email: z.string().email('Digite um email válido.').max(255).toLowerCase(),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
