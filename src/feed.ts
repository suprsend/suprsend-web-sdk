import { create, StoreApi } from 'zustand';
import { io, Socket } from 'socket.io-client';
import mitt, { Emitter } from 'mitt';
import { SuprSend } from './index';
import {
  IStore,
  ApiResponseStatus,
  IFeedOptions,
  INotificationStore,
  Dictionary,
  IInboxFetchOptions,
  RESPONSE_STATUS,
  IRemoteNotification,
  InboxEmitterEvents,
  ERROR_TYPE,
  ApiResponse,
  IFeedData,
} from './interface';

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_TENANT_ID = 'default';
const MAX_PAGE_SIZE = 100;
const DEFAULT_STORE = {
  storeId: '$suprsend_default_store',
  label: '',
};

const feedOptionsDefaults = {
  tenantId: DEFAULT_TENANT_ID,
  pageSize: DEFAULT_PAGE_SIZE,
  stores: null,
  host: {
    apiHost: 'https://inboxs.live',
    socketHost: 'https://betainbox.suprsend.com',
  },
};

const initialFeedStore: INotificationStore = {
  notifications: [],
  store: DEFAULT_STORE,
  pageInfo: {
    total: 0,
    currentPage: 0,
    totalPages: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  },
  meta: { badge: 0 },
  apiStatus: ApiResponseStatus.INITIAL,
  _firstFetchedTimeStamp: null,
};

export default class FeedsFactory {
  private config: SuprSend;
  feedInstances: Feed[] = [];

  constructor(config: SuprSend) {
    this.config = config;
  }

  initialize(options: IFeedOptions = {}) {
    const feedClient = new Feed(this.config, options);
    this.feedInstances.push(feedClient);
    return feedClient;
  }

  removeInstance(feedClient: Feed) {
    this.feedInstances = this.feedInstances.filter(
      (instance) => instance !== feedClient
    );
  }

  removeAll() {
    for (const feedInstance of this.feedInstances) {
      feedInstance.remove();
    }
    this.feedInstances = [];
  }
}

export class Feed {
  feedOptions: IFeedOptions;
  private config: SuprSend;
  private store: StoreApi<INotificationStore>;
  private socket: Socket;
  private expiryTimerId?: ReturnType<typeof setInterval>;
  readonly emitter: Emitter<InboxEmitterEvents> = mitt();

  constructor(config: SuprSend, options: IFeedOptions) {
    this.config = config;
    this.feedOptions = { ...feedOptionsDefaults, ...options };
    this.validateOptions();
    this.store = this.createStore();
  }

  private validateOptions() {
    this.validateStore();

    if (
      typeof this.feedOptions.pageSize === 'number' &&
      this.feedOptions.pageSize > 0
    ) {
      this.feedOptions.pageSize = Math.min(
        this.feedOptions.pageSize,
        MAX_PAGE_SIZE
      );
    }
  }

  private validateStore() {
    const stores = this.feedOptions.stores;

    if (!stores) return;

    if (!Array.isArray(stores) || stores?.length <= 0) {
      console.warn('SuprSend: stores should be an array of objects');
      return;
    }

    const validatedStores: IStore[] = [];

    stores.forEach((store) => {
      if (!store.storeId) {
        console.warn(
          'SuprSend: storeId is mandatory for each store. Ignoring store without storeId'
        );
        return;
      }
      const query = store?.query;
      let read: boolean | undefined;
      let archived: boolean | undefined;
      let tags: string[] | undefined = [];
      let categories: string[] | undefined = [];

      if (typeof query?.read === 'boolean') {
        read = query.read;
      }

      if (typeof query?.archived === 'boolean') {
        archived = query.archived;
      }

      if (typeof query?.tags === 'string') {
        tags = [query.tags];
      } else if (Array.isArray(query?.tags)) {
        tags = query?.tags.filter((tag) => {
          return typeof tag === 'string';
        });
      }

      if (typeof query?.categories === 'string') {
        categories = [query.categories];
      } else if (Array.isArray(query?.categories)) {
        categories = query?.categories.filter((category) => {
          return typeof category === 'string';
        });
      }

      validatedStores.push({
        storeId: store.storeId,
        label: store.label || store.storeId,
        query: {
          archived,
          read,
          tags,
          categories,
        },
      });
    });
    this.feedOptions.stores = validatedStores;
  }

