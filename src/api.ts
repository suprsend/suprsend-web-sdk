import { Dictionary, ApiClientOption, HandleRequest } from './interface';
import { getResponsePayload } from './utils';

export default class ApiClient {
  private publicApiKey: string;
  private userToken: string;
  private host: string;
  private distinctId: unknown;

  constructor(options: ApiClientOption) {
    this.host = options.host;
    this.publicApiKey = options.publicApiKey;
    this.userToken = options.userToken;
    this.distinctId = options.distinctId;
  }

  private getUrl(path: string) {
    return `${this.host}/${path}`;
  }

  private getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: this.publicApiKey,
    };

    if (this.userToken) {
      headers['x-ss-signature'] = this.userToken;
    }

    return headers;
  }

  private requestApiInstance(reqData: HandleRequest) {
    switch (reqData.type) {
      case 'get':
        return this.get(reqData.path);
      case 'post':
        return this.post(reqData.path, reqData?.payload || {});
      default:
        return this.get(reqData.path);
    }
  }

  private get(path: string) {
    const url = this.getUrl(path);

    return fetch(url, {
      method: 'get',
      headers: this.getHeaders(),
    });
  }

  private post(path: string, payload: Dictionary) {
    const url = this.getUrl(path);

    return fetch(url, {
      method: 'post',
      body: JSON.stringify(payload),
      headers: this.getHeaders(),
    });
  }

  async request(reqData: HandleRequest) {
    if (!this.distinctId) {
      return getResponsePayload({
        status: 'error',
        errorType: 'VALIDATION_ERROR',
        errorMessage: 'user is not authenticated',
      });
    }

    try {
      const resp = await this.requestApiInstance(reqData);
      const respData = await resp.json();

      const respStatus = respData?.status || (resp.ok ? 'success' : 'error');

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
        status: 'error',
        statusCode: 500,
        errorMessage: e?.message || 'network error',
        errorType: 'NETWORK_ERROR',
      });
    }
  }
}
