// Service Worker — Escala de Ministros v3.0
// Suporta: push notifications, clique na notificação, atualização automática

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());

// ============ PUSH NOTIFICATIONS ============
self.addEventListener("push", (event) => {
  let data = { title: "Escala de Ministros", body: "", url: "/" };

  try {
    if (event.data) {
      const payload = event.data.json();
      data.title = payload.title || data.title;
      data.body = payload.body || payload.message || "";
      data.url = payload.url || payload.data?.url || "/";
    }
  } catch {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-96x96.png",
    vibrate: [200, 100, 200],
    data: { url: data.url },
    actions: [
      { action: "open", title: "Abrir" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Clique na notificação — abre o app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Se o app já está aberto, foca nele
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Se não está aberto, abre uma nova janela
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