  private createStore() {
    return create<INotificationStore>()(() => {
      return {
        ...initialFeedStore,
        store: this.feedOptions.stores?.[0] || DEFAULT_STORE,
      };
    });
  }

  private initializeSocketEvents() {
    this.socket.on(
      'new_notification',
      this.handleNewNotificationSocketEvent.bind(this)
    );

    this.socket.on(
      'notification_update',
      this.handleNoticationUpdateSocketEvent.bind(this)
    );

    this.socket.on(
      'bulk_notification_update',
      this.handleBulkNotificationUpdateSocketEvent.bind(this)
    );

    this.socket.on('reset_badge', async () => {
      const storeData = this.store.getState();
      this.store.setState({
        meta: { ...storeData.meta, badge: 0 },
      });
      this.emitter.emit('feed.store_update', this.data);
    });
  }

  private async handleNewNotificationSocketEvent(data: { n_id: string }) {
    if (!data.n_id) return;

    const response = await this.fetchDetails(data.n_id);
    if (response.status === RESPONSE_STATUS.ERROR) {
      return;
    }

    const newNotificationData = response.body;
    const storeData = this.store.getState();
    let emitNewNotificationEvent = false;

    const newMetaData = { ...storeData.meta };

    if (this.notificationBelongToStore(newNotificationData, storeData.store)) {
      emitNewNotificationEvent = true;
      this.store.setState({
        notifications: this.orderNotificationsBasedOnPinFlag(
          newNotificationData,
          storeData.notifications
        ),
      });
    }

    this.feedOptions.stores?.map?.((store) => {
      if (this.notificationBelongToStore(newNotificationData, store)) {
        emitNewNotificationEvent = true;
        newMetaData[store.storeId] = (storeData.meta[store.storeId] || 0) + 1;
      }
    });

    // update overall badge count as well if it belongs any of store current store
    this.store.setState({
      meta: {
        ...newMetaData,
        badge: emitNewNotificationEvent
          ? newMetaData.badge + 1
          : newMetaData.badge,
      },
    });

    if (emitNewNotificationEvent) {
      this.emitter.emit('feed.new_notification', newNotificationData);
    }

    this.emitter.emit('feed.store_update', this.data);
  }

  private async handleNoticationUpdateSocketEvent(data: {
    n_id: string;
    action?: string;
  }) {
    if (!data.n_id) return;

    const apiResponses = await Promise.allSettled([
      this.fetchDetails(data.n_id),
      this.fetchCount(),
    ]);

    const storeData = this.store.getState();

    if (apiResponses[0].status !== 'fulfilled') return;

    const response = apiResponses[0].value;

    if (response.status === RESPONSE_STATUS.ERROR) return;

    const newNotificationData: IRemoteNotification = response.body;

    const notificationPresent = storeData.notifications?.some(
      (notif) => notif.n_id === newNotificationData.n_id
    );
    const notificationBelongsToStore = this.notificationBelongToStore(
      newNotificationData,
      storeData.store
    );

    if (notificationBelongsToStore) {
      if (!notificationPresent) {
        this.store.setState({
          notifications: this.orderNotificationsBasedOnPinFlag(
            newNotificationData,
            storeData.notifications
          ),
        });
      } else {
        this.store.setState({
          notifications: storeData.notifications.map((notification) => {
            return notification.n_id === newNotificationData.n_id
              ? newNotificationData
              : notification;
          }),
        });
      }
    } else {
      this.store.setState({
        notifications: storeData.notifications.filter(
          (notification) => notification.n_id !== newNotificationData.n_id
        ),
      });
    }

    this.emitter.emit('feed.store_update', this.data);
  }

