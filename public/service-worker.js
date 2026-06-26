// public/service-worker.js

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', event => {
  let data = { title: '⚡ ResQ — Action Ready', body: 'Pre-filled task is ready to execute.' };
  try {
    data = event.data.json();
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=192&h=192&fit=crop&q=80',
      badge: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=96&h=96&fit=crop&q=80',
      actions: [
        { action: 'execute', title: '⚡ Do It Now' },
        { action: 'later',   title: 'Later' }
      ],
      data: { taskId: data.taskId || '', artifactUrl: data.artifactUrl || '' },
      requireInteraction: true
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'execute') {
    const taskId = event.notification.data?.taskId;
    event.waitUntil(
      clients.openWindow(`/?task=${taskId}&autoexecute=true`)
    );
  }
});
