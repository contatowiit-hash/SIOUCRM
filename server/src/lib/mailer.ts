import nodemailer from 'nodemailer';
import { env } from '../env.js';

const appName = 'SIOU';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const verificationUrl = (token: string) => {
  const baseUrl = env.BACKEND_URL.replace(/\/+$/, '');
  return `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
};

export const isMailerConfigured = () => Boolean(env.ZOHO_SMTP_USER && env.ZOHO_SMTP_PASS);

const getTransporter = () => {
  if (!env.ZOHO_SMTP_USER || !env.ZOHO_SMTP_PASS) {
    throw new Error('EMAIL_SMTP_NOT_CONFIGURED');
  }

  return nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
    auth: {
      user: env.ZOHO_SMTP_USER,
      pass: env.ZOHO_SMTP_PASS,
    },
  });
};

export const sendVerificationEmail = async (to: string, token: string) => {
  const link = verificationUrl(token);
  const safeLink = escapeHtml(link);

  await getTransporter().sendMail({
    from: `"${appName}" <${env.ZOHO_SMTP_USER}>`,
    to,
    subject: `Confirme seu email - ${appName}`,
    text: [
      `Confirme seu email no ${appName}.`,
      '',
      'Clique no link abaixo para liberar o acesso ao painel:',
      link,
      '',
      'Esse link expira em 24 horas.',
      'Se voce nao criou uma conta, ignore este email.',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">
        <h1 style="margin:0 0 12px;font-size:24px">Confirme seu email</h1>
        <p style="font-size:15px;line-height:1.6">Clique no botao abaixo para liberar o acesso ao painel do ${appName}.</p>
        <p style="margin:28px 0">
          <a href="${safeLink}" style="display:inline-block;background:#00afff;color:#041019;text-decoration:none;font-weight:700;padding:14px 18px;border-radius:10px">
            Confirmar email
          </a>
        </p>
        <p style="font-size:13px;line-height:1.6;color:#4b5563">O link expira em 24 horas. Se voce nao criou uma conta, ignore este email.</p>
        <p style="font-size:12px;line-height:1.6;color:#6b7280;word-break:break-all">Link direto: ${safeLink}</p>
      </div>
    `,
  });
};