  private async handleBulkNotificationUpdateSocketEvent(data: {
    notification_ids: string | string[];
    action: string;
  }) {
    const storeData = this.store.getState();

    if (data.action === 'read' && data.notification_ids === 'all') {
      for (const key in storeData.meta) {
        storeData.meta[key] = 0;
      }

      this.store.setState({
        notifications: storeData.notifications.map((notification) => {
          if (!notification.read_on) {
            notification.read_on = Date.now();
          }
          return notification;
        }),
        meta: storeData.meta,
      });
    }

    this.emitter.emit('feed.store_update', this.data);
  }

  private notificationBelongToStore(
    notification: IRemoteNotification,
    store?: IStore
  ) {
    const notifRead = !!notification.read_on;
    const notifArchived = notification.archived;
    const notifTags: string[] | undefined = notification.tags;
    const notifCategory: string = notification.n_category;

    const storeRead = store?.query?.read;
    const storeArchived = store?.query?.archived;
    const storeTags = store?.query?.tags;
    const storeCategories = store?.query?.categories;

    const sameRead =
      storeRead === undefined || storeRead === null || notifRead === storeRead;
    const sameArchived = !!notifArchived === !!storeArchived;
    let sameTags = false;
    let sameCategory = false;

    if (Array.isArray(storeTags) && storeTags.length > 0) {
      storeTags.forEach((tag) => {
        if (notifTags?.includes(tag)) {
          sameTags = true;
        }
      });
    } else {
      sameTags = true;
    }

    if (Array.isArray(storeCategories) && storeCategories.length > 0) {
      if (storeCategories.includes(notifCategory)) {
        sameCategory = true;
      }
    } else {
      sameCategory = true;
    }

    return sameRead && sameTags && sameCategory && sameArchived;
  }

  private orderNotificationsBasedOnPinFlag(
    newNotification: IRemoteNotification,
    existingNotifications: IRemoteNotification[]
  ) {
    // if pinned notification add new notification append at start else at end of pinned notifications
    if (newNotification.is_pinned) {
      return [newNotification, ...existingNotifications];
    } else {
      let addedNotification = false;
      const notifications: IRemoteNotification[] = [];

      existingNotifications.forEach((notification) => {
        if (notification.is_pinned) {
          notifications.push(notification);
        } else {
          if (addedNotification) {
            notifications.push(notification);
          } else {
            notifications.push(newNotification);
            notifications.push(notification);
            addedNotification = true;
          }
        }
      });

      if (!addedNotification) {
        return [...existingNotifications, newNotification];
      }

      return notifications;
    }
  }

  private startExpiryTimer() {
    if (this.expiryTimerId) return;
    this.expiryTimerId = setInterval(this.removeExpiredFeed.bind(this), 30000);
  }

  private async removeExpiredFeed() {
    const storeData = this.store.getState();
    let hasExpired = false;

    const notifications = storeData.notifications.filter(
      (notification: IRemoteNotification) => {
        const expired = notification.expiry
          ? Date.now() > notification.expiry
          : false;
        if (expired) {
          hasExpired = true;
          return false;
        } else {
          return true;
        }
      }
    );

    if (hasExpired) {
      this.store.setState({ notifications });
      await this.fetchCount();
      this.emitter.emit('feed.store_update', this.data);
    }
  }

  private getUrl(path: string, qp?: Dictionary) {
    const urlPath = `${this.feedOptions.host?.apiHost}/v1/user/${this.config.distinctId}/inbox/${path}`;
    const validatedQueryParams = this.validateQueryParams(qp);
    const queryParamsString = new URLSearchParams(
      validatedQueryParams
    ).toString();
    return queryParamsString ? `${urlPath}?${queryParamsString}` : urlPath;
  }

