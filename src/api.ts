import { SuprSend } from '.';
import {
  Dictionary,
  HandleRequest,
  ERROR_TYPE,
  RESPONSE_STATUS,
} from './interface';
import { getResponsePayload } from './utils';
import jwt_decode from 'jwt-decode';

export default class ApiClient {
  private config: SuprSend;

  constructor(config: SuprSend) {
    this.config = config;
  }

  private getUrl(path: string) {
    return `${this.config.host}/${path}`;
  }

  private getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: this.config.publicApiKey,
    };

    if (this.config.userToken) {
      headers['x-ss-signature'] = this.config.userToken;
    }

    return headers;
  }

  private requestApiInstance(reqData: HandleRequest) {
    switch (reqData.type) {
      case 'get':
        return this.get(reqData.path);
      case 'post':
        return this.post(reqData.path, reqData?.payload || {});
      case 'patch':
        return this.patch(reqData.path, reqData?.payload || {});
      default:
        return this.get(reqData.path);
    }
  }

  private get(path: string) {
    const url = this.getUrl(path);

    return fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });
  }

  private post(path: string, payload: Dictionary) {
    const url = this.getUrl(path);

    return fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: this.getHeaders(),
    });
  }

  private patch(path: string, payload: Dictionary) {
    const url = this.getUrl(path);

    return fetch(url, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      headers: this.getHeaders(),
    });
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

    if (
      this.config.authenticateOptions?.refreshUserToken &&
      this.config.userToken
    ) {
      const jwtPayload = jwt_decode(this.config.userToken) as Dictionary;
      const expiresOn = ((jwtPayload.exp as number) || 0) * 1000; // in ms
      const now = Date.now(); // in ms
      const hasExpired = expiresOn <= now;
      if (hasExpired) {
        try {
          const newUserToken =
            await this.config.authenticateOptions.refreshUserToken(
              this.config.userToken
            );

          if (newUserToken && typeof newUserToken === 'string') {
            this.config.identify(
              this.config.distinctId,
              newUserToken,
              this.config.authenticateOptions
            );
          }
        } catch (e) {
          // error while getting token go ahead with calling api
        }
      }
    }

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
