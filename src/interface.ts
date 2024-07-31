export type Dictionary = Record<string, unknown>;

export interface SuprSendOptions {
  host?: string;
  vapidKey?: string;
  swFileName?: string;
}

export type RefreshTokenCallback = (oldUserToken: string) => Promise<string>;

export interface AuthenticateOptions {
  refreshUserToken: RefreshTokenCallback;
}

export interface ResponseOptions {
  status: 'error' | 'success';
  statusCode?: number;
  // eslint-disable-next-line
  body?: any;
  errorMessage?: string;
  errorType?: string;
}

interface IError {
  type?: string;
  message?: string;
}

export interface ApiResponse {
  status: 'success' | 'error';
  statusCode?: number;
  error?: IError;
  // eslint-disable-next-line
  body?: any;
}

export enum PreferenceOptions {
  OPT_IN = 'opt_in',
  OPT_OUT = 'opt_out',
}

export enum ChannelLevelPreferenceOptions {
  ALL = 'all',
  REQUIRED = 'required',
}

export interface CategoryChannel {
  channel: string;
  preference: PreferenceOptions;
  is_editable: boolean;
}

export interface Category {
  name: string;
  category: string;
  description?: string | null;
  preference: PreferenceOptions;
  is_editable: boolean;
  channels?: CategoryChannel[] | null;
}

export interface Section {
  name?: string | null;
  description?: string | null;
  subcategories?: Category[] | null;
}

export interface ChannelPreference {
  channel: string;
  is_restricted: boolean;
}

export interface PreferenceData {
  sections?: Section[] | null;
  channel_preferences?: ChannelPreference[] | null;
}

export interface PreferenceApiResponse extends ApiResponse {
  body: PreferenceData;
}

// eslint-disable-next-line
export type EmitterEvents = {
  preferences_updated: PreferenceApiResponse;
  preferences_error: ApiResponse;
};

export interface ApiClientOption {
  host: string;
  workspaceKey: string;
  userToken: string;
  distinctId: unknown;
}

export interface HandleRequest {
  type: 'get' | 'post';
  path: string;
  payload?: Dictionary;
}
