import {
  ChannelStatus,
  IFeedReachability,
  ReachabilityStatus,
} from './interface';
import { windowSupport } from './utils';

export default class ReachabilityTracker {
  private onChange: (reachability: IFeedReachability) => void;
  private removed = false;
  private browserOnline: boolean;
  private socketStatus: ChannelStatus = ChannelStatus.UNKNOWN;
  private apiStatus: ChannelStatus = ChannelStatus.UNKNOWN;
  private lastConnectedAt?: number;
  private lastDisconnectedAt?: number;
  private disconnectReason?: string;
  private lastSuccessAt?: number;
  private lastFailureAt?: number;
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
      }),
      api: Object.freeze({
        status: this.apiStatus,
        lastSuccessAt: this.lastSuccessAt,
        lastFailureAt: this.lastFailureAt,
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
      this.apiStatus !== previous.api.status;

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
    } else {
      this.lastDisconnectedAt = Date.now();
      this.disconnectReason = reason;
    }

    this.update();
  }

  recordApiStatus(status: ChannelStatus.UP | ChannelStatus.DOWN) {
    if (this.removed) return;

    this.apiStatus = status;

    if (status === ChannelStatus.UP) {
      this.lastSuccessAt = Date.now();
    } else {
      this.lastFailureAt = Date.now();
    }

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
