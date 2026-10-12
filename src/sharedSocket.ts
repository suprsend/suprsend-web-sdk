import { Socket } from 'socket.io-client';
import mitt, { Emitter } from 'mitt';
import { uuid } from './utils';

export const SOCKET_AUTH_ERROR_MESSAGE =
  'Authentication Error: wrong auth token';
const RELAYED_EVENTS = [
  'new_notification',
  'notification_update',
  'bulk_notification_update',
  'reset_badge',
  'connect',
  'joined_room',
  'disconnect',
  'connect_error',
];
const STATUS_EVENTS = ['connect', 'joined_room', 'disconnect', 'connect_error'];

interface IRelayedEvent {
  event: string;
  args: unknown[];
}

type ChannelMessage =
  | { type: 'status_request'; from: string }
  | {
      type: 'status';
      to: string;
      leaderId: string;
      reconnectAttempts: number;
      statusEvent?: IRelayedEvent;
      active: boolean;
      recovered: boolean;
    }
  | ({
      type: 'event';
      leaderId: string;
      active: boolean;
      recovered: boolean;
    } & IRelayedEvent);

export function sharedSocketSupported() {
  return (
    typeof BroadcastChannel !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.locks?.request === 'function'
  );
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

export default class FeedSocketConnection {
  private id = uuid();
  private key: string;
  private createSocket: () => Socket;
  private shared: boolean;
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
  isLeader = false;

  constructor(key: string, createSocket: () => Socket, shared: boolean) {
    this.key = key;
    this.createSocket = createSocket;
    this.shared = shared;
  }

  connect() {
    if (!this.shared || !sharedSocketSupported()) {
      this.becomeLeader();
      return;
    }

    this.channel = new BroadcastChannel(this.key);
    this.channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      this.handleChannelMessage(event.data);
    };

    this.lockAbort = new AbortController();
    navigator.locks
      .request(this.key, { signal: this.lockAbort.signal }, () => {
        if (this.closed) return;
        this.becomeLeader();
        return new Promise<void>((resolve) => {
          this.releaseLock = resolve;
        });
      })
      .catch(() => undefined);

    this.post({ type: 'status_request', from: this.id });
  }

  private becomeLeader() {
    this.isLeader = true;

    if (this.lastLeaderId) {
      this.emitter.emit('leader_change', []);
    }

    this.socket = this.createSocket();

    RELAYED_EVENTS.forEach((event) => {
      this.socket?.on(event, (...args: unknown[]) => {
        this.dispatch(event, args);
      });
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      this.dispatch('reconnect_attempt', [attempt]);
    });
  }

  private dispatch(event: string, args: unknown[]) {
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

  private trackStatus(event: string, args: unknown[]) {
    if (event === 'reconnect_attempt') {
      this.reconnectAttempts = Number(args[0]) || 0;
      return;
    }

    if (!STATUS_EVENTS.includes(event)) return;

    const errorMessage = (args[0] as { message?: string } | undefined)?.message;
    if (
      event === 'connect_error' &&
      errorMessage === SOCKET_AUTH_ERROR_MESSAGE
    ) {
      return;
    }

    if (event === 'connect') {
      this.reconnectAttempts = 0;
    }
    this.lastStatusEvent = { event, args };
  }

  private handleChannelMessage(message: ChannelMessage) {
    if (this.closed) return;

    if (this.isLeader) {
      if (message.type === 'status_request') {
        this.post({
          type: 'status',
          to: message.from,
          leaderId: this.id,
          reconnectAttempts: this.reconnectAttempts,
          statusEvent: this.lastStatusEvent,
          active: this.active,
          recovered: this.recovered,
        });
      }
      return;
    }

    if (message.type === 'status') {
      if (message.to !== this.id) return;
      this.trackLeader(message.leaderId);
      this.remoteActive = message.active;
      this.remoteRecovered = message.recovered;
      if (message.reconnectAttempts > 0) {
        this.emitter.emit('reconnect_attempt', [message.reconnectAttempts]);
      }
      if (message.statusEvent) {
        this.emitter.emit(message.statusEvent.event, message.statusEvent.args);
      }
    } else if (message.type === 'event') {
      this.trackLeader(message.leaderId);
      this.remoteActive = message.active;
      this.remoteRecovered = message.recovered;
      this.emitter.emit(message.event, message.args);
    }
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

  get active() {
    return this.isLeader ? !!this.socket?.active : this.remoteActive;
  }

  get recovered() {
    return this.isLeader ? !!this.socket?.recovered : this.remoteRecovered;
  }

  get auth() {
    return this.socket?.auth as Record<string, unknown> | undefined;
  }

  reconnect() {
    this.socket?.connect();
  }

  disconnect() {
    this.socket?.disconnect();
    this.closed = true;
    this.releaseLock?.();
    this.lockAbort?.abort();
    this.channel?.close();
    this.emitter.all.clear();
  }
}
