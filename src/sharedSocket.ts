import { Socket } from 'socket.io-client';
import mitt, { Emitter } from 'mitt';
import jwt_decode from 'jwt-decode';
import { uuid } from './utils';

export const SOCKET_AUTH_ERROR_MESSAGE =
  'Authentication Error: wrong auth token';
const LEADER_UNRESPONSIVE_REASON = 'leader tab unresponsive';
const LEADER_RESPONSE_TIMEOUT_MS = 3000;
const LEADER_HEARTBEAT_INTERVAL_MS = 15000;
const LEADER_HEARTBEAT_JITTER_MS = 2000;
const MAX_MISSED_HEARTBEATS = 2;
const STATUS_EVENTS = ['connect', 'joined_room', 'disconnect', 'connect_error'];
const RELAYED_EVENTS = [
  'new_notification',
  'notification_update',
  'bulk_notification_update',
  'reset_badge',
  ...STATUS_EVENTS,
];

interface IRelayedEvent {
  event: string;
  args: unknown[];
}

interface ILeaderState {
  leaderId: string;
  reconnectAttempts: number;
  statusEvent?: IRelayedEvent;
  active: boolean;
  recovered: boolean;
  authFailed: boolean;
  tokenExpiry?: number;
}

type LeaderReplyMessage = {
  type: 'status' | 'pong';
  to: string;
} & ILeaderState;

type RelayedEventMessage = { type: 'event' } & Pick<
  ILeaderState,
  'leaderId' | 'active' | 'recovered'
> &
  IRelayedEvent;

type ChannelMessage =
  | { type: 'status_request'; from: string }
  | { type: 'ping'; from: string }
  | LeaderReplyMessage
  | RelayedEventMessage;

export function sharedSocketSupported() {
  return (
    typeof BroadcastChannel !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.locks?.request === 'function'
  );
}

function isDocumentVisible() {
  return (
    typeof document !== 'undefined' && document.visibilityState === 'visible'
  );
}

function isAuthError(args: unknown[]) {
  const errorMessage = (args[0] as { message?: string } | undefined)?.message;
  return errorMessage === SOCKET_AUTH_ERROR_MESSAGE;
}

function serializeArg(arg: unknown) {
  if (arg instanceof Error) return { message: arg.message };
  if (arg === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(arg));
  } catch {
    return undefined;
  }
}

