import jwt_decode from 'jwt-decode';
import SuprSend from './main';
import {
  Dictionary,
  HandleRequest,
  ERROR_TYPE,
  RESPONSE_STATUS,
} from './interface';
import { getResponsePayload } from './utils';

export default class ApiClient {
  private config: SuprSend;
  private userTokenRefreshInflight: Promise<void> | null = null;

  constructor(config: SuprSend) {
    this.config = config;
  }

  private getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: this.config.publicApiKey,
      'X-Suprsend-Client-User-Agent': JSON.stringify(
        this.config.clientUserAgent
      ),
      'X-Suprsend-User-Agent': this.config.userAgent,
    };

    if (this.config.userToken) {
      headers['x-ss-signature'] = this.config.userToken;
    }

    return headers;
  }

  private requestApiInstance(reqData: HandleRequest) {
    switch (reqData.type) {
      case 'get':
        return this.get(reqData.url, reqData.signal);
      case 'post':
        return this.post(reqData.url, reqData?.payload || {}, reqData.signal);
      case 'patch':
        return this.patch(reqData.url, reqData?.payload || {}, reqData.signal);
      default:
        return this.get(reqData.url, reqData.signal);
    }
  }

  private get(url: string, signal?: AbortSignal) {
    return fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
      signal,
    });
  }

  private post(url: string, payload: Dictionary, signal?: AbortSignal) {
    return fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: this.getHeaders(),
      signal,
    });
  }

  private patch(url: string, payload: Dictionary, signal?: AbortSignal) {
    return fetch(url, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      headers: this.getHeaders(),
      signal,
    });
  }

  async refreshExpiringUserToken() {
    const userToken = this.config.userToken;
    const refreshUserToken = this.config.authenticateOptions?.refreshUserToken;
    if (!userToken || !refreshUserToken) return;

    let jwtPayload: Dictionary;
    try {
      jwtPayload = jwt_decode(userToken) as Dictionary;
    } catch (e) {
      return;
    }

    if (!jwtPayload.exp) return;

    const expiresOn = ((jwtPayload.exp as number) || 0) * 1000; // in ms
    const now = Date.now(); // in ms
    const refreshBefore = 1000 * 30; // refresh token before 30sec of expiry
    const isExpiring = expiresOn - refreshBefore <= now;
    if (!isExpiring) return;

    if (!this.userTokenRefreshInflight) {
      this.userTokenRefreshInflight = (async () => {
        try {
          const newUserToken = await refreshUserToken(userToken, jwtPayload);

          if (newUserToken && typeof newUserToken === 'string') {
            await this.config.identify(
              this.config.distinctId,
              newUserToken,
              this.config.authenticateOptions
            );
          }
        } catch (e) {
          console.warn("[SuprSend]: Couldn't fetch new userToken", e);
        } finally {
          this.userTokenRefreshInflight = null;
        }
      })();
    }

    await this.userTokenRefreshInflight;
  }

  async request(reqData: HandleRequest) {
    if (!this.config.distinctId) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage:
          "User isn't authenticated. Call identify method before performing any action",
      });
    }

    await this.refreshExpiringUserToken();

    try {
      const resp = await this.requestApiInstance(reqData);
      const respData = await resp.json();

      const respStatus =
        respData?.status ||
        (resp.ok ? RESPONSE_STATUS.SUCCESS : RESPONSE_STATUS.ERROR);

      return getResponsePayload({
        status: respStatus,
        body: respData,
        statusCode: resp.status,
        errorMessage: respData?.error?.message,
        errorType: respData?.error?.type,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.error(e);

      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        statusCode: 500,
        errorMessage: e?.message || 'network error',
        errorType: ERROR_TYPE.NETWORK_ERROR,
      });
    }
  }
}