  private validateQueryParams(queryParams: Dictionary = {}) {
    const validatedParams: Record<string, string> = {};
    for (const key in queryParams) {
      const paramValue = queryParams[key];
      if (
        paramValue === undefined ||
        paramValue === null ||
        paramValue === ''
      ) {
        continue;
      } else if (typeof paramValue === 'object') {
        validatedParams[key] = JSON.stringify(paramValue);
      } else {
        validatedParams[key] = String(paramValue);
      }
    }
    return validatedParams;
  }

  private requestInprogress() {
    const storeData = this.store.getState();

    return [
      ApiResponseStatus.LOADING,
      ApiResponseStatus.FETCHING_MORE,
    ].includes(storeData.apiStatus);
  }

  private storesQueryParamObj(stores: IStore[]) {
    const apiStores = stores?.map((store) => {
      return this.storeQueryParamObj(store);
    });

    return apiStores;
  }

  private storeQueryParamObj(store: IStore) {
    const query = store?.query;

    const tags = query?.tags || [];
    const categories = query?.categories || [];
    const read = query?.read;
    const archived = query?.archived;

    return {
      store_id: store.storeId,
      query: {
        read,
        archived,
        tags: { or: tags },
        categories: { or: categories },
      },
    };
  }

  async changeActiveStore(storeId: string) {
    const storeData = this.store.getState();

    if (storeData.store.storeId === storeId) return;

    const selectedStore = this.feedOptions.stores?.find(
      (store) => store.storeId === storeId
    );

    if (!selectedStore) {
      return {
        status: RESPONSE_STATUS.ERROR,
        error: {
          type: ERROR_TYPE.NOT_FOUND,
          message: `store with storeId ${storeId} doesnt exist`,
        },
      };
    }

    this.store.setState({
      ...initialFeedStore,
      store: selectedStore,
      meta: storeData.meta,
    });

    return await this.fetch();
  }

  get data() {
    const storeData = this.store.getState();

    return {
      notifications: storeData.notifications,
      pageInfo: storeData.pageInfo,
      meta: storeData.meta,
      apiStatus: storeData.apiStatus,
      store: storeData.store,
    } as IFeedData;
  }

  initializeSocketConnection() {
    if (this.socket) return;

    this.socket = io(this.feedOptions.host?.socketHost, {
      transports: ['websocket'],
      auth: {
        authorization: this.config.publicApiKey,
        'x-ss-signature': this.config.userToken,
        distinct_id: this.config.distinctId,
        tenant_id: this.feedOptions.tenantId,
        schema: '1',
      },
      reconnectionAttempts: 25,
      reconnectionDelay: 5000,
      reconnectionDelayMax: 10000,
    });

    this.initializeSocketEvents();
  }

  // TODO: support other stores and pages
  async fetch(options: IInboxFetchOptions = {}) {
    const storeData = this.store.getState();

    if (this.requestInprogress()) return;

    const pageNo = options?.page || 1;
    const pageSize = options?.pageSize || this.feedOptions.pageSize;
    const firstFetchedTimeStamp =
      storeData._firstFetchedTimeStamp || Date.now();

    if (pageNo > 1) {
      this.store.setState({
        apiStatus: ApiResponseStatus.FETCHING_MORE,
      });
    } else {
      this.store.setState({
        apiStatus: ApiResponseStatus.LOADING,
      });
      this.fetchCount();
    }
    this.emitter.emit('feed.store_update', this.data);

    const queryParams: Dictionary = {
      tenant_id: this.feedOptions.tenantId,
      page_size: pageSize,
      page_no: pageNo,
      before: firstFetchedTimeStamp,
      store:
        storeData.store.storeId !== DEFAULT_STORE.storeId
          ? this.storeQueryParamObj(storeData.store)
          : null,
    };

    const url = this.getUrl('notifications', queryParams);

    const response = await this.config.client().request({ type: 'get', url });

    if (response.status === RESPONSE_STATUS.ERROR) {
      this.store.setState({ apiStatus: ApiResponseStatus.ERROR });
      this.emitter.emit('feed.store_update', this.data);
      return response;
    }

    const isFirstFetch = response.body.meta.current_page === 1;

    this.store.setState({
      apiStatus: ApiResponseStatus.SUCCESS,
      notifications: isFirstFetch
        ? response.body.results
        : [...storeData.notifications, ...response.body.results],
      pageInfo: {
        ...storeData.pageInfo,
        total: response.body.meta.total_count,
        currentPage: response.body.meta.current_page,
        totalPages: response.body.meta.total_pages,
      },
      _firstFetchedTimeStamp: firstFetchedTimeStamp,
    });
    this.emitter.emit('feed.store_update', this.data);

    this.startExpiryTimer();

    return response;
  }

