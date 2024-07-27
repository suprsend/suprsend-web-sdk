import { Dictionary, ApiResponse } from './interface';

interface ApiClientOption {
  host: string;
  workspaceKey: string;
  userToken: string;
}

interface HandleRequest {
  type: 'get' | 'post';
  path: string;
  payload?: Dictionary;
}

export default class ApiClient {
  private workspaceKey: string;
  private userToken: string;
  private host: string;

  constructor(options: ApiClientOption) {
    this.host = options.host;
    this.workspaceKey = options.workspaceKey;
    this.userToken = options.userToken;
  }

  private getUrl(path: string) {
    return `${this.host}/${path}`;
  }

  private getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: this.workspaceKey,
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

  async request(reqData: HandleRequest): Promise<ApiResponse> {
    try {
      const resp = await this.requestApiInstance(reqData);
      const respData = await resp.json();

      return {
        status: respData?.status || (resp.ok ? 'success' : 'error'),
        body: respData,
        statusCode: resp.status,
      };
    } catch (e: unknown) {
      console.error(e);

      return {
        status: 'error',
        statusCode: 500,
        error: e,
      };
    }
  }
}
