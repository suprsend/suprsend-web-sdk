import {
  ApiResponse,
  Dictionary,
  ResponseOptions,
  RESPONSE_STATUS,
} from './interface';

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

export function urlB64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
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

  if (options.status === RESPONSE_STATUS.ERROR) {
    response.error = {
      type: options.errorType,
      message: options.errorMessage,
    };
  }
  return response;
}

export function windowSupport() {
  return typeof window !== 'undefined';
}

export function setLocalStorageData(key: string, value: string) {
  if (!windowSupport()) return;

  if (typeof value === 'object') {
    value = JSON.stringify(value);
  }
  localStorage.setItem(key, value);
}

export function getLocalStorageData(key: string) {
  if (!windowSupport()) return;

  const value = localStorage.getItem(key);
  if (!value) return;
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
}

export function removeLocalStorageData(key: string) {
  if (!windowSupport()) return;

  localStorage.removeItem(key);
}
