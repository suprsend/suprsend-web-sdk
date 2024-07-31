import { ApiResponse, Dictionary, ResponseOptions } from './interface';

export function uuid() {
  let dt = new Date().getTime();
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
    /[xy]/g,
    function (c) {
      const r = (dt + Math.random() * 16) % 16 | 0;
      dt = Math.floor(dt / 16);
      return (c == 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }
  );
  return uuid;
}

export function epochMs() {
  return Math.round(Date.now());
}

export function isObjectEmpty(objectName: Dictionary) {
  return Object.keys(objectName).length === 0;
}

export function isArrayEmpty(arrayName: unknown[]) {
  return arrayName?.length <= 0;
}

const browserUseragentMap = {
  Edge: ['Edge'],
  'Opera Mini': ['Opera Mini'],
  'Opera Mobile': ['Opera Mobi'],
  Opera: ['Opera'],
  'Internet Explorer': ['Trident', 'MSIE'],
  Chrome: ['Chrome', 'CriOS'],
  Firefox: ['Firefox'],
  Safari: ['Safari'],
  Mozilla: ['Mozilla'],
};

export function browser() {
  const userAgent = navigator.userAgent;
  for (const browserItem in browserUseragentMap) {
    for (const str of browserUseragentMap[browserItem]) {
      if (userAgent.indexOf(str) >= 0) {
        return browserItem;
      }
    }
  }
  return '';
}

const browserVersionUseragentMap = {
  Edge: [/Edge\/([0-9]+(\.[0-9]+)?)/],
  'Opera Mini': [/Opera Mini\/([0-9]+(\.[0-9]+)?)/],
  'Opera Mobile': [/Version\/([0-9]+(\.[0-9]+)?)/],
  Opera: [/Version\/([0-9]+(\.[0-9]+)?)/],
  'Internet Explorer': ['rv:'],
  Chrome: [/Chrome\/([0-9]+(\.[0-9]+)?)/, /CriOS\/([0-9]+(\.[0-9]+)?)/],
  Firefox: [/rv:([0-9]+(\.[0-9]+)?)/],
  Safari: [/Version\/([0-9]+(\.[0-9]+)?)/],
  Mozilla: [/rv:([0-9]+(\.[0-9]+)?)/],
};

export function browserVersion() {
  const userAgent = navigator.userAgent;
  const browserName = browser();
  const regexItems = browserVersionUseragentMap[browserName];

  if (!regexItems || !browserName) return '';

  for (const regexItem of regexItems) {
    const regex = regexItem;
    if (regex) {
      const result = userAgent.match(regex);
      if (result && result.length > 1) {
        return result[1];
      }
    }
  }
  return '';
}

const osUseragentMap = {
  'Chrome OS': 'CrOS',
  'Mac OS': 'Macintosh',
  Windows: 'Windows',
  iOS: 'like Mac',
  Android: 'Android',
  Linux: 'Linux',
};

export function os() {
  const userAgent = navigator.userAgent;
  for (const i in osUseragentMap) {
    if (userAgent.indexOf(osUseragentMap[i]) >= 0) {
      return i;
    }
  }
  return '';
}

interface IStorageService<T> {
  get<K extends keyof T>(key: K): T[K] | null;
  set<K extends keyof T>(key: K, value: T[K]): void;
  remove<K extends keyof T>(key: K): void;
  clear(): void;
}

export class StorageService<T> implements IStorageService<T> {
  constructor(private readonly storage: Storage) {}

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.storage.setItem(key.toString(), JSON.stringify(value));
  }

  get<K extends keyof T>(key: K): T[K] | null {
    const value = this.storage.getItem(key.toString());

    if (
      value === null ||
      value === 'null' ||
      value === undefined ||
      value === 'undefined'
    ) {
      return null;
    }

    return JSON.parse(value);
  }

  remove<K extends keyof T>(key: K): void {
    this.storage.removeItem(key.toString());
  }

  clear(): void {
    this.storage.clear();
  }
}

export function urlB64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function debounce<T extends unknown[], U>(
  callback: (...args: T) => PromiseLike<U> | U,
  wait: number
) {
  let timer: ReturnType<typeof setTimeout>;

  return (...args: T): Promise<U> => {
    clearTimeout(timer);
    return new Promise((resolve) => {
      timer = setTimeout(() => resolve(callback(...args)), wait);
    });
  };
}

// https://gist.github.com/nzvtrk/1a444cdf6a86a5a6e6d6a34f0db19065
export function debounceByType(func, wait) {
  const memory = {};

  return (...args) => {
    const [searchType] = args;
    const payload = args.slice(1);

    if (typeof memory[searchType] === 'function') {
      return memory[searchType](...payload);
    }

    memory[searchType] = debounce(func, wait);
    return memory[searchType](...payload);
  };
}

export function getResponsePayload(options: ResponseOptions) {
  const response: ApiResponse = { status: options.status };

  if (options.statusCode) {
    response.statusCode = options.statusCode;
  }

  if (options.body) {
    response.body = options.body;
  }

  if (options.status === 'error') {
    response.error = {
      type: options.errorType,
      message: options.errorMessage,
    };
  }
  return response;
}
