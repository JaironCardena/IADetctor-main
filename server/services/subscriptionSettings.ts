import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';
import type { PlanType } from '../../shared/types/subscription';

export type PlanPrices = Record<PlanType, string>;

export interface PlanSettings {
  price: string;
  detectorDocumentLimit: number;
  humanizerWordLimit: number;
  humanizerSubmissionLimit: number;
}

export type SubscriptionSettings = Record<PlanType, PlanSettings>;

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'subscription-settings.json');

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
    humanizerWordLimit: 0,
    humanizerSubmissionLimit: 0,
  },
  pro_plus: {
    price: env.PLAN_PRO_PLUS_PRICE,
    detectorDocumentLimit: 30,
    humanizerWordLimit: 0,
    humanizerSubmissionLimit: 0,
  },
};

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

  return {
    price: normalizePrice(maybeObject.price ?? legacy) ?? defaults.price,
    detectorDocumentLimit: normalizeLimit(maybeObject.detectorDocumentLimit) ?? defaults.detectorDocumentLimit,
    humanizerWordLimit: normalizeLimit(maybeObject.humanizerWordLimit) ?? defaults.humanizerWordLimit,
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

export function getPricesFromSettings(settings: SubscriptionSettings): PlanPrices {
  return {
    basic: settings.basic.price,
    pro: settings.pro.price,
    pro_plus: settings.pro_plus.price,
  };
}

export async function getSubscriptionSettings(): Promise<SubscriptionSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8');
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
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

  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
  return settings;
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
