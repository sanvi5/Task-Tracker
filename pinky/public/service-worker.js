self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() || "" };
  }

  const scope = self.registration.scope;
  const target = new URL(data.url || "./", scope).href;

  event.waitUntil(
    self.registration.showNotification(data.title || "PINKY reminder", {
      body: data.body || "One of your reminders is ready.",
      icon: new URL("pinky-icon.svg", scope).href,
      badge: new URL("pinky-icon.svg", scope).href,
      tag: data.tag || "pinky-reminder",
      data: { url: target },
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      async (clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            await client.focus();
            if ("navigate" in client && client.url !== target) {
              await client.navigate(target);
            }
            return;
          }
        }
        await self.clients.openWindow(target);
      },
    ),
  );
});