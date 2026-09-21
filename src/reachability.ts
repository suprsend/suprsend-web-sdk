import {
  ChannelStatus,
  IFeedReachability,
  ReachabilityStatus,
} from './interface';
import { windowSupport } from './utils';

export default class ReachabilityTracker {
  private onChange: (snapshot: IFeedReachability) => void;
  private disposed = false;
  private online: boolean;
  private socketStatus: ChannelStatus = ChannelStatus.UNKNOWN;
  private apiStatus: ChannelStatus = ChannelStatus.UNKNOWN;
  private lastConnectedAt?: number;
  private lastDisconnectedAt?: number;
  private disconnectReason?: string;
  private lastSuccessAt?: number;
  private lastFailureAt?: number;
  private updatedAt: number = Date.now();
  private changeKey: string;
  private cachedSnapshot: IFeedReachability;
  private handleBrowserOnline = () => this.recordBrowserStatus(true);
  private handleBrowserOffline = () => this.recordBrowserStatus(false);

  constructor(onChange: (snapshot: IFeedReachability) => void) {
    this.onChange = onChange;
    this.online = this.readBrowserStatus();

    const status = this.deriveStatus();
    this.changeKey = this.buildChangeKey(status);
    this.cachedSnapshot = this.buildSnapshot(status);

    if (windowSupport()) {
      window.addEventListener('online', this.handleBrowserOnline);
      window.addEventListener('offline', this.handleBrowserOffline);
    }
  }

  private readBrowserStatus() {
    if (!windowSupport() || typeof navigator === 'undefined') return true;
    return navigator.onLine !== false;
  }

  private deriveStatus(): ReachabilityStatus {
    if (!this.online) return ReachabilityStatus.OFFLINE;

    const evidence = [this.socketStatus, this.apiStatus].filter(
      (channel) => channel !== ChannelStatus.UNKNOWN
    );

    if (evidence.length === 0) return ReachabilityStatus.UNKNOWN;

    return evidence.some((channel) => channel === ChannelStatus.DOWN)
      ? ReachabilityStatus.DEGRADED
      : ReachabilityStatus.ONLINE;
  }

  private buildChangeKey(status: ReachabilityStatus) {
    return `${status}|${this.socketStatus}|${this.apiStatus}`;
  }

  private buildSnapshot(status: ReachabilityStatus): IFeedReachability {
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
      updatedAt: this.updatedAt,
    });
  }

  private refresh() {
    const status = this.deriveStatus();
    const changeKey = this.buildChangeKey(status);
    const changed = changeKey !== this.changeKey;

    if (changed) {
      this.changeKey = changeKey;
      this.updatedAt = Date.now();
    }

    this.cachedSnapshot = this.buildSnapshot(status);

    if (changed && !this.disposed) {
      this.onChange(this.cachedSnapshot);
    }
  }

  private recordBrowserStatus(online: boolean) {
    if (this.disposed || online === this.online) return;

    this.online = online;
    this.refresh();
  }

  recordSocket(status: ChannelStatus, reason?: string) {
    if (this.disposed || status === this.socketStatus) return;

    this.socketStatus = status;

    if (status === ChannelStatus.UP) {
      this.lastConnectedAt = Date.now();
      this.disconnectReason = undefined;
    } else if (status === ChannelStatus.DOWN) {
      this.lastDisconnectedAt = Date.now();
      this.disconnectReason = reason;
    }

    this.refresh();
  }

  recordApiOutcome(reachable: boolean) {
    if (this.disposed) return;

    this.apiStatus = reachable ? ChannelStatus.UP : ChannelStatus.DOWN;

    if (reachable) {
      this.lastSuccessAt = Date.now();
    } else {
      this.lastFailureAt = Date.now();
    }

    this.refresh();
  }

  get snapshot() {
    return this.cachedSnapshot;
  }

  dispose() {
    this.disposed = true;

    if (!windowSupport()) return;
    window.removeEventListener('online', this.handleBrowserOnline);
    window.removeEventListener('offline', this.handleBrowserOffline);
  }
}
