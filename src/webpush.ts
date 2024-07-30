import { SuprSend } from './index';
import { urlB64ToUint8Array } from './utils';

export default class WebPush {
  private config: SuprSend;

  constructor(config: SuprSend) {
    this.config = config;
  }

  async getPushSubscription() {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;

    const subscription = registration.pushManager.getSubscription();
    if (!subscription) return;
    return subscription;
  }

  private async handleRegisterPush() {
    try {
      // register the service worker
      await navigator.serviceWorker.register(`/${this.config.swFileName}`);

      // request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('[SuprSend]: Notification permission isnt granted');
      }

      // wait until the service worker is ready
      const readyRegistration = await navigator.serviceWorker.ready;

      // if push subscribed present then do nothing
      const pushSubscriptionObj =
        await readyRegistration.pushManager.getSubscription();
      if (pushSubscriptionObj) return;

      if (!this.config.vapidKey) {
        console.warn('[SuprSend]: Provide vapid key while calling init');
        return;
      }

      // get the push token object
      const subscription = await readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(this.config.vapidKey),
      });

      // send push token object to suprsend
      return this.config.user?.addWebPush(subscription);
    } catch (e) {
      console.warn('SuprSend: Error getting push subscription', e);
    }
  }

  async registerPush() {
    const pushSupported =
      'serviceWorker' in navigator && 'PushManager' in window;

    if (pushSupported) {
      return this.handleRegisterPush();
    } else {
      console.warn("[SuprSend]: Webpush isn't supported");
    }
  }

  notificationPermission() {
    return Notification.permission;
  }
}