  // TODO: support other stores
  async fetchNextPage() {
    const storeData = this.store.getState();

    if (storeData.pageInfo.currentPage >= storeData.pageInfo.totalPages) {
      return {
        status: RESPONSE_STATUS.ERROR,
        error: {
          type: ERROR_TYPE.VALIDATION_ERROR,
          message: 'No more pages to fetch',
        },
      } as ApiResponse;
    }

    return this.fetch({ page: storeData.pageInfo.currentPage + 1 });
  }

  async fetchCount() {
    const queryParams: Dictionary = {
      tenant_id: this.feedOptions.tenantId,
      stores: this.feedOptions.stores
        ? this.storesQueryParamObj(this.feedOptions.stores)
        : null,
    };

    const url = this.getUrl('notifications_count', queryParams);

    const response = await this.config.client().request({ type: 'get', url });

    if (response.status === RESPONSE_STATUS.SUCCESS) {
      this.store.setState({ meta: response.body });
    }

    this.emitter.emit('feed.store_update', this.data);
    return response;
  }

  async fetchDetails(notificationId: string) {
    const url = this.getUrl(`notifications/${notificationId}`, {
      tenant_id: this.feedOptions.tenantId,
    });

    return await this.config.client().request({ type: 'get', url });
  }

  async markAsSeen(notificationId: string) {
    const storeData = this.store.getState();
    let alreadyUpdated = false;

    this.store.setState({
      notifications: storeData.notifications.map((notification) => {
        if (notification.n_id === notificationId) {
          if (!notification.seen_on) {
            notification.seen_on = Date.now();
          } else {
            alreadyUpdated = true;
          }
        }
        return notification;
      }),
    });

    if (alreadyUpdated) return { status: RESPONSE_STATUS.SUCCESS };

    const url = this.getUrl(`notifications/${notificationId}/seen`, {
      tenant_id: this.feedOptions.tenantId,
    });

    this.emitter.emit('feed.store_update', this.data);
    return await this.config.client().request({ type: 'patch', url });
  }

  async markAsRead(notificationId: string) {
    const storeData = this.store.getState();
    let alreadyUpdated = false;

    this.store.setState({
      notifications: storeData.notifications.map((notification) => {
        if (notification.n_id === notificationId) {
          if (!notification.read_on) {
            notification.read_on = Date.now();
            notification.seen_on = Date.now();
          } else {
            alreadyUpdated = true;
          }
        }
        return notification;
      }),
    });

    if (alreadyUpdated) return { status: RESPONSE_STATUS.SUCCESS };

    const url = this.getUrl(`notifications/${notificationId}/read`, {
      tenant_id: this.feedOptions.tenantId,
    });

    this.emitter.emit('feed.store_update', this.data);
    return await this.config.client().request({ type: 'patch', url });
  }

