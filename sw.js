---
layout: null
---
'use strict';
const version = '{{site.time | date: '%Y%m%d%H%M%S'}}';
const cacheName = `static::${version}`;
const __DEVELOPMENT__ = false;
const __DEBUG__ = false;
const offlineResources = [
  '/',
  '/offline/index.html',
];

const ignoreFetch = [
  /https?:\/\/www.google-analytics.com\//,
  /https?:\/\/ajax.cloudflare.com\//,
  /https?:\/\/fonts.googleapis.com\//,
  /https?:\/\/fonts.gstatic.com\//,
  /https?:\/\/cdn.onesignal.com\//,
  /https?:\/\/onesignal.com\//,
];


//////////
// Install
//////////
function onInstall(event) {
  log('install event in progress.');
  event.waitUntil(updateStaticCache());
}

function updateStaticCache() {
  return caches
    .open(cacheKey('offline'))
    .then((cache) => {
      return cache.addAll(offlineResources);
    })
    .then(() => {
      log('installation complete!');
    });
}

////////
// Fetch
////////
function onFetch(event) {
  const request = event.request;

  if (shouldAlwaysFetch(request)) {
    event.respondWith(networkedOrOffline(request));
    return;
  }

  if (shouldFetchAndCache(request)) {
    event.respondWith(networkedOrCached(request));
    return;
  }

  event.respondWith(cachedOrNetworked(request));
}

function networkedOrCached(request) {
  return networkedAndCache(request)
    .catch(() => { return cachedOrOffline(request) });
}

// notification
function networkedAndCache(request) {
  return fetch(request)
    .then((response) => {
      var copy = response.clone();
      caches.open(cacheKey('resources'))
        .then((cache) => {
          cache.put(request, copy);
        });

      log("(network: cache write)", request.method, request.url);
      return response;
    });
}

function cachedOrNetworked(request) {
  return caches.match(request)
    .then((response) => {
      log(response ? '(cached)' : '(network: cache miss)', request.method, request.url);
      return response ||
        networkedAndCache(request)
          .catch(() => { return offlineResponse(request) });
    });
}

function networkedOrOffline(request) {
  return fetch(request)
    .then((response) => {
      log('(network)', request.method, request.url);
      return response;
    })
    .catch(() => {
      return offlineResponse(request);
    });
}

function cachedOrOffline(request) {
  return caches
    .match(request)
    .then((response) => {
      return response || offlineResponse(request);
    });
}

function offlineResponse(request) {
  log('(offline)', request.method, request.url);
  if (request.url.match(/\.(jpg|png|gif|svg|jpeg)(\?.*)?$/)) {
    return caches.match('');
  } else {
    return caches.match('/offline/index.html');
  }
}

///////////
// Activate
///////////
function onActivate(event) {
  log('activate event in progress.');
  event.waitUntil(removeOldCache());
}

function removeOldCache() {
  return caches
    .keys()
    .then((keys) => {
      return Promise.all( // We return a promise that settles when all outdated caches are deleted.
        keys
         .filter((key) => {
           return !key.startsWith(version); // Filter by keys that don't start with the latest version prefix.
         })
         .map((key) => {
           return caches.delete(key); // Return a promise that's fulfilled when each outdated cache is deleted.
         })
      );
    })
    .then(() => {
      log('removeOldCache completed.');
    });
}

function cacheKey() {
  return [version, ...arguments].join(':');
}

function log() {
  if (developmentMode()) {
    console.log("SW:", ...arguments);
  }
}

function shouldAlwaysFetch(request) {
  return __DEVELOPMENT__ ||
    request.method !== 'GET' ||
      ignoreFetch.some(regex => request.url.match(regex));
}

function shouldFetchAndCache(request) {
  return ~request.headers.get('Accept').indexOf('text/html');
}

function developmentMode() {
  return __DEVELOPMENT__ || __DEBUG__;
}

log("Hello from ServiceWorker land!", version);

self.addEventListener('install', onInstall);

self.addEventListener('fetch', onFetch);

self.addEventListener("activate", onActivate);


/*
const version = '{{site.time | date: '%Y%m%d%H%M%S'}}';
const cacheName = `static::${version}`;

function updateStaticCache() {
    return caches.open(cacheName).then(cache => {
        return cache.addAll([
            '/offline/',
            '/assets/images/banner.jpg',
            '/assets/js/jquery.min.js',
            '/assets/js/util.js',
            '/assets/js/main.js',
            '/assets/js/skel.min.js',
            '/assets/css/font-awesome.min.css',
            '/assets/css/main.css',
            '/index.html',
        ]);
    });
};

{% raw %}
function clearOldCache() {
    return caches.keys().then(keys => {
        // 删除名称不再有效的缓存。
        return Promise.all(keys
            .filter(key => {
                return key !== cacheName;
            })
            .map(key => {
                console.log(`Service Worker: removing cache ${key}`);
                return caches.delete(key);
            })
        );
    });
}

self.addEventListener('install', event => {
    event.waitUntil(updateStaticCache().then(() => {
        console.log(`Service Worker: cache updated to version: ${cacheName}`);
    }));
});
self.addEventListener('activate', event => {
    event.waitUntil(clearOldCache());
});
self.addEventListener('fetch', event => {
    let request = event.request;
    let url = new URL(request.url);
    // 只处理来自同一域的请求。
    if (url.origin !== location.origin) {
        return;
    }
    // 总是从网络获取非get请求。
    if (request.method !== 'GET') {
        event.respondWith(fetch(request));
        return;
    }
    // 对于HTML请求，首先尝试网络，否则返回到脱机页。
    if (request.headers.get('Accept').indexOf('text/html') !== -1) {
        event.respondWith(
            fetch(request).catch(() => caches.match('/offline/'))
        );
        return;
    }
    // 对于非HTML请求，首先查看缓存，否则返回网络。
    event.respondWith(
        caches.match(request)
            .then(response => {
                if (response) {
                    console.log('Serving cached: ', event.request.url);
                    return response;
                }
                console.log('Fetching: ', event.request.url);
                return fetch(request)
            })
    );
});
{% endraw %}

self.addEventListener('fetch', function (event) {
    event.respondWith(
        cache.match(event.request).then(function (response) {
            return response || fetch(event.request).then(function (response) {
                cache.put(event.request, response.clone());
                return response;
            });
        }).catch(function () {
            // 如果无法获取该资产，则显示仅脱机页。
            return caches.match('/offline/index.html')
        })
    );
});

*/