function tokenExpiry(token?: string) {
  if (!token) return undefined;
  try {
    const exp = (jwt_decode(token) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : undefined;
  } catch {
    return undefined;
  }
}

export default class FeedSocketConnection {
  private id = uuid();
  private key: string;
  private createSocket: (getAuthToken: () => string | undefined) => Socket;
  private shared: boolean;
  private getUserToken: () => string | undefined;
  private socket?: Socket;
  private channel?: BroadcastChannel;
  private emitter: Emitter<Record<string, unknown[]>> = mitt();
  private lockAbort?: AbortController;
  private releaseLock?: () => void;
  private closed = false;
  private lastLeaderId?: string;
  private remoteActive = false;
  private remoteRecovered = false;
  private lastStatusEvent?: IRelayedEvent;
  private reconnectAttempts = 0;
  private usedToken?: string;
  private authFailed = false;
  private leaderReplyTimerId?: ReturnType<typeof setTimeout>;
  private heartbeatTimerId?: ReturnType<typeof setTimeout>;
  private missedHeartbeats = 0;
  private leaderUnresponsive = false;
  private userTriggeredCheck = false;
  private takeoverAttemptedForLeaderId?: string;
  isLeader = false;

  constructor(
    key: string,
    createSocket: (getAuthToken: () => string | undefined) => Socket,
    shared: boolean,
    getUserToken: () => string | undefined
  ) {
    this.key = key;
    this.createSocket = createSocket;
    this.shared = shared;
    this.getUserToken = getUserToken;
  }

  connect() {
    if (!this.shared || !sharedSocketSupported()) {
      this.becomeLeader();
      return;
    }

    this.listenVisibility();

    this.channel = new BroadcastChannel(this.key);
    this.channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      this.handleChannelMessage(event.data);
    };

    this.startFollowing(true);
  }

  private listenVisibility() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private unlistenVisibility() {
    if (typeof document === 'undefined') return;
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );
  }

  private startFollowing(userTriggered = false) {
    this.requestLock(false);
    this.checkLeader(userTriggered);
    this.startHeartbeat();
  }

  private requestLock(steal: boolean) {
    const abort = steal ? undefined : new AbortController();
    this.lockAbort = abort;
    const options: LockOptions = abort
      ? { signal: abort.signal }
      : { steal: true };

    navigator.locks
      .request(this.key, options, () => {
        if (this.closed) return;
        this.becomeLeader();
        return new Promise<void>((resolve) => {
          this.releaseLock = resolve;
        });
      })
      .catch(() => {
        if (this.isLeader && !this.closed) {
          this.demote();
        }
      });
  }

  private handleVisibilityChange = () => {
    if (!isDocumentVisible()) {
      this.stopHeartbeat();
      return;
    }

    if (this.isLeader) {
      this.revive();
      return;
    }

    this.checkLeader(true);
    this.startHeartbeat();
  };

  private checkLeader(userTriggered = false) {
    if (this.isLeader || this.closed) return;

    this.userTriggeredCheck = userTriggered;
    this.clearLeaderReplyTimer();
    this.leaderReplyTimerId = setTimeout(() => {
      this.leaderReplyTimerId = undefined;
      this.takeLeadership();
    }, LEADER_RESPONSE_TIMEOUT_MS);

    this.post({ type: 'status_request', from: this.id });
  }

  private clearLeaderReplyTimer() {
    if (!this.leaderReplyTimerId) return;
    clearTimeout(this.leaderReplyTimerId);
    this.leaderReplyTimerId = undefined;
  }

  private startHeartbeat() {
    if (this.isLeader || this.closed || this.heartbeatTimerId) return;
    if (!isDocumentVisible()) return;

    this.heartbeatTimerId = setTimeout(
      () => {
        this.heartbeatTimerId = undefined;
        this.sendHeartbeat();
        this.startHeartbeat();
      },
      LEADER_HEARTBEAT_INTERVAL_MS + Math.random() * LEADER_HEARTBEAT_JITTER_MS
    );
  }

  private stopHeartbeat() {
    this.missedHeartbeats = 0;
    if (!this.heartbeatTimerId) return;
    clearTimeout(this.heartbeatTimerId);
    this.heartbeatTimerId = undefined;
  }

  private sendHeartbeat() {
    if (this.isLeader || this.closed || this.leaderReplyTimerId) return;

    this.leaderReplyTimerId = setTimeout(() => {
      this.leaderReplyTimerId = undefined;
      this.missedHeartbeats += 1;
      this.markLeaderUnresponsive();
      if (this.missedHeartbeats >= MAX_MISSED_HEARTBEATS) {
        this.takeLeadership();
      }
    }, LEADER_RESPONSE_TIMEOUT_MS);

    this.post({ type: 'ping', from: this.id });
  }

  private markLeaderUnresponsive() {
    if (this.leaderUnresponsive) return;
    this.leaderUnresponsive = true;
    this.remoteActive = true;
    this.emitter.emit('disconnect', [LEADER_UNRESPONSIVE_REASON]);
  }

  private takeLeadership() {
    if (this.isLeader || this.closed) return;
    this.lockAbort?.abort();
    this.requestLock(true);
  }

  private demote() {
    this.closeSocket();
    this.isLeader = false;
    this.lastLeaderId = this.id;
    this.releaseLock?.();
    this.releaseLock = undefined;

    this.startFollowing();
  }

  private becomeLeader() {
    this.isLeader = true;
    this.leaderUnresponsive = false;
    this.clearLeaderReplyTimer();
    this.stopHeartbeat();

    if (this.lastLeaderId) {
      this.emitter.emit('leader_change', []);
    }

    this.openSocket();
  }

  private openSocket() {
    this.authFailed = false;
    this.socket = this.createSocket(() => {
      this.usedToken = this.getUserToken();
      return this.usedToken;
    });

    RELAYED_EVENTS.forEach((event) => {
      this.socket?.on(event, (...args: unknown[]) => {
        this.dispatch(event, args);
      });
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      this.dispatch('reconnect_attempt', [attempt]);
    });
  }

  private closeSocket() {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.io.off('reconnect_attempt');
    this.socket.disconnect();
    this.socket = undefined;
  }

  private dispatch(event: string, args: unknown[]) {
    this.trackAuthFailure(event, args);
    this.emitter.emit(event, args);

    if (!this.channel) return;

    const serializedArgs = args.map(serializeArg);
    this.trackStatus(event, serializedArgs);
    this.post({
      type: 'event',
      leaderId: this.id,
      event,
      args: serializedArgs,
      active: this.active,
      recovered: this.recovered,
    });
  }

  private trackAuthFailure(event: string, args: unknown[]) {
    if (event === 'connect') {
      this.authFailed = false;
    } else if (event === 'connect_error') {
      this.authFailed = isAuthError(args) && !this.socket?.active;
    }
  }

  private trackStatus(event: string, args: unknown[]) {
    if (event === 'reconnect_attempt') {
      this.reconnectAttempts = Number(args[0]) || 0;
      return;
    }

    if (!STATUS_EVENTS.includes(event)) return;
    if (event === 'connect_error' && isAuthError(args)) return;

    if (event === 'connect') {
      this.reconnectAttempts = 0;
    }
    this.lastStatusEvent = { event, args };
  }

  private leaderState(): ILeaderState {
    return {
      leaderId: this.id,
      reconnectAttempts: this.reconnectAttempts,
      statusEvent: this.lastStatusEvent,
      active: this.active,
      recovered: this.recovered,
      authFailed: this.authFailed,
      tokenExpiry: tokenExpiry(this.usedToken),
    };
  }

  private handleChannelMessage(message: ChannelMessage) {
    if (this.closed) return;

    if (this.isLeader) {
      this.replyAsLeader(message);
    } else if (message.type === 'status' || message.type === 'pong') {
      this.handleLeaderReply(message);
    } else if (message.type === 'event') {
      this.handleRelayedEvent(message);
    }
  }

  private replyAsLeader(message: ChannelMessage) {
    if (message.type === 'status_request') {
      this.post({ type: 'status', to: message.from, ...this.leaderState() });
    } else if (message.type === 'ping') {
      this.post({ type: 'pong', to: message.from, ...this.leaderState() });
    }
  }

  private handleLeaderReply(message: LeaderReplyMessage) {
    if (message.to !== this.id) return;

    const isStatus = message.type === 'status';
    const userTriggered = isStatus && this.userTriggeredCheck;
    if (isStatus) {
      this.userTriggeredCheck = false;
    }
    this.applyLeaderStatus(message, isStatus || this.leaderUnresponsive);
    this.takeOverIfLeaderSocketDead(message, userTriggered);
  }

  private handleRelayedEvent(message: RelayedEventMessage) {
    this.syncWithLeader(message.leaderId, message.active, message.recovered);
    this.emitter.emit(message.event, message.args);
    if (this.leaderUnresponsive) {
      this.sendHeartbeat();
    }
  }

  private syncWithLeader(
    leaderId: string,
    active: boolean,
    recovered: boolean
  ) {
    this.missedHeartbeats = 0;
    this.trackLeader(leaderId);
    this.remoteActive = active;
    this.remoteRecovered = recovered;
  }

  private takeOverIfLeaderSocketDead(
    state: ILeaderState,
    userTriggered: boolean
  ) {
    if (state.active) {
      this.takeoverAttemptedForLeaderId = undefined;
      return;
    }
    if (!isDocumentVisible()) return;
    if (
      !userTriggered &&
      this.takeoverAttemptedForLeaderId === state.leaderId
    ) {
      return;
    }
    if (!this.leaderSocketGaveUp(state)) return;

    this.takeoverAttemptedForLeaderId = state.leaderId;
    this.takeLeadership();
  }

  private applyLeaderStatus(state: ILeaderState, replay: boolean) {
    this.clearLeaderReplyTimer();
    this.leaderUnresponsive = false;
    this.syncWithLeader(state.leaderId, state.active, state.recovered);

    if (!replay) return;

    if (state.reconnectAttempts > 0) {
      this.emitter.emit('reconnect_attempt', [state.reconnectAttempts]);
    }
    if (state.statusEvent) {
      this.emitter.emit(state.statusEvent.event, state.statusEvent.args);
    }
  }

  private leaderSocketGaveUp(state: ILeaderState) {
    if (!state.authFailed) return true;

    const ownExpiry = tokenExpiry(this.getUserToken());
    return !!ownExpiry && !!state.tokenExpiry && ownExpiry > state.tokenExpiry;
  }

  private trackLeader(leaderId: string) {
    if (this.lastLeaderId && this.lastLeaderId !== leaderId) {
      this.emitter.emit('leader_change', []);
    }
    this.lastLeaderId = leaderId;
  }

  private post(message: ChannelMessage) {
    try {
      this.channel?.postMessage(message);
    } catch {
      return;
    }
  }

  /**
   * Subscribes to a socket event, whether received by this tab's socket or relayed from the leader tab.
   */
  on<T extends unknown[]>(event: string, handler: (...args: T) => void) {
    this.emitter.on(event, (args) => handler(...(args as T)));
  }

  /**
   * Emits an event to the server. No-op in follower tabs so the server receives it once.
   */
  emitToServer(event: string, data: unknown) {
    if (!this.isLeader) return;
    this.socket?.emit(event, data);
  }

  /**
   * Opens a fresh socket in the leader tab when the current one has stopped retrying. After an auth failure it waits until a different user token is available.
   */
  revive() {
    if (!this.isLeader || this.closed || !this.socket || this.socket.active) {
      return;
    }
    if (this.authFailed && this.getUserToken() === this.usedToken) return;

    this.closeSocket();
    this.openSocket();
  }

  get active() {
    return this.isLeader ? !!this.socket?.active : this.remoteActive;
  }

  get recovered() {
    return this.isLeader ? !!this.socket?.recovered : this.remoteRecovered;
  }

  disconnect() {
    this.socket?.disconnect();
    this.closed = true;
    this.clearLeaderReplyTimer();
    this.stopHeartbeat();
    this.unlistenVisibility();
    this.releaseLock?.();
    this.lockAbort?.abort();
    this.channel?.close();
    this.emitter.all.clear();
  }
}