  async markAsUnread(notificationId: string) {
    const storeData = this.store.getState();
    let alreadyUpdated = false;

    this.store.setState({
      notifications: storeData.notifications.map((notification) => {
        if (notification.n_id === notificationId) {
          if (notification.read_on) {
            notification.read_on = null;
          } else {
            alreadyUpdated = true;
          }
        }
        return notification;
      }),
    });

    if (alreadyUpdated) return { status: RESPONSE_STATUS.SUCCESS };

    const url = this.getUrl(`notifications/${notificationId}/unread`, {
      tenant_id: this.feedOptions.tenantId,
    });

    this.emitter.emit('feed.store_update', this.data);
    return await this.config.client().request({ type: 'patch', url });
  }

  // TODO: improve logic for already interacted cases
  async markAsInteracted(notificationId: string) {
    const storeData = this.store.getState();

    this.store.setState({
      notifications: storeData.notifications.map((notification) => {
        if (notification.n_id === notificationId) {
          if (!notification.interacted_on) {
            notification.interacted_on = Date.now();
          }
          if (!notification.read_on) {
            notification.read_on = Date.now();
          }
        }
        return notification;
      }),
    });

    const url = this.getUrl(`notifications/${notificationId}/interacted`, {
      tenant_id: this.feedOptions.tenantId,
    });

    this.emitter.emit('feed.store_update', this.data);
    return await this.config.client().request({ type: 'patch', url });
  }

  async markAsArchived(notificationId: string) {
    const storeData = this.store.getState();
    let alreadyUpdated = false;

    this.store.setState({
      notifications: storeData.notifications.filter((notification) => {
        if (notification.n_id === notificationId) {
          alreadyUpdated = !!notification.archived;
          return false;
        } else {
          return true;
        }
      }),
    });

    if (alreadyUpdated) return { status: RESPONSE_STATUS.SUCCESS };

    const url = this.getUrl(`notifications/${notificationId}/archive`, {
      tenant_id: this.feedOptions.tenantId,
    });

    this.emitter.emit('feed.store_update', this.data);
    return await this.config.client().request({ type: 'patch', url });
  }

  async markBulkAsSeen(notificationIds: string[]) {
    const storeData = this.store.getState();

    this.store.setState({
      notifications: storeData.notifications.map((notification) => {
        if (notificationIds.includes(notification.n_id)) {
          if (!notification.seen_on) {
            notification.seen_on = Date.now();
          }
        }
        return notification;
      }),
    });

    const url = this.getUrl(`bulk/notifications/seen`, {
      tenant_id: this.feedOptions.tenantId,
    });

    this.emitter.emit('feed.store_update', this.data);
    return await this.config.client().request({
      type: 'post',
      url,
      payload: { notification_ids: notificationIds },
    });
  }

  async resetBadgeCount() {
    const storeData = this.store.getState();

    // optimistic update
    this.store.setState({ meta: { ...storeData.meta, badge: 0 } });

    const url = this.getUrl('reset_bell_count', {
      tenant_id: this.feedOptions.tenantId,
    });

    this.emitter.emit('feed.store_update', this.data);
    return await this.config.client().request({ type: 'patch', url });
  }

  async markAllAsRead() {
    const storeData = this.store.getState();

    // optimistic update
    this.store.setState({
      meta: { ...storeData.meta, badge: 0 },
      notifications: storeData.notifications.map((notification) => {
        notification.read_on = Date.now();
        return notification;
      }),
    });

    const url = this.getUrl('mark_all_read', {
      tenant_id: this.feedOptions.tenantId,
    });

    this.emitter.emit('feed.store_update', this.data);
    return await this.config.client().request({ type: 'patch', url });
  }

  reset() {
    this.store.setState({
      ...initialFeedStore,
      store: this.feedOptions.stores?.[0] || DEFAULT_STORE,
    });
    this.emitter.emit('feed.store_update', this.data);

    if (this.expiryTimerId) {
      clearInterval(this.expiryTimerId);
      this.expiryTimerId = undefined;
    }
  }

  remove() {
    this.reset();
    this.emitter.off('*');
    this.socket?.disconnect();
    this.config.feeds.removeInstance(this);
  }
}
