import 'dotenv/config';

const mongodbUri = process.env.MONGODB_URI;

if (!mongodbUri) {
  throw new Error('MONGODB_URI es requerido para conectar AcademiX AI a MongoDB Atlas.');
}

export const env = {
  // Server
  PORT: Number(process.env.SERVER_PORT) || 3001,
  JWT_SECRET: process.env.JWT_SECRET || 'academix_secret_key_2026',

  // MongoDB
  MONGODB_URI: mongodbUri,
  MONGODB_DB: process.env.MONGODB_DB || 'academix-ai',

  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  ESCALATION_TIMEOUT_MINUTES: Number(process.env.ESCALATION_TIMEOUT_MINUTES) || 5,

  // WhatsApp (Baileys)
  WHATSAPP_ENABLED: process.env.WHATSAPP_ENABLED === 'true',
  WHATSAPP_BOT_NUMBER: process.env.WHATSAPP_BOT_NUMBER || '+5930998949312',
  WHATSAPP_ADMIN_NUMBERS: process.env.WHATSAPP_ADMIN_NUMBERS || '',
  WHATSAPP_SESSION_DIR: process.env.WHATSAPP_SESSION_DIR || '.wwebjs_auth',

  // Admin accounts
  ADMIN_ACCOUNTS: process.env.ADMIN_ACCOUNTS || '',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@academix.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',

  // Resend (email)
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || 'AcademiX AI <onboarding@resend.dev>',

  // Ollama (humanizer)
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llama3.1:8b',
  OLLAMA_TIMEOUT_MS: Number(process.env.OLLAMA_TIMEOUT_MS) || 300000,
  MAX_INPUT_CHARS: Number(process.env.MAX_INPUT_CHARS) || 100000,

  // Subscription Plans
  PLAN_BASIC_PRICE: process.env.PLAN_BASIC_PRICE || '5.00',
  PLAN_PRO_PRICE: process.env.PLAN_PRO_PRICE || '10.00',
  PLAN_PRO_PLUS_PRICE: process.env.PLAN_PRO_PLUS_PRICE || '15.00',
  SUBSCRIPTION_DAYS: Number(process.env.SUBSCRIPTION_DAYS) || 30,
  BANK_ACCOUNTS: process.env.BANK_ACCOUNTS || '[]',
} as const;
