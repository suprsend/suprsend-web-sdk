var validNotificationParams = [
  'title',
  'body',
  'icon',
  'image',
  'badge',
  'vibrate',
  'sound',
  'dir',
  'tag',
  'data',
  'requireInteraction',
  'renotify',
  'silent',
  'timestamp',
  'actions',
];

var notificationUrlFields = ['image', 'icon', 'badge'];

var suprsendConfig = {
  host: 'https://hub.suprsend.com',
  imgkitUrl: 'https://ik.imagekit.io/l0quatz6utm/',
  workspaceKey: '',
};

function safeGet(cb, defaultvalue) {
  var resp;
  try {
    resp = cb();
  } catch (err) {
    resp = defaultvalue;
  }
  return resp;
}

function validateNotification(notificationObj) {
  var validatedNotificationObj = {};

  for (var item in notificationObj) {
    if (validNotificationParams.includes(item)) {
      if (
        notificationUrlFields.includes(item) &&
        notificationObj[item] &&
        !notificationObj[item].startsWith('http')
      ) {
        validatedNotificationObj[item] =
          `${suprsendConfig.imgkitUrl}${notificationObj[item]}`;
      } else {
        validatedNotificationObj[item] = notificationObj[item];
      }
    }
  }
  if (!(validatedNotificationObj['actions'] instanceof Array)) {
    delete validatedNotificationObj['actions'];
  }
  return validatedNotificationObj;
}

function callSSApi(body, method = 'post') {
  var authorization = suprsendConfig.workspaceKey;
  const finalUrl = `${suprsendConfig.host}/v2/event`;

  return fetch(finalUrl, {
    method: method,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
    },
  });
}

function initSuprSend(key, options) {
  suprsendConfig.workspaceKey = key;

  if (options.host) {
    suprsendConfig.host = options.host;
  }
}

self.addEventListener('push', function (e) {
  var notification = e.data.json();
  var validated_notification = validateNotification(notification);

  callSSApi({
    event: '$notification_delivered',
    $time: Math.round(Date.now()),
    properties: {
      id: safeGet(() => validated_notification.data.notification_id),
    },
  });

  e.waitUntil(
    self.registration.showNotification(
      validated_notification.title || '',
      validated_notification
    )
  );
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();

  var notification = e.notification;
  var launchUrlObj = safeGet(() => notification.data.launch_urls);
  var redirectionUrl = '/';

  callSSApi({
    event: '$notification_clicked',
    $time: Math.round(Date.now()),
    properties: {
      id: safeGet(() => notification.data.notification_id),
      label_id: e.action,
    },
  });

  if (launchUrlObj) {
    if (e.action && launchUrlObj[e.action]) {
      redirectionUrl = launchUrlObj[e.action];
    } else if (launchUrlObj['default']) {
      redirectionUrl = launchUrlObj['default'];
    }
  } else {
    redirectionUrl = '/';
  }

  clients.openWindow(redirectionUrl);
});

self.addEventListener('notificationclose', function (e) {
  var notification = e.notification;

  callSSApi({
    event: '$notification_dismiss',
    $time: Math.round(Date.now()),
    properties: {
      id: safeGet(() => notification.data.notification_id),
    },
  });
});
