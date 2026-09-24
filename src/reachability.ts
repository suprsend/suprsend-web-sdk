import {
  ChannelStatus,
  IFeedReachability,
  ReachabilityStatus,
} from './interface';
import { windowSupport } from './utils';

// socket reconnect attempts reported as RECONNECTING before falling back to DEGRADED
const MAX_RECONNECTING_ATTEMPTS = 10;

export default class ReachabilityTracker {
  private onChange: (reachability: IFeedReachability) => void;
  private removed = false;
  private browserOnline: boolean;
  private socketStatus: ChannelStatus = ChannelStatus.UNKNOWN;
  private apiStatus: ChannelStatus = ChannelStatus.UNKNOWN;
  private lastConnectedAt?: number;
  private lastDisconnectedAt?: number;
  private disconnectReason?: string;
  private reconnectAttempts = 0;
  private reconnectExhausted = false;
  private lastSuccessAt?: number;
  private lastFailureAt?: number;
  private apiAuthFailed = false;
  private current: IFeedReachability;
  private handleBrowserOnline = () => this.recordBrowserOnline(true);
  private handleBrowserOffline = () => this.recordBrowserOnline(false);

  constructor(onChange: (reachability: IFeedReachability) => void) {
    this.onChange = onChange;
    this.browserOnline = this.readBrowserOnline();
    this.current = this.buildSnapshot(this.deriveStatus(), Date.now());

    if (windowSupport()) {
      window.addEventListener('online', this.handleBrowserOnline);
      window.addEventListener('offline', this.handleBrowserOffline);
    }
  }

  private readBrowserOnline() {
    if (!windowSupport() || typeof navigator === 'undefined') return true;
    return navigator.onLine ?? true;
  }

  private deriveStatus(): ReachabilityStatus {
    if (!this.browserOnline) return ReachabilityStatus.OFFLINE;

    // retrying won't help until the user token is fixed
    if (this.apiAuthFailed) return ReachabilityStatus.AUTH_ERROR;

    // only a socket that was connected before is treated as reconnecting
    if (
      this.socketStatus === ChannelStatus.DOWN &&
      this.apiStatus !== ChannelStatus.DOWN &&
      this.lastConnectedAt !== undefined &&
      !this.reconnectExhausted
    ) {
      return ReachabilityStatus.RECONNECTING;
    }

    if (
      this.socketStatus === ChannelStatus.DOWN ||
      this.apiStatus === ChannelStatus.DOWN
    ) {
      return ReachabilityStatus.DEGRADED;
    }

    if (
      this.socketStatus === ChannelStatus.UP ||
      this.apiStatus === ChannelStatus.UP
    ) {
      return ReachabilityStatus.ONLINE;
    }

    return ReachabilityStatus.UNKNOWN;
  }

  private buildSnapshot(
    status: ReachabilityStatus,
    lastChangedAt: number
  ): IFeedReachability {
    return Object.freeze({
      status,
      socket: Object.freeze({
        status: this.socketStatus,
        lastConnectedAt: this.lastConnectedAt,
        lastDisconnectedAt: this.lastDisconnectedAt,
        disconnectReason: this.disconnectReason,
        reconnectAttempts: this.reconnectAttempts,
      }),
      api: Object.freeze({
        status: this.apiStatus,
        lastSuccessAt: this.lastSuccessAt,
        lastFailureAt: this.lastFailureAt,
        authError: this.apiAuthFailed,
      }),
      lastChangedAt,
    });
  }

  private update() {
    const previous = this.current;
    const status = this.deriveStatus();
    const changed =
      status !== previous.status ||
      this.socketStatus !== previous.socket.status ||
      this.apiStatus !== previous.api.status ||
      this.apiAuthFailed !== previous.api.authError;

    this.current = this.buildSnapshot(
      status,
      changed ? Date.now() : previous.lastChangedAt
    );

    if (changed) {
      this.onChange(this.current);
    }
  }

  private recordBrowserOnline(online: boolean) {
    if (this.removed || online === this.browserOnline) return;

    this.browserOnline = online;
    this.update();
  }

  recordSocketStatus(
    status: ChannelStatus.UP | ChannelStatus.DOWN,
    reason?: string
  ) {
    if (this.removed || status === this.socketStatus) return;

    this.socketStatus = status;

    if (status === ChannelStatus.UP) {
      this.lastConnectedAt = Date.now();
      this.disconnectReason = undefined;
      this.reconnectAttempts = 0;
      this.reconnectExhausted = false;
    } else {
      this.lastDisconnectedAt = Date.now();
      this.disconnectReason = reason;
    }

    this.update();
  }

  recordReconnectAttempt(attempt: number) {
    if (this.removed) return;

    this.reconnectAttempts = attempt;
    this.reconnectExhausted = attempt > MAX_RECONNECTING_ATTEMPTS;
    this.update();
  }

  // socket.io won't retry on its own (server disconnect / middleware error)
  recordReconnectStopped() {
    if (this.removed || this.reconnectExhausted) return;

    this.reconnectExhausted = true;
    this.update();
  }

  recordApiStatus(status: ChannelStatus.UP | ChannelStatus.DOWN) {
    if (this.removed) return;

    this.apiStatus = status;

    if (status === ChannelStatus.UP) {
      this.lastSuccessAt = Date.now();
      this.apiAuthFailed = false;
    } else {
      this.lastFailureAt = Date.now();
    }

    this.update();
  }

  // 401/403 from the API: the user token is invalid or lacks permission
  recordApiAuthError() {
    if (this.removed) return;

    this.apiStatus = ChannelStatus.DOWN;
    this.apiAuthFailed = true;
    this.lastFailureAt = Date.now();
    this.update();
  }

  get reachability() {
    return this.current;
  }

  remove() {
    this.removed = true;

    if (!windowSupport()) return;
    window.removeEventListener('online', this.handleBrowserOnline);
    window.removeEventListener('offline', this.handleBrowserOffline);
  }
}
