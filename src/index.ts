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
  windowSupport,
  getResponsePayload,
  getLocalStorageData,
  setLocalStorageData,
  removeLocalStorageData,
} from './utils';
import User from './user';
import WebPush from './webpush';
import mitt, { Emitter } from 'mitt';
import jwt_decode from 'jwt-decode';

const DEFAULT_HOST = 'https://collector-staging.suprsend.workers.dev';
const DEFAULT_SW_FILENAME = 'serviceworker.js';
const AUTHENTICATED_DISTINCT_ID = 'ss_distinct_id';

export class SuprSend {
  public host: string;
  public publicApiKey: string;
  public distinctId: unknown;
  public userToken?: string;
  public vapidKey: string;
  public swFileName: string;
  private apiClient: ApiClient | null = null;
  private userTokenExpirationTimer: ReturnType<typeof setTimeout> | null = null;
  public authenticateOptions?: AuthenticateOptions;

  readonly user = new User(this);
  readonly webpush = new WebPush(this);
  readonly emitter: Emitter<EmitterEvents> = mitt();

  constructor(publicApiKey: string, options?: SuprSendOptions) {
    if (!publicApiKey) {
      throw new Error('[SuprSend]: publicApiKey is missing');
    }

    this.publicApiKey = publicApiKey;
    this.host = options?.host || DEFAULT_HOST;
    this.vapidKey = options?.vapidKey || '';
    this.swFileName = options?.swFileName || DEFAULT_SW_FILENAME;
  }

  private handleRefreshUserToken(refreshUserToken: RefreshTokenCallback) {
    if (!this.userToken || !windowSupport()) return;

    const jwtPayload = jwt_decode(this.userToken) as Dictionary;
    const expiresOn = ((jwtPayload.exp as number) || 0) * 1000; // in ms
    const now = Date.now(); // in ms
    const refreshBefore = 1000 * 30; // call refresh api before 1min of expiry

    if (expiresOn && expiresOn > now) {
      const timeDiff = expiresOn - now - refreshBefore;

      if (this.userTokenExpirationTimer) {
        clearTimeout(this.userTokenExpirationTimer);
      }
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
          this.identify(this.distinctId, newToken, this.authenticateOptions);
        }
      }, timeDiff);
    }
  }

  client() {
    if (!this.distinctId) {
      console.warn(
        '[SuprSend]: distinctId is missing. User should be authenticated'
      );
    }

    if (!this.apiClient) {
      this.apiClient = new ApiClient(this);
    }

    return this.apiClient;
  }

  eventApi(payload: Dictionary) {
    return this.client().request({ path: 'v2/event', payload, type: 'post' });
  }

  /**
   *  Used to authenticate user. Usually called just after successful login and on reload of loggedin route to re-authenticate loggedin user.
   *  In production env's userToken is mandatory for security purposes.
   */
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
      this.apiClient = new ApiClient(this);
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
    this.apiClient = new ApiClient(this);
    this.authenticateOptions = options;
    const authenticatedDistinctId = getLocalStorageData(
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
      this.webpush.updatePushSubscription();
      setLocalStorageData(AUTHENTICATED_DISTINCT_ID, this.distinctId as string);
    } else {
      // reset user data so that user can retry
      this.reset({ unsubscribePush: false });
    }
    return resp;
  }

  /**
   * Check's if SuprSend instance is authenticated. To check if userToken is also present pass true.
   */
  isIdentified(checkUserToken?: boolean) {
    return checkUserToken
      ? !!(this.userToken && this.distinctId)
      : !!this.distinctId;
  }

  /**
   *  Used to trigger events to suprsend.
   */
  async track(event: string, properties?: Dictionary) {
    let propertiesObj: Dictionary = {};

    if (!event) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'event name is missing',
      });
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

  /**
   * Clears user related data attached to SuprSend instance. Usually called during logout.
   */
  async reset(options?: { unsubscribePush?: boolean }) {
    const unsubscribePush = !(options?.unsubscribePush === false); // defaults to true

    if (unsubscribePush) {
      await this.webpush?.removePushSubscription();
    }

    this.apiClient = null;
    this.distinctId = null;
    this.userToken = '';
    removeLocalStorageData(AUTHENTICATED_DISTINCT_ID);

    if (this.userTokenExpirationTimer) {
      clearTimeout(this.userTokenExpirationTimer);
    }
    return getResponsePayload({ status: RESPONSE_STATUS.SUCCESS });
  }
}

export default SuprSend;
export * from './interface';
