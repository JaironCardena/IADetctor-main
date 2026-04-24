import { env } from '../config/env';
import { randomUUID } from 'crypto';
import type { BankAccount, PlanType, SystemSubscriptionSettings } from '../../shared/types/subscription';
import { SystemSettingsModel } from '../models/SystemSettings';

export type PlanPrices = Record<PlanType, string>;

export interface PlanSettings {
  price: string;
  detectorDocumentLimit: number;
  humanizerWordLimit: number;
  humanizerSubmissionLimit: number;
}

export type SubscriptionSettings = Record<PlanType, PlanSettings>;

const BANK_ACCOUNT_PREFIX = 'BANK';

const DEFAULT_SETTINGS: SubscriptionSettings = {
  basic: {
    price: env.PLAN_BASIC_PRICE,
    detectorDocumentLimit: 5,
    humanizerWordLimit: 0,
    humanizerSubmissionLimit: 0,
  },
  pro: {
    price: env.PLAN_PRO_PRICE,
    detectorDocumentLimit: 15,
    humanizerWordLimit: 10000,
    humanizerSubmissionLimit: 0,
  },
  pro_plus: {
    price: env.PLAN_PRO_PLUS_PRICE,
    detectorDocumentLimit: 30,
    humanizerWordLimit: 30000,
    humanizerSubmissionLimit: 0,
  },
};

