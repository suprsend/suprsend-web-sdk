import {
  ApiResponse,
  AppInfo,
  ClientUserAgentConfig,
  Dictionary,
  ResponseOptions,
  RESPONSE_STATUS,
} from './interface';
import { name as SDK_NAME, version as SDK_VERSION } from '../package.json';

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

export function localStorageSupport() {
  if (!windowSupport() || !window?.localStorage) return false;
  return true;
}

export function setLocalStorageData(key: string, value: string) {
  if (!localStorageSupport()) return;

  if (typeof value === 'object') {
    value = JSON.stringify(value);
  }
  localStorage.setItem(key, value);
}

export function getLocalStorageData(key: string) {
  if (!localStorageSupport()) return;
  const value = localStorage.getItem(key);
  if (!value) return;
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
}

export function removeLocalStorageData(key: string) {
  if (!localStorageSupport()) return;

  localStorage.removeItem(key);
}

function getUserAgent(): string {
  return typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
}

export function detectOS(ua: string = getUserAgent()): {
  os: string;
  os_version: string;
} {
  let match: RegExpMatchArray | null;

  if ((match = ua.match(/Windows NT (\d+(?:\.\d+)*)/i))) {
    return { os: 'windows', os_version: match[1] };
  }
  if (
    (match = ua.match(/(?:iPhone|iPad|iPod)[^;]*;\s*CPU[^)]*OS (\d+[_.]\d+(?:[_.]\d+)?)/i))
  ) {
    return { os: 'ios', os_version: match[1].replace(/_/g, '.') };
  }
  if ((match = ua.match(/Android (\d+(?:\.\d+)*)/i))) {
    return { os: 'android', os_version: match[1] };
  }
  if ((match = ua.match(/Mac OS X (\d+[_.]\d+(?:[_.]\d+)?)/i))) {
    return { os: 'mac os', os_version: match[1].replace(/_/g, '.') };
  }
  if (/Linux/i.test(ua)) {
    return { os: 'linux', os_version: '' };
  }
  return { os: '', os_version: '' };
}

export function detectBrowser(ua: string = getUserAgent()): {
  browser: string;
  browser_version: string;
} {
  let match: RegExpMatchArray | null;

  if ((match = ua.match(/Edg(?:e|A|iOS)?\/(\d+(?:\.\d+)*)/i))) {
    return { browser: 'edge', browser_version: match[1] };
  }
  if ((match = ua.match(/OPR\/(\d+(?:\.\d+)*)/i))) {
    return { browser: 'opera', browser_version: match[1] };
  }
  if ((match = ua.match(/Firefox\/(\d+(?:\.\d+)*)/i))) {
    return { browser: 'firefox', browser_version: match[1] };
  }
  if ((match = ua.match(/Chrome\/(\d+(?:\.\d+)*)/i))) {
    return { browser: 'chrome', browser_version: match[1] };
  }
  if ((match = ua.match(/Version\/(\d+(?:\.\d+)*)[^)]*Safari/i))) {
    return { browser: 'safari', browser_version: match[1] };
  }
  if (/Safari/i.test(ua)) {
    return { browser: 'safari', browser_version: '' };
  }
  return { browser: '', browser_version: '' };
}

export function detectEnvironment(ua: string = getUserAgent()): string {
  if (!ua) return '';
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    return 'tablet';
  }
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

export function buildClientUserAgent(
  appInfo?: AppInfo,
  override?: ClientUserAgentConfig
): string {
  const ua = getUserAgent();
  const { os, os_version } = detectOS(ua);
  const { browser, browser_version } = detectBrowser(ua);

  const defaults: ClientUserAgentConfig = {
    sdk: (SDK_NAME || '').toLowerCase(),
    sdk_version: (SDK_VERSION || '').toLowerCase(),
    lang: 'javascript',
    platform: 'browser',
    environment: detectEnvironment(ua),
    os,
    os_version,
    app_info: {
      name: appInfo?.name || '',
      version: appInfo?.version || '',
    },
    browser,
    browser_version,
  };

  if (!override) return JSON.stringify(defaults);

  const merged: ClientUserAgentConfig = { ...defaults };
  for (const key of Object.keys(override) as (keyof ClientUserAgentConfig)[]) {
    const value = override[key];
    if (value === undefined) continue;
    if (key === 'app_info') {
      merged.app_info = { ...defaults.app_info, ...(value as AppInfo) };
    } else {
      (merged as Dictionary)[key] = value;
    }
  }
  return JSON.stringify(merged);
}

export async function sha256Hash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}
