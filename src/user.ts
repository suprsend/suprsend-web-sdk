import { SuprSend } from './index';
import { Dictionary } from './interface';
import { epochMs, isArrayEmpty, isObjectEmpty, uuid } from './utils';

interface ValidatedDataOptions {
  allowReservedKeys?: boolean;
  valueType?: string;
}

export default class User {
  private config: SuprSend;

  constructor(config: SuprSend) {
    this.config = config;
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
      console.log('Invalid input parameters');
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
        console.log('SuprSend: key cannot start with $ or ss_');
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
        console.log('SuprSend: key cannot start with $ or ss_');
        continue;
      }

      validatedData.push(String(item));
    }

    return validatedData;
  }

  private async triggerUserEvent(data: Dictionary) {
    return this.config.evenApi({
      distinct_id: this.config.distinctId,
      $insert_id: uuid(),
      $time: epochMs(),
      ...data,
    });
  }

  set(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) return;

    const validatedData = this.validateObjData(data);
    if (isObjectEmpty(validatedData)) return;

    return this.triggerUserEvent({ $set: validatedData });
  }

  setOnce(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) return;

    const validatedData = this.validateObjData(data);
    if (isObjectEmpty(validatedData)) return;

    return this.triggerUserEvent({ $set_once: validatedData });
  }

  increment(arg1: string | Dictionary, arg2?: number) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) return;

    const validatedData = this.validateObjData(data, { valueType: 'number' });
    if (isObjectEmpty(validatedData)) return;

    return this.triggerUserEvent({ $add: validatedData });
  }

  append(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) return;

    const validatedData = this.validateObjData(data);
    if (isObjectEmpty(validatedData)) return;

    return this.triggerUserEvent({ $append: validatedData });
  }

  remove(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) return;

    const validatedData = this.validateObjData(data);
    if (isObjectEmpty(validatedData)) return;

    return this.triggerUserEvent({ $remove: validatedData });
  }

  unset(arg: string | string[]) {
    const data = this.formatParamsToArray(arg);
    if (!data) return;

    const validatedData = this.validateArrayData(data);
    if (isArrayEmpty(validatedData)) return;

    return this.triggerUserEvent({ $unset: validatedData });
  }

  // this append is only used internally since it allows internal events
  private appendInternal(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) return;

    const validatedData = this.validateObjData(data, {
      allowReservedKeys: true,
    });
    if (isObjectEmpty(validatedData)) return;

    return this.triggerUserEvent({ $append: validatedData });
  }

  // this remove is only used internally since it allows internal events
  private removeInternal(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) return;

    const validatedData = this.validateObjData(data, {
      allowReservedKeys: true,
    });
    if (isObjectEmpty(validatedData)) return;

    return this.triggerUserEvent({ $remove: validatedData });
  }

  private setInternal(arg1: string | Dictionary, arg2?: unknown) {
    const data = this.formatParamsToObj(arg1, arg2);
    if (!data) return;

    const validatedData = this.validateObjData(data, {
      allowReservedKeys: true,
    });
    if (isObjectEmpty(validatedData)) return;

    return this.triggerUserEvent({ $set: validatedData });
  }

  private validateEmail(email: string) {
    const emailRegex = /\S+@\S+\.\S+/;

    if (emailRegex.test(email)) {
      return email;
    } else {
      console.log('SuprSend: email is invalid');
    }
  }

  private validateMobile(mobile: string) {
    const mobileRegex = /^\+[1-9]\d{1,14}$/;

    if (mobileRegex.test(mobile)) {
      return mobile;
    } else {
      console.log('SuprSend: mobile number is invalid');
    }
  }

  async addEmail(email: string) {
    const validatedEmail = this.validateEmail(email);
    if (!validatedEmail) return;

    return this.appendInternal({ $email: validatedEmail });
  }

  async removeEmail(email: string) {
    const validatedEmail = this.validateEmail(email);
    if (!validatedEmail) return;

    return this.removeInternal({ $email: validatedEmail });
  }

  async addSms(mobile: string) {
    const validatedMobile = this.validateMobile(mobile);
    if (!validatedMobile) return;

    return this.appendInternal({ $sms: validatedMobile });
  }

  async removeSms(mobile: string) {
    const validatedMobile = this.validateMobile(mobile);
    if (!validatedMobile) return;

    return this.removeInternal({ $sms: validatedMobile });
  }

  async addWhatsapp(mobile: string) {
    const validatedMobile = this.validateMobile(mobile);
    if (!validatedMobile) return;

    return this.appendInternal({ $whatsapp: validatedMobile });
  }

  async removeWhatsapp(mobile: string) {
    const validatedMobile = this.validateMobile(mobile);
    if (!validatedMobile) return;

    return this.removeInternal({ $whatsapp: validatedMobile });
  }

  async addWebPush(push: PushSubscription) {
    if (typeof push !== 'object') {
      console.log('SuprSend: push must be object');
      return;
    }

    const deviceId = this.config.deviceId;

    return this.appendInternal({
      $webpush: push,
      $pushvendor: 'vapid',
      $device_id: deviceId,
    });
  }

  async removeWebPush(push: PushSubscription) {
    if (typeof push !== 'object') {
      console.log('SuprSend: push must be object');
      return;
    }

    const deviceId = this.config.deviceId;

    return this.removeInternal({
      $webpush: push,
      $pushvendor: 'vapid',
      $device_id: deviceId,
    });
  }

  async addSlack(data: Dictionary) {
    if (typeof data !== 'object') {
      console.log('SuprSend: slack data must be object');
      return;
    }

    return this.appendInternal({ $slack: data });
  }

  async removeSlack(data: Dictionary) {
    if (typeof data !== 'object') {
      console.log('SuprSend: slack data must be object');
      return;
    }

    return this.removeInternal({ $slack: data });
  }

  async addMSTeams(data: Dictionary) {
    if (typeof data !== 'object') {
      console.log('SuprSend: ms_teams data must be object');
      return;
    }

    return this.appendInternal({ $ms_teams: data });
  }

  async removeMSTeams(data: Dictionary) {
    if (typeof data !== 'object') {
      console.log('SuprSend: ms_teams data must be object');
      return;
    }

    return this.removeInternal({ $ms_teams: data });
  }

  async setPreferredLanguage(language: string) {
    if (typeof language !== 'string') {
      console.log('SuprSend: language must be string');
      return;
    }

    return this.setInternal({ $preferred_language: language });
  }

  async setTimezone(timezone: string) {
    if (typeof timezone !== 'string') {
      console.log('SuprSend: timezone must be string');
      return;
    }

    return this.setInternal({ $timezone: timezone });
  }
}
