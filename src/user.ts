import { SuprSend } from './index';
import {
  Dictionary,
  ERROR_TYPE,
  RESPONSE_STATUS,
  ValidatedDataOptions,
} from './interface';
import {
  epochMs,
  getLocalStorageData,
  getResponsePayload,
  isArrayEmpty,
  isObjectEmpty,
  setLocalStorageData,
  uuid,
} from './utils';
import Preferences from './preferences';

const DEVICE_ID_KEY = 'ss_device_id';

export default class User {
  private config: SuprSend;
  public preferences: Preferences;

  constructor(config: SuprSend) {
    this.config = config;
    this.preferences = new Preferences(config);
  }

  private isReservedKey(key: string) {
    return key.startsWith('$') || key?.toLowerCase()?.startsWith('ss_');
  }

  private formatParamsToObj(arg1: string | Dictionary, arg2?: unknown) {
    let data: Dictionary | null = null;

    if (typeof arg1 === 'object' && arg2 === undefined) {
      data = arg1;
    } else if (typeof arg1 === 'string' && arg2 !== undefined) {
      data = { [arg1]: arg2 };
    } else {
      console.warn('[SuprSend]: Invalid input parameters');
    }

    return data;
  }

  private formatParamsToArray(arg1: string | string[]) {
    if (!arg1) return;

    return Array.isArray(arg1) ? arg1 : [arg1];
  }

  private validateObjData(data: Dictionary, options?: ValidatedDataOptions) {
    const validatedData = {};
    const allowReservedKeys = options?.allowReservedKeys || false;
    const valueType = options?.valueType || '';

    for (const key in data) {
      let value = data[key];

      if (key && value === undefined) continue;

      if (!allowReservedKeys && this.isReservedKey(key)) {
        console.warn('[SuprSend]: key cannot start with $ or ss_');
        continue;
      }

      if (valueType === 'number') {
        value = Number(value);
      } else if (valueType === 'boolean') {
        value = !!value;
      }

      validatedData[key] = value;
    }

    return validatedData;
  }

  private validateArrayData(data: string[]) {
    const validatedData: string[] = [];

    for (const item of data) {
      if (item === undefined || item === null) continue;

      if (this.isReservedKey(item)) {
        console.warn('[SuprSend]: key cannot start with $ or ss_');
        continue;
      }

      validatedData.push(String(item));
    }

    return validatedData;
  }

  private async triggerUserEvent(data: Dictionary) {
    return this.config.eventApi({
      distinct_id: this.config.distinctId,
      $insert_id: uuid(),
      $time: epochMs(),
      ...data,
    });
  }

  set(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    const validatedData = this.validateObjData(data);
    if (isObjectEmpty(validatedData)) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    return this.triggerUserEvent({ $set: validatedData });
  }

  setOnce(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    const validatedData = this.validateObjData(data);
    if (isObjectEmpty(validatedData)) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    return this.triggerUserEvent({ $set_once: validatedData });
  }

