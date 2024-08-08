import { SuprSend } from './index';
import { urlB64ToUint8Array, getResponsePayload, windowSupport } from './utils';
import { ERROR_TYPE, RESPONSE_STATUS } from './interface';

export default class WebPush {
  private config: SuprSend;

  constructor(config: SuprSend) {
    this.config = config;
  }

  private async getPushSubscription() {
    if (!windowSupport()) return;

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
        return getResponsePayload({
          status: RESPONSE_STATUS.ERROR,
          errorType: ERROR_TYPE.VALIDATION_ERROR,
          errorMessage: 'Notification permission isnt granted',
        });
      }

      // wait until the service worker is ready
      const readyRegistration = await navigator.serviceWorker.ready;

      // if push subscribed present then do nothing
      const pushSubscriptionObj =
        await readyRegistration.pushManager.getSubscription();
      if (pushSubscriptionObj) {
        return getResponsePayload({ status: RESPONSE_STATUS.SUCCESS });
      }

      if (!this.config.vapidKey) {
        console.warn('[SuprSend]: Provide vapid key while calling init');
        return getResponsePayload({
          status: RESPONSE_STATUS.ERROR,
          errorType: ERROR_TYPE.VALIDATION_ERROR,
          errorMessage: 'Vapid key is missing in suprsend.init',
        });
      }

      // get the push token object
      const subscription = await readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(this.config.vapidKey),
      });

      // send push token object to suprsend
      return this.config.user.addWebPush(subscription);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.warn('SuprSend: Error getting push subscription', e);
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.UNKNOWN_ERROR,
        errorMessage: e?.message || 'Notification permission isnt granted',
      });
    }
  }

  async registerPush() {
    const pushSupported =
      windowSupport() &&
      'serviceWorker' in navigator &&
      'PushManager' in window;

    if (pushSupported) {
      return this.handleRegisterPush();
    } else {
      console.warn("[SuprSend]: Webpush isn't supported");
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: "Webpush isn't supported",
      });
    }
  }

  async updatePushSubscription() {
    const subscription = await this.getPushSubscription();
    if (subscription) {
      return this.config.user.addWebPush(subscription);
    }
  }

  async removePushSubscription() {
    const subscription = await this.getPushSubscription();
    if (subscription) {
      return this.config.user.removeWebPush(subscription);
    }
  }

  notificationPermission() {
    return Notification.permission;
  }
}
