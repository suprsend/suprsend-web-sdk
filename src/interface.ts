export type Dictionary = Record<string, unknown>;

export interface SuprSendOptions {
  host?: string;
  vapidKey?: string;
  swFileName?: string;
}

export type RefreshTokenCallback = (
  oldUserToken: string,
  tokenPayload: Dictionary
) => Promise<string>;

export interface AuthenticateOptions {
  refreshUserToken: RefreshTokenCallback;
}

export interface ResponseOptions {
  status: RESPONSE_STATUS.ERROR | RESPONSE_STATUS.SUCCESS;
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
  status: RESPONSE_STATUS.ERROR | RESPONSE_STATUS.SUCCESS;
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

export interface HandleRequest {
  type: 'get' | 'post' | 'patch';
  path: string;
  payload?: Dictionary;
}

export interface ValidatedDataOptions {
  allowReservedKeys?: boolean;
  valueType?: string;
}

export enum ERROR_TYPE {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  UNSUPPORTED_ACTION = 'UNSUPPORTED_ACTION',
}

export enum RESPONSE_STATUS {
  SUCCESS = 'success',
  ERROR = 'error',
}
