/*!
 * StudyDesk — service worker (offline support)
 *
 * Caches the app files on install so StudyDesk opens without internet.
 * Only same-origin GET requests are handled; nothing else is touched.
 * Bump VERSION whenever a file changes so users get the update.
 *
 * Author: Asaf Rojas (Sworfish Tech) — MIT License
 */
'use strict';

var VERSION = 'studydesk-v1.0.0';
var FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/i18n.js',
  'js/store.js',
  'js/grades.js',
  'js/planner.js',
  'js/pomodoro.js',
  'js/app.js',
  'fonts/bricolage-var.woff2',
  'fonts/lexend-var.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(VERSION).then(function (cache) { return cache.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Network first (so updates arrive fast), cache as the offline fallback.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(VERSION).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('index.html'); });
    })
  );
});

// Opening a timer notification brings the app to the front.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then(function (list) {
    if (list.length) return list[0].focus();
    return self.clients.openWindow('./#focus');
  }));
});
