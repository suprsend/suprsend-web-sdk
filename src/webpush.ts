import { SuprSend } from './index';
import {
  urlB64ToUint8Array,
  getResponsePayload,
  windowSupport,
  sha256Hash,
  getLocalStorageData,
  setLocalStorageData,
} from './utils';
import { ERROR_TYPE, RESPONSE_STATUS } from './interface';

export const SUPRSEND_ENDPOINT_KEY = 'ss_wp_hash';

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

  private async checkAndUpdateOnServer(subscription: PushSubscription) {
    const endpoint = subscription.endpoint;
    let hash: string | null = null;
    try {
      hash = await sha256Hash(endpoint);
    } catch (e) {
      // pass
    }
    if (hash) {
      if (hash === getLocalStorageData(SUPRSEND_ENDPOINT_KEY)) {
        return getResponsePayload({ status: RESPONSE_STATUS.SUCCESS });
      }
      setLocalStorageData(SUPRSEND_ENDPOINT_KEY, hash);
    }
    return await this.config.user.addWebPush(subscription);
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
          errorType: ERROR_TYPE.PERMISSION_DENIED,
          errorMessage: "Notification permission isn't granted",
        });
      }

      // wait until the service worker is ready
      const readyRegistration = await navigator.serviceWorker.ready;

      // if push subscribed present then do nothing
      const pushSubscriptionObj =
        await readyRegistration.pushManager.getSubscription();
      if (pushSubscriptionObj) {
        return this.checkAndUpdateOnServer(pushSubscriptionObj);
      }

      if (!this.config.vapidKey) {
        console.warn(
          '[SuprSend]: Vapid key is missing. Add it while creating SuprSend instance'
        );
        return getResponsePayload({
          status: RESPONSE_STATUS.ERROR,
          errorType: ERROR_TYPE.VALIDATION_ERROR,
          errorMessage:
            'Vapid key is missing. Add it while creating SuprSend instance',
        });
      }

      // get the push token object
      const subscription = await readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(this.config.vapidKey),
      });

      // send push token object to suprsend
      return this.checkAndUpdateOnServer(subscription);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.warn('SuprSend: Error getting push subscription', e);
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.UNKNOWN_ERROR,
        errorMessage:
          e?.message || 'Unknown error occured while registering for push',
      });
    }
  }

  /**
   * Used to register push service. This method will
   * 1. Ask for notification permission.
   * 2. Register push service and generate webpush token.
   * 3. Send webpush token to SuprSend.
   */
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
        errorType: ERROR_TYPE.UNSUPPORTED_ACTION,
        errorMessage: "Webpush isn't supported",
      });
    }
  }

  async updatePushSubscription() {
    const subscription = await this.getPushSubscription();
    if (subscription) {
      return this.checkAndUpdateOnServer(subscription);
    }
  }

  async removePushSubscription() {
    const subscription = await this.getPushSubscription();
    if (subscription) {
      return this.config.user.removeWebPush(subscription);
    }
  }

  /**
   * Used to get browser level permission to show notifications.
   */
  notificationPermission() {
    return Notification.permission;
  }

  /**
   * Used to check if push service is already active in browser.
   */
  async pushSubscribed() {
    const subscription = await this.getPushSubscription();
    return !!subscription;
  }
}
