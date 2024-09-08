import { SuprSend } from './index';
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
} from './interface';
import { debounceByType, getResponsePayload } from './utils';

export default class Preferences {
  private config: SuprSend;
  private preferenceData: PreferenceData;
  private preferenceArgs?: { tenantId?: string; showOptOutChannels?: boolean };
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
        validatedParams[key] = String(queryParams[key]);
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

  getUrlPath(path: string, qp?: Dictionary) {
    const urlPath = `v2/subscriber/${this.config.distinctId}/${path}`;

    const validatedQueryParams = this.validateQueryParams(qp);
    const queryParamsString = new URLSearchParams(
      validatedQueryParams
    ).toString();

    return queryParamsString ? `${urlPath}/?${queryParamsString}` : urlPath;
  }

  /**
   * Used to get user's whole preferences data.
   */
  async getPreferences(args?: {
    tenantId?: string;
    showOptOutChannels?: boolean;
  }) {
    const queryParams = {
      tenant_id: args?.tenantId,
      show_opt_out_channels: args?.showOptOutChannels === false ? false : true,
    };

    this.preferenceArgs = {
      tenantId: queryParams?.tenant_id,
      showOptOutChannels: queryParams?.show_opt_out_channels,
    };
    const path = this.getUrlPath('full_preference', queryParams);

    const response = await this.config.client().request({ type: 'get', path });

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
    limit?: number;
    offset?: number;
  }) {
    const queryParams = {
      tenant_id: args?.tenantId,
      show_opt_out_channels: args?.showOptOutChannels === false ? false : true,
      limit: args?.limit,
      offset: args?.offset,
    };
    const path = this.getUrlPath('category', queryParams);

    const response = await this.config.client().request({ type: 'get', path });
    return response;
  }

  /**
   * Used to get user's preference of specific category.
   */
  async getCategory(
    category: string,
    args?: { tenantId?: string; showOptOutChannels?: boolean }
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
    };
    const path = this.getUrlPath(`category/${category}`, queryParams);

    const response = await this.config.client().request({ type: 'get', path });
    return response;
  }

  /**
   * Used to get user's all channel level preference.
   */
  async getOverallChannelPreferences() {
    const path = this.getUrlPath('channel_preference');

    const response = await this.config.client().request({ type: 'get', path });
    return response;
  }

  private async _updateCategoryPreferences(
    category: string,
    body: Dictionary,
    subcategory: Category,
    args: Dictionary
  ) {
    const path = this.getUrlPath(`category/${category}`, args);

    const response = await this.config
      .client()
      .request({ type: 'patch', path, payload: body });

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

  private async _updateChannelPreferences(body: Dictionary) {
    const path = this.getUrlPath('channel_preference');

    const response = await this.config
      .client()
      .request({ type: 'patch', path, payload: body });

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
    args?: { tenantId?: string; showOptOutChannels?: boolean }
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

    const showOptOutChannels =
      args?.showOptOutChannels === false ? false : true;

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
      { tenant_id: args?.tenantId, show_opt_out_channels: showOptOutChannels }
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
    args?: { tenantId?: string; showOptOutChannels?: boolean }
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

    const showOptOutChannels =
      args?.showOptOutChannels === false ? false : true;

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
      { tenant_id: args?.tenantId, show_opt_out_channels: showOptOutChannels }
    );

    return getResponsePayload({
      status: RESPONSE_STATUS.SUCCESS,
      body: this.data,
    });
  }

  /**
   * Used to update user's channel level preference.
   */
  async updateOverallChannelPreference(
    channel: string,
    preference: ChannelLevelPreferenceOptions
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

    this.debouncedUpdateChannelPreferences(channelData.channel, {
      channel_preferences: [channelData],
    });

    return getResponsePayload({
      status: RESPONSE_STATUS.SUCCESS,
      body: this.data,
    });
  }
}
