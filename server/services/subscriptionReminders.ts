import { db } from './database';
import { sendSubscriptionRenewalReminderEmail } from './email';

const REMINDER_WINDOW_HOURS_MIN = 47;
const REMINDER_WINDOW_HOURS_MAX = 49;

export async function processSubscriptionRenewalReminders(): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() + REMINDER_WINDOW_HOURS_MIN * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS_MAX * 60 * 60 * 1000).toISOString();
  const subscriptions = await db.getSubscriptionsExpiringBetween(windowStart, windowEnd);

  for (const subscription of subscriptions) {
    if (subscription.renewalReminderSentAt) {
      continue;
    }

    const user = await db.getUserById(subscription.userId);
    if (!user?.email) {
      continue;
    }

    try {
      const sent = await sendSubscriptionRenewalReminderEmail(
        user.email,
        user.name,
        subscription.planType,
        subscription.expiresAt
      );

      if (sent) {
        await db.markSubscriptionReminderSent(subscription.id, now.toISOString());
      }
    } catch (error) {
      console.error(`Error procesando recordatorio de renovacion para ${subscription.id}:`, error);
    }
  }
}
