import { SuprSendOptions, Dictionary } from './interface';
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

const DEFAULT_HOST = 'https://collector-staging.suprsend.workers.dev';
const DEFAULT_SW_FILENAME = 'serviceworker.js';
const SUPER_PROPERTIES_KEY = 'ss_super_properties';
const DEVICE_ID_KEY = 'ss_device_id';

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

  init(workspaceKey: string, options?: SuprSendOptions) {
    if (!workspaceKey) {
      throw new Error('SuprSend: workspaceKey is mandatory');
    }

    this.workspaceKey = workspaceKey;
    this.host = options?.host || DEFAULT_HOST;
    this.vapidKey = options?.vapidKey || '';
    this.swFileName = options?.swFileName || DEFAULT_SW_FILENAME;

    this.setEnvProperties();

    this.user = new User(this);
    this.webpush = new WebPush(this);
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
      throw new Error(
        'SuprSend: distinctId is missing. User should be authenticated'
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

  setSuperProperties(properties: Dictionary) {
    if (!(properties instanceof Object)) return;

    const existingData = this.localStorageService.get(SUPER_PROPERTIES_KEY) as
      | object
      | null;

    const newData = existingData
      ? { ...existingData, ...properties }
      : properties;

    this.localStorageService.set(SUPER_PROPERTIES_KEY, newData);
  }

  async authenticate(
    distinctId: unknown,
    userToken?: string
    // options?: AuthenticateOptions
  ) {
    if (this.apiClient && this.distinctId !== distinctId) {
      // user already present
      throw new Error(
        'SuprSend: User already logged in reset this user and authenticate with new user'
      );
    }

    if (
      this.apiClient &&
      this.distinctId === distinctId &&
      this.userToken !== userToken
    ) {
      // updating usertoken for existing user
      this.userToken = userToken;
      this.apiClient = this.createApiClient();
      return;
    }

    // only consider first method call ignore other calls
    if (this.apiClient) return;

    this.distinctId = distinctId;
    this.userToken = userToken;
    this.apiClient = this.createApiClient();

    return this.evenApi({
      event: '$identify',
      $insert_id: uuid(),
      $time: epochMs(),
      properties: {
        $identified_id: distinctId,
      },
    });
  }

  async track(event: string, properties?: Dictionary) {
    let propertiesObj: Dictionary = {};
    const superProperties = this.localStorageService.get(
      SUPER_PROPERTIES_KEY
    ) as object | null;

    if (superProperties) {
      propertiesObj = { ...superProperties };
    }
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

  reset() {
    this.apiClient = null;
    this.distinctId = null;
    this.userToken = '';
    this.envProperties = {};
    this.localStorageService.remove(SUPER_PROPERTIES_KEY);
    this.user = null;
    this.webpush = null;
  }
}

const suprsendInstance = new SuprSend();

export default suprsendInstance;
