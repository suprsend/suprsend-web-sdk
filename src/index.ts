import {
  SuprSendOptions,
  Dictionary,
  EmitterEvents,
  AuthenticateOptions,
  RefreshTokenCallback,
  ERROR_TYPE,
  RESPONSE_STATUS,
} from './interface';
import ApiClient from './api';
import {
  uuid,
  epochMs,
  browser,
  browserVersion,
  os,
  StorageService,
  getResponsePayload,
} from './utils';
import User from './user';
import WebPush from './webpush';
import packageJSON from '../package.json';
import mitt, { Emitter } from 'mitt';
import jwt_decode from 'jwt-decode';

const DEFAULT_HOST = 'https://collector-staging.suprsend.workers.dev';
const DEFAULT_SW_FILENAME = 'serviceworker.js';
const DEVICE_ID_KEY = 'ss_device_id';
const AUTHENTICATED_DISTINCT_ID = 'ss_distinct_id';

export class SuprSend {
  public host: string;
  private publicApiKey: string;
  public distinctId: unknown;
  private userToken?: string;
  private envProperties?: Dictionary;
  public vapidKey: string;
  public swFileName: string;
  private apiClient: ApiClient | null = null;
  private localStorageService = new StorageService<Dictionary>(
    window.localStorage
  );
  readonly user = new User(this);
  readonly webpush = new WebPush(this);
  readonly emitter: Emitter<EmitterEvents> = mitt();
  private userTokenExpirationTimer: ReturnType<typeof setTimeout> | null = null;

  init(publicApiKey: string, options?: SuprSendOptions) {
    if (!publicApiKey) {
      throw new Error('[SuprSend]: publicApiKey is missing');
    }

    this.publicApiKey = publicApiKey;
    this.host = options?.host || DEFAULT_HOST;
    this.vapidKey = options?.vapidKey || '';
    this.swFileName = options?.swFileName || DEFAULT_SW_FILENAME;

    this.setEnvProperties();
  }

  private setEnvProperties() {
    const deviceId = this.deviceId;

    if (!deviceId) {
      const deviceId = uuid();
      this.localStorageService.set(DEVICE_ID_KEY, deviceId);
    }

    this.envProperties = {
      $os: os(),
      $browser: browser(),
      $browser_version: browserVersion(),
      $sdk_type: 'Browser',
      $device_id: deviceId,
      $sdk_version: packageJSON.version,
    };
  }

  private createApiClient() {
    return new ApiClient({
      publicApiKey: this.publicApiKey,
      host: this.host,
      userToken: this.userToken || '',
      distinctId: this.distinctId,
    });
  }

  get deviceId() {
    return this.localStorageService.get(DEVICE_ID_KEY);
  }

  client() {
    if (!this.distinctId) {
      console.warn(
        '[SuprSend]: distinctId is missing. User should be authenticated'
      );
    }

    if (!this.apiClient) {
      this.apiClient = this.createApiClient(); // create new client
    }

    return this.apiClient;
  }

  eventApi(payload: Dictionary) {
    return this.client().request({ path: 'v2/event', payload, type: 'post' });
  }

  private handleRefreshUserToken(refreshUserToken: RefreshTokenCallback) {
    if (!this.userToken) return;

    const jwtPayload = jwt_decode(this.userToken) as Dictionary;
    const expiresOn = ((jwtPayload.exp as number) || 0) * 1000; // in ms
    const now = Date.now(); // in ms
    const refreshBefore = 1000 * 30; // call refresh api before 1min of expiry

    if (expiresOn && expiresOn > now) {
      const timeDiff = expiresOn - now - refreshBefore;

      this.userTokenExpirationTimer = setTimeout(async () => {
        let newToken = '';
        try {
          newToken = await refreshUserToken(this.userToken as string);
        } catch (e) {
          // retry fetching token
          try {
            newToken = await refreshUserToken(this.userToken as string);
          } catch (e) {
            console.warn("[SuprSend]: Couldn't fetch new userToken", e);
          }
        }

        if (newToken && typeof newToken === 'string') {
          this.identify(this.distinctId, newToken, {
            refreshUserToken: refreshUserToken,
          });
        }
      }, timeDiff);
    }
  }

  async identify(
    distinctId: unknown,
    userToken?: string,
    options?: AuthenticateOptions
  ) {
    if (!distinctId) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'distinctId is missing',
      });
    }

    // other user already present
    if (this.apiClient && this.distinctId && this.distinctId !== distinctId) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage:
          'User already loggedin, reset current user to login new user',
      });
    }

    // updating usertoken for existing user
    if (
      this.apiClient &&
      this.distinctId === distinctId &&
      this.userToken !== userToken
    ) {
      this.userToken = userToken;
      this.apiClient = this.createApiClient();
      if (options?.refreshUserToken) {
        this.handleRefreshUserToken(options.refreshUserToken);
      }
      return getResponsePayload({ status: RESPONSE_STATUS.SUCCESS });
    }

    // ignore more than one identify call
    if (this.apiClient) {
      return getResponsePayload({ status: RESPONSE_STATUS.SUCCESS });
    }

    this.distinctId = distinctId;
    this.userToken = userToken;
    this.apiClient = this.createApiClient();

    const authenticatedDistinctId = this.localStorageService.get(
      AUTHENTICATED_DISTINCT_ID
    );

    if (options?.refreshUserToken) {
      this.handleRefreshUserToken(options.refreshUserToken);
    }

    // already loggedin
    if (authenticatedDistinctId == this.distinctId) {
      this.webpush.updatePushSubscription();
      return getResponsePayload({ status: RESPONSE_STATUS.SUCCESS });
    }

    // first time login
    const resp = await this.eventApi({
      event: '$identify',
      $insert_id: uuid(),
      $time: epochMs(),
      properties: {
        $identified_id: distinctId,
      },
    });

    if (resp.status === RESPONSE_STATUS.SUCCESS) {
      // store user so that other method calls dont need api calls
      this.localStorageService.set(AUTHENTICATED_DISTINCT_ID, this.distinctId);
      this.webpush.updatePushSubscription();
    } else {
      // reset user data so that user can retry
      this.reset({ unsubscribePush: false });
    }
    return resp;
  }

  isIdentified(checkUserToken: boolean) {
    return checkUserToken
      ? !!(this.userToken && this.distinctId)
      : !!this.distinctId;
  }

  async track(event: string, properties?: Dictionary) {
    let propertiesObj: Dictionary = {};

    if (!event) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'event name is missing',
      });
    }

    if (this.envProperties) {
      propertiesObj = { ...propertiesObj, ...this.envProperties };
    }
    if (typeof properties === 'object') {
      propertiesObj = { ...propertiesObj, ...properties };
    }

    return this.eventApi({
      event: String(event),
      $insert_id: uuid(),
      $time: epochMs(),
      distinct_id: this.distinctId,
      properties: propertiesObj,
    });
  }

  async reset(options?: { unsubscribePush?: boolean }) {
    const unsubscribePush = !(options?.unsubscribePush === false); // defaults to true

    if (unsubscribePush) {
      await this.webpush?.removePushSubscription();
    }

    this.apiClient = null;
    this.distinctId = null;
    this.userToken = '';

    this.localStorageService.remove(AUTHENTICATED_DISTINCT_ID);
    if (this.userTokenExpirationTimer) {
      clearTimeout(this.userTokenExpirationTimer);
    }
    return getResponsePayload({ status: RESPONSE_STATUS.SUCCESS });
  }
}

const suprsendInstance = new SuprSend();

export default suprsendInstance;
export * from './interface';
