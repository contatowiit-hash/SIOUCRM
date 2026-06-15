export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const sanitizeText = (value: string, maxLength = 1000) =>
  value
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);

export const sanitizePhone = (value: string) => {
  const hasPlus = value.trim().startsWith('+');
  const digits = value.replace(/\D/g, '').slice(0, 15);
  return `${hasPlus ? '+' : ''}${digits}`;
};

export const isValidPhone = (value: string) => /^\+?[1-9]\d{7,14}$/.test(sanitizePhone(value));

export const sanitizeFilename = (filename: string) =>
  filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);

export const validateImageUpload = (file: File): { valid: true } | { valid: false; error: string } => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
  const maxFileSize = 5 * 1024 * 1024;
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Tipo de arquivo não permitido.' };
  }

  if (!allowedExtensions.includes(extension || '')) {
    return { valid: false, error: 'Extensão de arquivo inválida.' };
  }

  if (file.size > maxFileSize) {
    return { valid: false, error: 'Arquivo muito grande. O limite é 5 MB.' };
  }

  return { valid: true };
};
