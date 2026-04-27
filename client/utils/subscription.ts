import type { PlanType } from '@shared/types/subscription';

export const PLAN_LABELS: Record<PlanType, string> = {
  basic: 'Plan Básico',
  pro: 'Plan Estándar',
  pro_plus: 'Plan Premium',
};

export const PLAN_RANK: Record<PlanType, number> = {
  basic: 1,
  pro: 2,
  pro_plus: 3,
};

export function getActivePlanLabel(planType: PlanType | null): string {
  return planType ? `${PLAN_LABELS[planType]} activo` : 'Sin plan activo';
}

export function goToPricing() {
  window.location.hash = '#/pricing?plans=1';
}
