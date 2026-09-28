import { createECDH, hkdfSync } from "node:crypto";
import { and, eq, isNull, lt, lte } from "drizzle-orm";
import webpush from "web-push";
import {
  db,
  pushRemindersTable,
  pushSubscriptionsTable,
} from "@workspace/db";
import { logger } from "./logger";

const curveOrder = BigInt(
  "0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",
);

function toBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

function getVapidKeys(): { publicKey: string; privateKey: string } {
  const rootSecret = process.env.SESSION_SECRET;
  if (!rootSecret) {
    throw new Error(
      "SESSION_SECRET is required to keep PINKY browser push keys stable.",
    );
  }

  const derived = Buffer.from(
    hkdfSync(
      "sha256",
      rootSecret,
      "pinky-browser-push-v1",
      "vapid-signing-key",
      32,
    ),
  );
  const scalar = (BigInt(`0x${derived.toString("hex")}`) % (curveOrder - 1n)) + 1n;
  const privateBytes = Buffer.from(scalar.toString(16).padStart(64, "0"), "hex");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateBytes);

  return {
    publicKey: toBase64Url(ecdh.getPublicKey(undefined, "uncompressed")),
    privateKey: toBase64Url(privateBytes),
  };
}

const vapidKeys = getVapidKeys();
const firstDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
webpush.setVapidDetails(
  firstDomain ? `https://${firstDomain}` : "mailto:hello@pinky.app",
  vapidKeys.publicKey,
  vapidKeys.privateKey,
);

export function getBrowserPushPublicKey(): string {
  return vapidKeys.publicKey;
}

let deliveryTimer: NodeJS.Timeout | undefined;

async function deliverDueReminders(): Promise<void> {
  const now = new Date();

  // Release a claim left behind by a process restart; never send one reminder twice
  // merely because two API workers observed the same due row at once.
  await db
    .update(pushRemindersTable)
    .set({ claimedAt: null })
    .where(
      and(
        isNull(pushRemindersTable.sentAt),
        lt(
          pushRemindersTable.claimedAt,
          new Date(now.getTime() - 15 * 60 * 1000),
        ),
      ),
    );

  const due = await db
    .select()
    .from(pushRemindersTable)
    .where(
      and(
        lte(pushRemindersTable.scheduledAt, now),
        isNull(pushRemindersTable.sentAt),
        isNull(pushRemindersTable.claimedAt),
      ),
    )
    .limit(50);

  for (const reminder of due) {
    const [claimed] = await db
      .update(pushRemindersTable)
      .set({ claimedAt: now })
      .where(
        and(
          eq(pushRemindersTable.id, reminder.id),
          isNull(pushRemindersTable.sentAt),
          isNull(pushRemindersTable.claimedAt),
        ),
      )
      .returning();

    if (!claimed) continue;

    const subscriptions = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.clientId, reminder.clientId));

    if (!subscriptions.length) {
      await db
        .update(pushRemindersTable)
        .set({ claimedAt: null })
        .where(eq(pushRemindersTable.id, reminder.id));
      continue;
    }

    let delivered = false;
    let retryableFailure = false;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          subscription.subscription,
          JSON.stringify({
            title: "PINKY reminder",
            body: `Your task “${reminder.taskTitle}” is coming up.`,
            url: "/",
            tag: `pinky-task-${reminder.taskId}`,
          }),
          { TTL: 60 * 60 * 24 },
        );
        delivered = true;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.endpoint, subscription.endpoint));
        } else {
          retryableFailure = true;
          logger.warn(
            { err: error, clientId: reminder.clientId },
            "Browser push reminder delivery failed",
          );
        }
      }
    }

    if (delivered || !retryableFailure) {
      await db
        .update(pushRemindersTable)
        .set({ sentAt: new Date() })
        .where(eq(pushRemindersTable.id, reminder.id));
    }
  }
}

export function startPushDelivery(): void {
  if (deliveryTimer) return;
  deliveryTimer = setInterval(() => {
    void deliverDueReminders().catch((error: unknown) => {
      logger.error({ err: error }, "PINKY push delivery cycle failed");
    });
  }, 15_000);
  deliveryTimer.unref();
  void deliverDueReminders().catch((error: unknown) => {
    logger.error({ err: error }, "PINKY initial push delivery cycle failed");
  });
}