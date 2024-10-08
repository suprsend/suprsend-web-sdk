# SuprSend Javascript Web SDK

This library is used to integrate SuprSend features like WebPush, Preferences in to your javascript client environments.

> 📘 This is v2 version of @suprsend/web-sdk
>
> We have changed the web SDK authentication from workspace key-secret to public key and JWT based authentication. This is done to improve security in frontend applications.
>
> - Refer the v1 SDK [documentation](https://docs.suprsend.com/v1.2.1/docs/javascript-sdk)
> - For migrating to v2, follow this [guide](https://docs.suprsend.com/docs/js-migration-from-v1)

## Documentation

Checkout detailed [documentation](https://docs.suprsend.com/docs/javascript-sdk) for this library.

## Installation

```bash
# using npm
npm install @suprsend/web-sdk@latest

# using yarn
yarn add @suprsend/web-sdk@latest
```

## Integration

### 1. Create Client

Create suprSendClient instance and use same instance to access all the methods of SuprSend library.

```typescript
import SuprSend from '@suprsend/web-sdk';

export const suprSendClient = new SuprSend(publicApiKey: string);
```

| Params         | Description                                                                                                                    |
| :------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| publicApiKey\* | This is public Key used to authenticate api calls to SuprSend. Get it in SuprSend dashboard **ApiKeys -> Public Keys** section |

### 2. Authenticate user

Authenticate user so that all the actions performed after authenticating will be w.r.t that user. This is mandatory step and need to be called before using any other method. This is usually performed after successful login and on reload of page to re-authenticate user (can be changed based on your requirement).

```typescript
const authResponse = await suprSendClient.identify(
  distinctId: any,
  userToken?: string, // only needed in production environments for security
  { refreshUserToken: (oldUserToken: string, tokenPayload: Dictionary) => Promise<string> }
);
```

| Properties       | Description                                                                                                                                                                                                                               |
| :--------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| distinctId\*     | Unique identifier to identify a user across platform.                                                                                                                                                                                     |
| userToken        | Mandatory when enhanced security mode is on. This is ES256 JWT token generated in your server-side. Refer [docs](https://docs.suprsend.com/docs/client-authentication#enhanced-security-mode-with-signed-user-token) to create userToken. |
| refreshUserToken | This function is called by SDK internally to get new userToken before existing token is expired. The returned string is used as the new userToken.                                                                                        |

### 3. Reset user

This will remove user data from SuprSend instance similar to logout action.

```typescript
await suprSendClient.reset();
```

## User Methods

Use these methods to manipulate user properties and notification channel data of user

```typescript
await suprSendClient.user.addEmail(email: string)
await suprSendClient.user.removeEmail(email: string)

// mobile should be as per E.164 standard
await suprSendClient.user.addSms(mobile: string)
await suprSendClient.user.removeSms(mobile: string)

// mobile should be as per E.164 standard
await suprSendClient.user.addWhatsapp(mobile: string)
await suprSendClient.user.removeWhatsapp(mobile: string)

// set custom user properties
await suprSendClient.user.set(arg1: string | Dictionary, arg2?: unknown)

// set properties only once that cannot be overridden
await suprSendClient.user.setOnce(arg1: string | Dictionary, arg2?: unknown)

// increase or decrease property by given value
await suprSendClient.user.increment(arg1: string | Dictionary, arg2?: number)

// Add items to list if user property is list
await suprSend.user.append(arg1: string | Dictionary, arg2?: unknown)

// Remove items from list if user property is list.
await suprSend.user.remove(arg1: string | Dictionary, arg2?: unknown)

// remove user property. If channel needs to be removed pass $email, $sms, $whatsapp
await suprSend.user.unset(arg: string | string[])

//2-letter language code in "ISO 639-1 Alpha-2" format e.g. en (for English)
await suprSendClient.user.setPreferredLanguage(language: string)

// set timezone property at user level in IANA timezone format
await suprSendClient.user.setTimezone(timezone: string)
```

## Triggering Events

```typescript
const response = await suprSendClient.track(event: string, properties?: Dictionary)
```

## Webpush Setup

### 1. Configuration

While creating SuprSend instance you have to pass vapidKey (get it in SuprSend Dashboard --> Vendors --> WebPush).

If you want to customise serviceworker file name instead of `serviceworker.js`, you can pass name of it in `swFileName`.

```typescript
new SuprSend(publicApiKey: string, {vapidKey?: string, swFileName?: string})
```

### 2. Add ServiceWorker file

Service worker file is the background worker script which handles push notifications.

Create `serviceworker.js` file such that it should be publicly accessible from `https://<your_domain>/serviceworker.js`. Then include below lines of code and replace publicApiKey with key you find in API Keys page in SuprSend Dashboard.

```javascript
importScripts(
  'https://cdn.jsdelivr.net/npm/@suprsend/web-sdk@2.0.0/public/serviceworker.min.js'
);

initSuprSend(publicApiKey);
```

### 3. Register Push

Call `registerPush` in your code, which will perform following tasks:

- Ask for notification permission.
- Register push service and generate webpush token.
- Send webpush token to SuprSend.

```typescript
const response = await suprSendClient.webpush.registerPush();
```

## Preferences

```typescript
// get full user preferences data
const preferencesResp = await suprSendClient.user.preferences.getPreferences(args?: {tenantId?: string});

// update category level preference
const updatedPreferencesResp = await suprSendClient.user.preferences.updateCategoryPreference(category: string, preference: 'opt_in'|'opt_out', args?: { tenantId?: string });

// update category level channel preference
const updatedPreferencesResp = await suprSendClient.user.preferences.updateChannelPreferenceInCategory(channel: string, preference: 'opt_in'|'opt_out', category: string, args?: { tenantId?: string });

// update overall channel level preference
const updatedPreferencesResp = await suprSendClient.user.preferences.updateOverallChannelPreference(channel: string, preference: 'all'|'required');
```

All preferences update api's are optimistic updates. Actual api call will happen in background with 1 second debounce. Since its a background task SDK also provides event listener to get updated preference data based on api call status.

```typescript
// listen for update in preferences data and update your UI accordingly in callback
suprSendClient.emitter.on('preferences_updated', (preferenceDataResp) => void);

// listen for errors and show error state like toast etc
suprSendClient.emitter.on('preferences_error', (errorResp) => void);
```

## Response Structure

Almost all methods of this library return `Promise<ApiResponse>`

```typescript
interface ApiResponse {
  status: 'success' | 'error';
  statusCode?: number;
  error?: { type?: string; message?: string };
  body?: any;
}

// success response
{
  status: "success",
  body?: any,
  statusCode?: number
}

// error response
{
  status: "error",
  error: {
    type: string,
    message: string
  }
}
```
