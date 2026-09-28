import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  pushRemindersTable,
  pushSubscriptionsTable,
} from "@workspace/db";
import {
  GetPushConfigResponse,
  RemovePushSubscriptionBody,
  RemovePushSubscriptionResponse,
  ReplacePushRemindersBody,
  ReplacePushRemindersResponse,
  SavePushSubscriptionBody,
  SavePushSubscriptionResponse,
} from "@workspace/api-zod";
import {
  getBrowserPushPublicKey,
  startPushDelivery,
} from "../lib/push-delivery";

const router: IRouter = Router();

startPushDelivery();

router.get("/push/config", (_req, res): void => {
  res.json(GetPushConfigResponse.parse({ publicKey: getBrowserPushPublicKey() }));
});

router.post("/push/subscriptions", async (req, res): Promise<void> => {
  const parsed = SavePushSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { clientId, subscription } = parsed.data;
  if (!subscription.endpoint.startsWith("https://")) {
    res.status(400).json({ error: "Push endpoints must use HTTPS." });
    return;
  }

  await db
    .insert(pushSubscriptionsTable)
    .values({
      id: randomUUID(),
      clientId,
      endpoint: subscription.endpoint,
      subscription,
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { clientId, subscription },
    });

  res.json(SavePushSubscriptionResponse.parse({ saved: true }));
});

router.post("/push/unsubscribe", async (req, res): Promise<void> => {
  const parsed = RemovePushSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db
    .delete(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.clientId, parsed.data.clientId),
        eq(pushSubscriptionsTable.endpoint, parsed.data.endpoint),
      ),
    );

  const remaining = await db
    .select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.clientId, parsed.data.clientId))
    .limit(1);

  if (!remaining.length) {
    await db
      .delete(pushRemindersTable)
      .where(eq(pushRemindersTable.clientId, parsed.data.clientId));
  }

  res.json(RemovePushSubscriptionResponse.parse({ removed: true }));
});

router.put("/push/reminders", async (req, res): Promise<void> => {
  const parsed = ReplacePushRemindersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { clientId, reminders } = parsed.data;
  const seenTaskIds = new Set<string>();
  for (const reminder of reminders) {
    if (seenTaskIds.has(reminder.taskId)) {
      res.status(400).json({ error: "A task can only have one reminder." });
      return;
    }
    seenTaskIds.add(reminder.taskId);
  }

  const subscriptions = await db
    .select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.clientId, clientId))
    .limit(1);

  const futureReminders = subscriptions.length
    ? reminders.filter((reminder) => reminder.scheduledAt > new Date())
    : [];

  await db.transaction(async (tx) => {
    await tx
      .delete(pushRemindersTable)
      .where(eq(pushRemindersTable.clientId, clientId));
    if (futureReminders.length) {
      await tx.insert(pushRemindersTable).values(
        futureReminders.map((reminder) => ({
          id: `${clientId}:${reminder.taskId}`,
          clientId,
          taskId: reminder.taskId,
          taskTitle: reminder.taskTitle,
          scheduledAt: reminder.scheduledAt,
        })),
      );
    }
  });

  res.json(
    ReplacePushRemindersResponse.parse({ scheduled: futureReminders.length }),
  );
});

export default router;