function createBankAccountId(): string {
  return `${BANK_ACCOUNT_PREFIX}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function parseDefaultBankAccounts(): BankAccount[] {
  try {
    return normalizeBankAccounts(JSON.parse(env.BANK_ACCOUNTS));
  } catch {
    return [];
  }
}

function normalizePrice(value: unknown): string | null {
  const num = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(num) || num < 0) return null;
  return num.toFixed(2);
}

function normalizeLimit(value: unknown): number | null {
  const num = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

function normalizePlanSettings(plan: PlanType, value: unknown): PlanSettings {
  const legacy = value as Partial<PlanSettings> | string | number | undefined;
  const defaults = DEFAULT_SETTINGS[plan];
  const maybeObject = legacy && typeof legacy === 'object' ? legacy as Partial<PlanSettings> : {};
  const normalizedHumanizerWordLimit = normalizeLimit(maybeObject.humanizerWordLimit);

  return {
    price: normalizePrice(maybeObject.price ?? legacy) ?? defaults.price,
    detectorDocumentLimit: normalizeLimit(maybeObject.detectorDocumentLimit) ?? defaults.detectorDocumentLimit,
    humanizerWordLimit: plan === 'basic'
      ? 0
      : (normalizedHumanizerWordLimit && normalizedHumanizerWordLimit > 0 ? normalizedHumanizerWordLimit : defaults.humanizerWordLimit),
    humanizerSubmissionLimit: normalizeLimit(maybeObject.humanizerSubmissionLimit) ?? defaults.humanizerSubmissionLimit,
  };
}

function normalizeSettings(input: unknown): SubscriptionSettings {
  const raw = (input || {}) as Partial<Record<PlanType, unknown>> & { prices?: Partial<PlanPrices> };
  const source = raw.prices ? { ...raw, ...raw.prices } : raw;

  return {
    basic: normalizePlanSettings('basic', source.basic),
    pro: normalizePlanSettings('pro', source.pro),
    pro_plus: normalizePlanSettings('pro_plus', source.pro_plus),
  };
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeBankAccounts(input: unknown): BankAccount[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      const raw = item as Partial<BankAccount> | undefined;
      if (!raw || typeof raw !== 'object') return null;

      const bankName = normalizeText(raw.bankName);
      const accountNumber = normalizeText(raw.accountNumber);
      const accountHolder = normalizeText(raw.accountHolder);
      const accountType = normalizeText(raw.accountType);

      if (!bankName || !accountNumber || !accountHolder || !accountType) return null;

      return {
        id: normalizeText(raw.id) || createBankAccountId(),
        bankName,
        accountNumber,
        accountHolder,
        accountType,
      };
    })
    .filter((account): account is BankAccount => Boolean(account));
}

function hasPartialBankAccounts(input: unknown): boolean {
  if (!Array.isArray(input)) return false;

  return input.some((item) => {
    const raw = item as Partial<BankAccount> | undefined;
    if (!raw || typeof raw !== 'object') return false;

    const values = [
      normalizeText(raw.bankName),
      normalizeText(raw.accountNumber),
      normalizeText(raw.accountHolder),
      normalizeText(raw.accountType),
    ];
    return values.some(Boolean) && !values.every(Boolean);
  });
}

async function getBankAccountsFromDocument(doc: { bankAccounts?: unknown }): Promise<BankAccount[]> {
  if (Array.isArray(doc.bankAccounts)) {
    return normalizeBankAccounts(doc.bankAccounts);
  }

  const defaults = parseDefaultBankAccounts();
  if (defaults.length > 0) {
    await SystemSettingsModel.findOneAndUpdate(
      { settingsId: 'global' },
      { $set: { bankAccounts: defaults } }
    );
  }

  return defaults;
}

export function getPricesFromSettings(settings: SubscriptionSettings): PlanPrices {
  return {
    basic: settings.basic.price,
    pro: settings.pro.price,
    pro_plus: settings.pro_plus.price,
  };
}

export async function getSubscriptionSettings(): Promise<SubscriptionSettings> {
  try {
    const doc = await SystemSettingsModel.findOne({ settingsId: 'global' }).lean();
    if (doc) {
      return normalizeSettings(doc);
    }
    return await ensureSubscriptionSettings();
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function getSystemSubscriptionSettings(): Promise<SystemSubscriptionSettings> {
  try {
    const doc = await SystemSettingsModel.findOne({ settingsId: 'global' }).lean();
    if (doc) {
      return {
        plans: normalizeSettings(doc),
        bankAccounts: await getBankAccountsFromDocument(doc),
      };
    }

    const plans = await ensureSubscriptionSettings();
    const created = await SystemSettingsModel.findOne({ settingsId: 'global' }).lean();
    return {
      plans,
      bankAccounts: normalizeBankAccounts(created?.bankAccounts),
    };
  } catch {
    return { plans: DEFAULT_SETTINGS, bankAccounts: parseDefaultBankAccounts() };
  }
}

export async function ensureSubscriptionSettings(): Promise<SubscriptionSettings> {
  const defaults = {
    ...DEFAULT_SETTINGS,
    bankAccounts: parseDefaultBankAccounts(),
    settingsId: 'global',
  };

  const doc = await SystemSettingsModel.findOneAndUpdate(
    { settingsId: 'global' },
    { $setOnInsert: defaults },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return normalizeSettings(doc);
}

export async function getPlanPrices(): Promise<PlanPrices> {
  return getPricesFromSettings(await getSubscriptionSettings());
}

export async function saveSubscriptionSettings(input: unknown): Promise<SubscriptionSettings> {
  const settings = normalizeSettings(input);

  for (const plan of Object.keys(settings) as PlanType[]) {
    if (!normalizePrice(settings[plan].price)) {
      throw new Error('Todos los precios deben ser numeros validos.');
    }
  }

  await SystemSettingsModel.findOneAndUpdate(
    { settingsId: 'global' },
    { ...settings, settingsId: 'global' },
    { upsert: true, new: true }
  );
  
  return settings;
}

export async function saveSystemSubscriptionSettings(input: unknown): Promise<SystemSubscriptionSettings> {
  const raw = (input || {}) as Partial<SystemSubscriptionSettings> & { prices?: unknown };
  const plans = normalizeSettings(raw.plans || raw.prices || raw);

  if (hasPartialBankAccounts(raw.bankAccounts)) {
    throw new Error('Completa banco, numero, titular y tipo en cada cuenta bancaria.');
  }

  const bankAccounts = normalizeBankAccounts(raw.bankAccounts);

  for (const plan of Object.keys(plans) as PlanType[]) {
    if (!normalizePrice(plans[plan].price)) {
      throw new Error('Todos los precios deben ser numeros validos.');
    }
  }

  await SystemSettingsModel.findOneAndUpdate(
    { settingsId: 'global' },
    { ...plans, bankAccounts, settingsId: 'global' },
    { upsert: true, new: true }
  );

  return { plans, bankAccounts };
}

export async function savePlanPrices(input: Partial<PlanPrices>): Promise<PlanPrices> {
  const current = await getSubscriptionSettings();
  const settings = await saveSubscriptionSettings({
    ...current,
    basic: { ...current.basic, price: input.basic ?? current.basic.price },
    pro: { ...current.pro, price: input.pro ?? current.pro.price },
    pro_plus: { ...current.pro_plus, price: input.pro_plus ?? current.pro_plus.price },
  });
  return getPricesFromSettings(settings);
}
