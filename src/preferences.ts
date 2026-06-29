import SuprSend from './main';
import {
  Dictionary,
  PreferenceData,
  Category,
  PreferenceOptions,
  CategoryChannel,
  ChannelLevelPreferenceOptions,
  ChannelPreference,
  ERROR_TYPE,
  RESPONSE_STATUS,
  IPreferenceConfig,
  UpdateCategoryDigestSchedulePayload,
  UpdateCategoryPropertyPayload,
} from './interface';
import { debounceByType, getResponsePayload } from './utils';

export default class Preferences {
  private config: SuprSend;
  private preferenceData: PreferenceData;
  private preferenceArgs?: IPreferenceConfig;
  private debouncedUpdateCategoryPreferences;
  private debouncedUpdateChannelPreferences;
  private debounceTime = 1000;

  constructor(config: SuprSend) {
    this.config = config;

    this.debouncedUpdateCategoryPreferences = debounceByType(
      this._updateCategoryPreferences.bind(this),
      this.debounceTime
    );
    this.debouncedUpdateChannelPreferences = debounceByType(
      this._updateChannelPreferences.bind(this),
      this.debounceTime
    );
  }

  private validateQueryParams(queryParams: Dictionary = {}) {
    const validatedParams: Record<string, string> = {};
    for (const key in queryParams) {
      if (queryParams[key]) {
        if (typeof queryParams[key] === 'object') {
          validatedParams[key] = JSON.stringify(queryParams[key]);
        } else {
          validatedParams[key] = String(queryParams[key]);
        }
      }
    }
    return validatedParams;
  }

  set data(value) {
    this.preferenceData = value;
  }

  get data() {
    return this.preferenceData;
  }

  getUrl(path: string, qp?: Dictionary) {
    const urlPath = `${this.config.host}/v2/subscriber/${this.config.distinctId}/${path}`;

    const validatedQueryParams = this.validateQueryParams(qp);
    const queryParamsString = new URLSearchParams(
      validatedQueryParams
    ).toString();

    return queryParamsString ? `${urlPath}/?${queryParamsString}` : urlPath;
  }

  /**
   * Used to get user's whole preferences data.
   */
  async getPreferences(args?: IPreferenceConfig) {
    const queryParams = {
      tenant_id: args?.tenantId,
      show_opt_out_channels: args?.showOptOutChannels === false ? false : true,
      tags: args?.tags,
      locale: args?.locale,
    };

    this.preferenceArgs = {
      tenantId: queryParams?.tenant_id,
      showOptOutChannels: queryParams?.show_opt_out_channels,
      tags: queryParams?.tags,
      locale: queryParams?.locale,
    };
    const url = this.getUrl('full_preference', queryParams);

    const response = await this.config.client().request({ type: 'get', url });

    if (!response.error) {
      this.data = response.body;
    }
    return response;
  }

  /**
   * Used to get user's preference of all categories.
   */
  async getCategories(args?: {
    tenantId?: string;
    showOptOutChannels?: boolean;
    tags?: string | Dictionary;
    locale?: string;
    limit?: number;
    offset?: number;
  }) {
    const queryParams = {
      tenant_id: args?.tenantId,
      show_opt_out_channels: args?.showOptOutChannels === false ? false : true,
      limit: args?.limit,
      offset: args?.offset,
      tags: args?.tags,
      locale: args?.locale,
    };
    const url = this.getUrl('category', queryParams);

    const response = await this.config.client().request({ type: 'get', url });
    return response;
  }

