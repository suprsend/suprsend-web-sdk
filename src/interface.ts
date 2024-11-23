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
  refreshUserToken?: RefreshTokenCallback;
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

// eslint-disable-next-line
export type InboxEmitterEvents = {
  'feed.new_notification': IRemoteNotification;
  'feed.store_update': IFeedData;
  '*': undefined;
};

export interface HandleRequest {
  type: 'get' | 'post' | 'patch';
  url: string;
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
  NOT_FOUND = 'NOT_FOUND',
}

export enum RESPONSE_STATUS {
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface IStore {
  storeId: string;
  label: string;
  query?: {
    tags?: string | string[];
    categories?: string | string[];
    read?: boolean;
    archived?: boolean;
  };
}

export enum ApiResponseStatus {
  INITIAL = 'INITIAL', //  Before any request is made (or after a reset).
  LOADING = 'LOADING', // The API call is in progress
  SUCCESS = 'SUCCESS', // The API call was successful, and data has been received
  ERROR = 'ERROR', // The API call failed (network issue, server issue, etc.)
  FETCHING_MORE = 'FETCHING_MORE', //  The API call is fetching additional data (for pagination or infinite scroll)
  EMPTY = 'EMPTY', // No data was returned, or the response was empty
}

export interface IActionObject {
  name: string;
  url: string;
  open_in_new_tab?: boolean;
}

export interface IAvatarObject {
  action_url?: string;
  avatar_url: string;
}

export interface ISubTextObject {
  action_url?: string;
  text: string;
}

export interface IRemoteNotificationMessage {
  header?: string;
  schema: string;
  text: string;
  url?: string;
  open_in_new_tab?: boolean;
  extra_data?: string;
  actions?: IActionObject[];
  avatar?: IAvatarObject;
  subtext?: ISubTextObject;
}

export interface IRemoteNotification {
  n_id: string;
  n_category: string;
  created_on: number;
  seen_on?: number;
  read_on?: number | null;
  interacted_on?: number;
  archived?: boolean;
  tags?: string[];
  expiry?: number;
  is_expiry_visible: boolean;
  is_pinned: boolean;
  can_user_unpin?: boolean;
  message: IRemoteNotificationMessage;
}

export interface IFeedOptions {
  tenantId?: string;
  pageSize?: number;
  stores?: IStore[] | null;
  host?: { socketHost?: string; apiHost?: string };
}

export interface INotificationStore {
  notifications: IRemoteNotification[];
  store: IStore;
  pageInfo: {
    total: number;
    currentPage: number;
    totalPages: number;
    pageSize: number;
  };
  meta: Record<string, number>;
  apiStatus: ApiResponseStatus;
  _firstFetchedTimeStamp: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IFeedData
  extends Omit<INotificationStore, '_firstFetchedTimeStamp'> {}

export interface IInboxFetchOptions {
  page?: number;
  pageSize?: number;
  storeId?: IStore;
}
