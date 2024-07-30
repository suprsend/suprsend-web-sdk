import {
  SuprSendOptions,
  Dictionary,
  EmitterEvents,
  AuthenticateOptions,
  RefreshTokenCallback,
} from './interface';
import ApiClient from './api';
import {
  uuid,
  epochMs,
  browser,
  browserVersion,
  os,
  StorageService,
} from './utils';
import User from './user';
import WebPush from './webpush';
import packageJSON from '../package.json';
import mitt, { Emitter } from 'mitt';
import { jwtDecode } from 'jwt-decode';

const DEFAULT_HOST = 'https://collector-staging.suprsend.workers.dev';
const DEFAULT_SW_FILENAME = 'serviceworker.js';
const DEVICE_ID_KEY = 'ss_device_id';
const AUTHENTICATED_DISTINCT_ID = 'ss_distinct_id';

export class SuprSend {
  public host: string;
  private workspaceKey: string;
  public distinctId: unknown;
  private userToken?: string;
  private envProperties?: Dictionary;
  public vapidKey: string;
  public swFileName: string;
  private apiClient: ApiClient | null = null;
  private localStorageService = new StorageService<Dictionary>(
    window.localStorage
  );
  public user: User | null;
  public webpush: WebPush | null;
  public emitter: Emitter<EmitterEvents>;
  private userTokenExpirationTimer: ReturnType<typeof setTimeout> | null = null;

  init(workspaceKey: string, options?: SuprSendOptions) {
    if (!workspaceKey) {
      throw new Error('[SuprSend]: workspaceKey is mandatory');
    }

    this.workspaceKey = workspaceKey;
    this.host = options?.host || DEFAULT_HOST;
    this.vapidKey = options?.vapidKey || '';
    this.swFileName = options?.swFileName || DEFAULT_SW_FILENAME;

    this.setEnvProperties();

    this.emitter = mitt();
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
      workspaceKey: this.workspaceKey,
      host: this.host,
      userToken: this.userToken || '',
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
      // create new client
      this.apiClient = this.createApiClient();
    }

    return this.apiClient;
  }

  evenApi(payload: Dictionary) {
    return this.client().request({ path: 'v2/event', payload, type: 'post' });
  }

  private handleRefreshUserToken(refreshUserToken: RefreshTokenCallback) {
    if (!this.userToken) return;

    const jwtPayload = jwtDecode(this.userToken);
    const expiresOn = (jwtPayload.exp ?? 0) * 1000; // in ms
    const now = Date.now(); // in ms
    const refreshBefore = 1000 * 30; // call refresh api before 1min of expiry

    if (expiresOn && expiresOn > now) {
      const timeDiff = expiresOn - now - refreshBefore;

      this.userTokenExpirationTimer = setTimeout(async () => {
        const newToken = await refreshUserToken(this.userToken as string);

        if (typeof newToken === 'string') {
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
      console.warn('[SuprSend]: distinctId is mandatory');
    }

    // other user already present
    if (this.apiClient && this.distinctId !== distinctId) {
      console.warn(
        '[SuprSend]: User already loggedin, reset current user to login new user'
      );
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
      return;
    }

    // only consider first method call, ignore the rest
    if (this.apiClient) return;

    this.distinctId = distinctId;
    this.userToken = userToken;
    this.apiClient = this.createApiClient();
    this.user = new User(this);
    this.webpush = new WebPush(this);
    const authenticatedDistinctId = this.localStorageService.get(
      AUTHENTICATED_DISTINCT_ID
    );

    if (options?.refreshUserToken) {
      this.handleRefreshUserToken(options.refreshUserToken);
    }

    if (authenticatedDistinctId == this.distinctId) return;

    const resp = await this.evenApi({
      event: '$identify',
      $insert_id: uuid(),
      $time: epochMs(),
      properties: {
        $identified_id: distinctId,
      },
    });

    if (resp.status === 'success') {
      // store user so that other method calls dont need api calls
      this.localStorageService.set(AUTHENTICATED_DISTINCT_ID, this.distinctId);
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

    if (this.envProperties) {
      propertiesObj = { ...propertiesObj, ...this.envProperties };
    }
    if (typeof properties === 'object') {
      propertiesObj = { ...propertiesObj, ...properties };
    }

    return this.evenApi({
      event: String(event),
      $insert_id: uuid(),
      $time: epochMs(),
      distinct_id: this.distinctId,
      properties: propertiesObj,
    });
  }

  async reset(options: { unsubscribePush: boolean }) {
    const unsubscribePush = options?.unsubscribePush ?? true;

    if (unsubscribePush) {
      const subscription = await this.webpush?.getPushSubscription();
      if (subscription) {
        await this.user?.removeWebPush(subscription);
      }
    }

    this.apiClient = null;
    this.distinctId = null;
    this.userToken = '';
    this.user = null;
    this.webpush = null;
    this.localStorageService.remove(AUTHENTICATED_DISTINCT_ID);
    if (this.userTokenExpirationTimer) {
      clearTimeout(this.userTokenExpirationTimer);
    }
  }
}

const suprsendInstance = new SuprSend();

export default suprsendInstance;
