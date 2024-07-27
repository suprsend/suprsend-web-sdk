export type Dictionary = Record<string, unknown>;

export interface SuprSendOptions {
  host?: string;
  vapidKey?: string;
  swFileName?: string;
}

export interface AuthenticateOptions {
  refreshUserToken: (distinctId: unknown, oldUserToken: string) => string;
}

export interface ApiResponse {
  statusCode: number;
  status: 'success' | 'error';
  // eslint-disable-next-line
  body?: any;
  // eslint-disable-next-line
  error?: any;
}