  increment(arg1: string | Dictionary, arg2?: number) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    const validatedData = this.validateObjData(data, { valueType: 'number' });
    if (isObjectEmpty(validatedData)) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    return this.triggerUserEvent({ $add: validatedData });
  }

  append(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    const validatedData = this.validateObjData(data);
    if (isObjectEmpty(validatedData)) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    return this.triggerUserEvent({ $append: validatedData });
  }

  remove(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    const validatedData = this.validateObjData(data);
    if (isObjectEmpty(validatedData)) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    return this.triggerUserEvent({ $remove: validatedData });
  }

  unset(arg: string | string[]) {
    const data = this.formatParamsToArray(arg);
    if (!data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    const validatedData = this.validateArrayData(data);
    if (isArrayEmpty(validatedData)) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    return this.triggerUserEvent({ $unset: validatedData });
  }

  // this append is only used internally since it allows internal events
  private appendInternal(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    const validatedData = this.validateObjData(data, {
      allowReservedKeys: true,
    });
    if (isObjectEmpty(validatedData)) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    return this.triggerUserEvent({ $append: validatedData });
  }

  // this remove is only used internally since it allows internal events
  private removeInternal(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    const validatedData = this.validateObjData(data, {
      allowReservedKeys: true,
    });
    if (isObjectEmpty(validatedData)) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    return this.triggerUserEvent({ $remove: validatedData });
  }

  private setInternal(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    const validatedData = this.validateObjData(data, {
      allowReservedKeys: true,
    });
    if (isObjectEmpty(validatedData)) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'data provided is empty',
      });
    }

    return this.triggerUserEvent({ $set: validatedData });
  }

  private validateEmail(email: string) {
    const emailRegex = /\S+@\S+\.\S+/;

    return emailRegex.test(email);
  }

  private validateMobile(mobile: string) {
    const mobileRegex = /^\+[1-9]\d{1,14}$/;

    return mobileRegex.test(mobile);
  }

  async addEmail(email: string) {
    const isValid = this.validateEmail(email);

    if (!isValid) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'provided email is invalid',
      });
    }

    return this.appendInternal({ $email: email });
  }

  async removeEmail(email: string) {
    const isValid = this.validateEmail(email);

    if (!isValid) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'provided email is invalid',
      });
    }

    return this.removeInternal({ $email: email });
  }

  async addSms(mobile: string) {
    const isValid = this.validateMobile(mobile);

    if (!isValid) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage:
          'provided mobile number is invalid, must be as per E.164 standard',
      });
    }

    return this.appendInternal({ $sms: mobile });
  }

  async removeSms(mobile: string) {
    const isValid = this.validateMobile(mobile);

    if (!isValid) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage:
          'provided mobile number is invalid, must be as per E.164 standard',
      });
    }

    return this.removeInternal({ $sms: mobile });
  }

  async addWhatsapp(mobile: string) {
    const isValid = this.validateMobile(mobile);

    if (!isValid) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage:
          'provided mobile number is invalid, must be as per E.164 standard',
      });
    }

    return this.appendInternal({ $whatsapp: mobile });
  }

  async removeWhatsapp(mobile: string) {
    const isValid = this.validateMobile(mobile);

    if (!isValid) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage:
          'provided mobile number is invalid, must be as per E.164 standard',
      });
    }

    return this.removeInternal({ $whatsapp: mobile });
  }

  private getDeviceId(): string {
    let deviceId = getLocalStorageData(DEVICE_ID_KEY);

    if (!deviceId) {
      deviceId = uuid();
      setLocalStorageData(DEVICE_ID_KEY, deviceId);
    }

    return deviceId;
  }

  async addWebPush(push: PushSubscription) {
    if (typeof push !== 'object') {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage:
          'provided push subscription is invalid, must be an object',
      });
    }

    const deviceId: string = this.getDeviceId();

    return this.appendInternal({
      $webpush: push,
      $id_provider: 'vapid',
      $device_id: deviceId,
    });
  }

  async removeWebPush(push: PushSubscription) {
    if (typeof push !== 'object') {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage:
          'provided push subscription is invalid, must be an object',
      });
    }

    const deviceId: string = this.getDeviceId();

    return this.removeInternal({
      $webpush: push,
      $id_provider: 'vapid',
      $device_id: deviceId,
    });
  }

  async addSlack(data: Dictionary) {
    if (typeof data !== 'object') {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'provided slack data is invalid, must be an object',
      });
    }

    return this.appendInternal({ $slack: data });
  }

  async removeSlack(data: Dictionary) {
    if (typeof data !== 'object') {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'provided slack data is invalid, must be an object',
      });
    }

    return this.removeInternal({ $slack: data });
  }

  async addMSTeams(data: Dictionary) {
    if (typeof data !== 'object') {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'provided ms_teams data is invalid, must be object',
      });
    }

    return this.appendInternal({ $ms_teams: data });
  }

  async removeMSTeams(data: Dictionary) {
    if (typeof data !== 'object') {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'provided ms_teams data is invalid, must be object',
      });
    }

    return this.removeInternal({ $ms_teams: data });
  }

  async setPreferredLanguage(language: string) {
    if (typeof language !== 'string') {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'provided language is invalid, must be string',
      });
    }

    return this.setInternal({ $preferred_language: language });
  }

  async setTimezone(timezone: string) {
    if (typeof timezone !== 'string') {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'provided timezone is invalid, must be string',
      });
    }

    return this.setInternal({ $timezone: timezone });
  }
}