  /**
   * Used to get user's preference of specific category.
   */
  async getCategory(
    category: string,
    args?: { tenantId?: string; showOptOutChannels?: boolean; locale?: string }
  ) {
    if (!category) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Category parameter is missing',
      });
    }

    const queryParams = {
      tenant_id: args?.tenantId,
      show_opt_out_channels: args?.showOptOutChannels === false ? false : true,
      locale: args?.locale,
    };
    const url = this.getUrl(`category/${category}`, queryParams);

    const response = await this.config.client().request({ type: 'get', url });
    return response;
  }

  /**
   * Used to get user's all channel level preference.
   */
  async getOverallChannelPreferences(args?: { tenantId?: string }) {
    const queryParams = { tenant_id: args?.tenantId };
    const url = this.getUrl('channel_preference', queryParams);

    const response = await this.config.client().request({ type: 'get', url });
    return response;
  }

  private async _updateCategoryPreferences(
    category: string,
    body: Dictionary,
    subcategory: Category,
    args: Dictionary
  ) {
    const url = this.getUrl(`category/${category}`, args);

    const response = await this.config.client().request({
      type: 'patch',
      url,
      payload: body,
    });

    if (response?.error) {
      this.config.emitter.emit('preferences_error', response);
    } else {
      Object.assign(subcategory, response.body);
      this.config.emitter.emit('preferences_updated', {
        status: RESPONSE_STATUS.SUCCESS,
        statusCode: 200,
        body: this.data as PreferenceData,
      });
    }
    return response;
  }

  private async _updateChannelPreferences(body: Dictionary, args?: Dictionary) {
    const url = this.getUrl('channel_preference', args);

    const response = await this.config.client().request({
      type: 'patch',
      url,
      payload: body,
    });

    if (response?.error) {
      this.config.emitter.emit('preferences_error', response);
    } else {
      await this.getPreferences(this.preferenceArgs);
      this.config.emitter.emit('preferences_updated', {
        status: RESPONSE_STATUS.SUCCESS,
        statusCode: 200,
        body: this.data as PreferenceData,
      });
    }
    return response;
  }

  /**
   * Used to update user's category level preference.
   */
  async updateCategoryPreference(
    category: string,
    preference: PreferenceOptions,
    args?: IPreferenceConfig
  ) {
    if (
      !category ||
      ![PreferenceOptions.OPT_IN, PreferenceOptions.OPT_OUT].includes(
        preference
      )
    ) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: !category
          ? 'Category parameter is missing'
          : 'Preference parameter is invalid',
      });
    }

    if (!this.data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Call getPreferences method before performing action',
      });
    }

    if (!this.data.sections) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: "Sections doesn't exist",
      });
    }

    let categoryData: Category | null = null;
    let dataUpdated = false;

    // optimistic update in local store
    for (const section of this.data.sections) {
      let abort = false;
      if (!section.subcategories) continue;

      for (const subcategory of section.subcategories) {
        if (subcategory.category === category) {
          categoryData = subcategory;
          if (subcategory.is_editable) {
            if (subcategory.preference !== preference) {
              subcategory.preference = preference;
              dataUpdated = true;
              abort = true;
              break;
            } else {
              // console.log(`category is already ${status}ed`);
            }
          } else {
            return getResponsePayload({
              status: RESPONSE_STATUS.ERROR,
              errorType: ERROR_TYPE.VALIDATION_ERROR,
              errorMessage: 'Category preference is not editable',
            });
          }
        }
      }
      if (abort) break;
    }

    if (!categoryData) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Category not found',
      });
    }

    if (!dataUpdated) {
      return getResponsePayload({
        status: RESPONSE_STATUS.SUCCESS,
        body: this.data,
      });
    }

    const optOutChannels: string[] = [];
    categoryData?.channels?.forEach((channel) => {
      if (channel.preference === PreferenceOptions.OPT_OUT) {
        optOutChannels.push(channel.channel);
      }
    });

    let showOptOutChannels = true;
    if (typeof args?.showOptOutChannels === 'boolean') {
      showOptOutChannels = args?.showOptOutChannels;
    } else if (typeof this.preferenceArgs?.showOptOutChannels === 'boolean') {
      showOptOutChannels = this.preferenceArgs.showOptOutChannels;
    }

    const requestPayload = {
      preference: categoryData.preference,
      opt_out_channels:
        showOptOutChannels && preference === PreferenceOptions.OPT_IN
          ? null
          : optOutChannels,
    };

    this.debouncedUpdateCategoryPreferences(
      category,
      category,
      requestPayload,
      categoryData,
      {
        tenant_id: args?.tenantId || this.preferenceArgs?.tenantId,
        show_opt_out_channels: showOptOutChannels,
        tags: args?.tags || this.preferenceArgs?.tags,
        locale: args?.locale || this.preferenceArgs?.locale,
      }
    );

    return getResponsePayload({
      status: RESPONSE_STATUS.SUCCESS,
      body: this.data,
    });
  }

  /**
   * Used to update user's category level channel preference.
   */
  async updateChannelPreferenceInCategory(
    channel: string,
    preference: PreferenceOptions,
    category: string,
    args?: IPreferenceConfig
  ) {
    if (!channel || !category) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: !channel
          ? 'Channel parameter is missing'
          : 'Category parameter is missing',
      });
    }

    if (
      ![PreferenceOptions.OPT_IN, PreferenceOptions.OPT_OUT].includes(
        preference
      )
    ) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Preference parameter is invalid',
      });
    }

    if (!this.data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Call getPreferences method before performing action',
      });
    }

    if (!this.data.sections) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: "Sections doesn't exist",
      });
    }

    let categoryData: Category | null = null;
    let selectedChannelData: CategoryChannel | null = null;
    let dataUpdated = false;

    // optimistic update in local store
    for (const section of this.data.sections) {
      let abort = false;
      if (!section.subcategories) continue;

      for (const subcategory of section.subcategories) {
        if (subcategory.category === category) {
          categoryData = subcategory;
          if (!subcategory.channels) continue;

          for (const channelData of subcategory.channels) {
            if (channelData.channel === channel) {
              selectedChannelData = channelData;
              if (channelData.is_editable) {
                if (channelData.preference !== preference) {
                  channelData.preference = preference;
                  if (preference === PreferenceOptions.OPT_IN) {
                    subcategory.preference = PreferenceOptions.OPT_IN;
                  }
                  dataUpdated = true;
                  abort = true;
                  break;
                } else {
                  //  console.log(`channel is already ${preference}`);
                }
              } else {
                return getResponsePayload({
                  status: RESPONSE_STATUS.ERROR,
                  errorType: ERROR_TYPE.VALIDATION_ERROR,
                  errorMessage: 'Channel preference is not editable',
                });
              }
            }
          }
        }
        if (abort) break;
      }
      if (abort) break;
    }

    if (!categoryData) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Category not found',
      });
    }

    if (!selectedChannelData) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: "Category's channel not found",
      });
    }

    if (!dataUpdated) {
      return getResponsePayload({
        status: RESPONSE_STATUS.SUCCESS,
        body: this.data,
      });
    }

    const optOutChannels: string[] = [];
    categoryData?.channels?.forEach((channel) => {
      if (channel.preference === PreferenceOptions.OPT_OUT) {
        optOutChannels.push(channel.channel);
      }
    });

    let showOptOutChannels = true;
    if (typeof args?.showOptOutChannels === 'boolean') {
      showOptOutChannels = args?.showOptOutChannels;
    } else if (typeof this.preferenceArgs?.showOptOutChannels === 'boolean') {
      showOptOutChannels = this.preferenceArgs.showOptOutChannels;
    }

    const categoryPreference =
      showOptOutChannels &&
      categoryData.preference === PreferenceOptions.OPT_OUT &&
      preference === PreferenceOptions.OPT_IN
        ? PreferenceOptions.OPT_IN
        : categoryData.preference;

    const requestPayload = {
      preference: categoryPreference,
      opt_out_channels: optOutChannels,
    };

    this.debouncedUpdateCategoryPreferences(
      category,
      category,
      requestPayload,
      categoryData,
      {
        tenant_id: args?.tenantId || this.preferenceArgs?.tenantId,
        show_opt_out_channels: showOptOutChannels,
        tags: args?.tags || this.preferenceArgs?.tags,
        locale: args?.locale || this.preferenceArgs?.locale,
      }
    );

    return getResponsePayload({
      status: RESPONSE_STATUS.SUCCESS,
      body: this.data,
    });
  }

  /**
   * Used to update user's category level digest configuration.
   */
  async updateDigestScheduleInCategory(
    category: string,
    digestSchedule: UpdateCategoryDigestSchedulePayload,
    args?: IPreferenceConfig
  ) {
    if (!category) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Category parameter is missing',
      });
    }

    if (!digestSchedule || typeof digestSchedule !== 'object') {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Digest schedule parameter is invalid',
      });
    }

    if (!this.data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Call getPreferences method before performing action',
      });
    }

    if (!this.data.sections) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: "Sections doesn't exist",
      });
    }

    let categoryData: Category | null = null;

    // get category data from local store
    for (const section of this.data.sections) {
      let abort = false;
      if (!section.subcategories) continue;

      for (const subcategory of section.subcategories) {
        if (subcategory.category === category) {
          categoryData = subcategory;
          abort = true;
          break;
        }
      }
      if (abort) break;
    }

    if (!categoryData) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Category not found',
      });
    }

    let showOptOutChannels = true;
    if (typeof args?.showOptOutChannels === 'boolean') {
      showOptOutChannels = args?.showOptOutChannels;
    } else if (typeof this.preferenceArgs?.showOptOutChannels === 'boolean') {
      showOptOutChannels = this.preferenceArgs.showOptOutChannels;
    }

    const requestPayload = {
      digest_schedule: digestSchedule,
      preference: categoryData.preference,
    };

    return this._updateCategoryPreferences(
      category,
      requestPayload,
      categoryData,
      {
        tenant_id: args?.tenantId || this.preferenceArgs?.tenantId,
        show_opt_out_channels: showOptOutChannels,
        tags: args?.tags || this.preferenceArgs?.tags,
        locale: args?.locale || this.preferenceArgs?.locale,
      }
    );
  }

  /**
   * Used to update user's category level condition configuration.
   */
  async updatePropertiesInCategory(
    category: string,
    properties: UpdateCategoryPropertyPayload[],
    args?: IPreferenceConfig
  ) {
    if (!category) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Category parameter is missing',
      });
    }

    if (!properties || !Array.isArray(properties)) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Properties parameter is invalid',
      });
    }

    if (!this.data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Call getPreferences method before performing action',
      });
    }

    if (!this.data.sections) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: "Sections doesn't exist",
      });
    }

    let categoryData: Category | null = null;

    // get category data from local store
    for (const section of this.data.sections) {
      let abort = false;
      if (!section.subcategories) continue;

      for (const subcategory of section.subcategories) {
        if (subcategory.category === category) {
          categoryData = subcategory;
          abort = true;
          break;
        }
      }
      if (abort) break;
    }

    if (!categoryData) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Category not found',
      });
    }

    let showOptOutChannels = true;
    if (typeof args?.showOptOutChannels === 'boolean') {
      showOptOutChannels = args?.showOptOutChannels;
    } else if (typeof this.preferenceArgs?.showOptOutChannels === 'boolean') {
      showOptOutChannels = this.preferenceArgs.showOptOutChannels;
    }

    const requestPayload = {
      properties,
      preference: categoryData.preference,
    };

    return this._updateCategoryPreferences(
      category,
      requestPayload,
      categoryData,
      {
        tenant_id: args?.tenantId || this.preferenceArgs?.tenantId,
        show_opt_out_channels: showOptOutChannels,
        tags: args?.tags || this.preferenceArgs?.tags,
        locale: args?.locale || this.preferenceArgs?.locale,
      }
    );
  }

  /**
   * Used to update user's channel level preference.
   */
  async updateOverallChannelPreference(
    channel: string,
    preference: ChannelLevelPreferenceOptions,
    args?: { tenantId?: string }
  ) {
    if (
      !channel ||
      ![
        ChannelLevelPreferenceOptions.ALL,
        ChannelLevelPreferenceOptions.REQUIRED,
      ].includes(preference)
    ) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: !channel
          ? 'Channel parameter is missing'
          : 'Preference parameter is invalid',
      });
    }

    if (!this.data) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Call getPreferences method before performing action',
      });
    }

    if (!this.data.channel_preferences) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: "Channel preferences doesn't exist",
      });
    }

    let channelData: ChannelPreference | null = null;
    let dataUpdated = false;
    const preferenceRestricted =
      preference === ChannelLevelPreferenceOptions.REQUIRED;

    for (const channelItem of this.data.channel_preferences) {
      if (channelItem.channel === channel) {
        channelData = channelItem;
        if (channelItem.is_restricted !== preferenceRestricted) {
          channelItem.is_restricted = preferenceRestricted;
          dataUpdated = true;
          break;
        }
      }
    }

    if (!channelData) {
      return getResponsePayload({
        status: RESPONSE_STATUS.ERROR,
        errorType: ERROR_TYPE.VALIDATION_ERROR,
        errorMessage: 'Channel data not found',
      });
    }

    if (!dataUpdated) {
      return getResponsePayload({
        status: RESPONSE_STATUS.SUCCESS,
        body: this.data,
      });
    }

    this.debouncedUpdateChannelPreferences(
      channelData.channel,
      { channel_preferences: [channelData] },
      { tenant_id: args?.tenantId || this.preferenceArgs?.tenantId }
    );

    return getResponsePayload({
      status: RESPONSE_STATUS.SUCCESS,
      body: this.data,
    });
  }
}
