# SuprSend Javascript Web SDK

This is the client JavaScript SDK used to integrate SuprSend features like Webpush, Preferences in JavaScript websites like React, Next.js, Angular, Vue.js etc.

> 📘 **Upgrading major version of SDK**
>
> We have changed the web SDK authentication from workspace key-secret to public key and JWT based authentication. This is done to improve security in frontend applications.
>
> - Refer the v1 SDK [documentation](https://github.com/suprsend/suprsend-browser-sdk/tree/main/docs)
> - For migrating to v2, follow this [guide](docs/migration-guide.md)

[NPM Link](https://www.npmjs.com/package/@suprsend/web-sdk) | [GitHub Link](https://github.com/suprsend/suprsend-web-sdk)

## Documentation

- [WebPush](docs/webpush.md)
- [Events and User methods](docs/events-and-user-methods.md)
- [Preferences](docs/preferences.md)
- [InApp Feed](docs/inapp-feed.md)
- [Migration guide](docs/migration-guide.md)

Checkout detailed [documentation](https://docs.suprsend.com/docs/integrate-javascript-sdk) for this library. Refer type definitions for this library [here](https://github.com/suprsend/suprsend-web-sdk/blob/main/src/interface.ts).

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
import { SuprSend } from '@suprsend/web-sdk';

export const suprSendClient = new SuprSend(publicApiKey: string);
```

| Params         | Description                                                                                                                    |
| :------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| publicApiKey\* | This is public Key used to authenticate API calls to SuprSend. Get it in SuprSend dashboard **ApiKeys -> Public Keys** section |

### 2. Authenticate User

Authenticate user so that all the actions performed after authenticating will be w.r.t that user. This is mandatory step and need to be called before using any other method. This is usually performed after successful login and on reload of page to re-authenticate user.

```typescript
const authResponse = await suprSendClient.identify(
  distinctId: any,
  userToken?: string, // only needed in production environments for security
  {
    tenantId?: string, // only needed in multi-tenant workspaces
    refreshUserToken: (oldUserToken: string, tokenPayload: Dictionary) => Promise<string>
  }
);
```

| Properties       | Description                                                                                                                                                                                                                                                             |
| :--------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| distinctId\*     | Unique identifier to identify a user across platform.                                                                                                                                                                                                                   |
| userToken        | Mandatory when enhanced security mode is on. This is ES256 JWT token generated in your server-side. Refer [docs](https://docs.suprsend.com/docs/client-authentication#enhanced-security-mode-with-signed-user-token) to create userToken.                               |
| tenantId         | Needed only when your workspace has multiple tenants. Scopes the identified user's activity to that tenant, and is inherited by events, preferences and in-app feed. Its value must match `scope.tenant_id` in the `userToken` payload, else it raises a scoping error. |
| refreshUserToken | This function is called by SDK internally to get new userToken when existing token is expired or about to expire, before making any api call. The returned string is used as the new userToken.                                                                         |

**Returns:** `Promise<ApiResponse>`

#### 2.1 Check if user is authenticated

This method will check if user is authenticated i.e. `distinctId` is attached to SuprSend instance. To check for userToken also pass checkUserToken flag true.

```typescript
suprSendClient.isIdentified(checkUserToken?: boolean): boolean
```

### 3. Reset user

This will remove user data from SuprSend instance. This is usually called on logout action.

```typescript
await suprSendClient.reset();
```

**Returns:** `Promise<ApiResponse>`

## Change active tenant

Once a tenant is set in `identify`, all SDK calls (events, preferences, in-app feed) are scoped to the active tenant. Use this method to switch the active tenant of an identified user. This is meant for users whose `userToken` scopes multiple tenants (`scope.tenant_id` as an array) — identify once and switch between tenants without resetting the session.

```typescript
const response = await suprSendClient.changeTenant(tenantId: string, options?: { pushTokenAction?: 'none' | 'copy' | 'move' });
```

| Properties      | Description                                                                                                                                                                                                                               |
| :-------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tenantId\*      | Tenant to switch to. Used by subsequent events and newly initialized preferences and feed requests. Must be one of the tenants scoped in `userToken`.                                                                                     |
| pushTokenAction | What to do with the existing webpush subscription. `none` (default) leaves it attached to the current tenant. `copy` attaches it to the new tenant as well. `move` detaches it from the current tenant and attaches it to the new tenant. |

**Returns:** `Promise<ApiResponse>`

> **Note**
>
> Already running feed instances and previously fetched preferences keep the tenant they were initialized with when `changeTenant` is called. Re-initialize the feed and call `getPreferences` again to load data for the new tenant.
>
> With `copy` or `move`, if the device has no webpush subscription the tenant switch still succeeds. If attaching the subscription to the new tenant fails, the active tenant is restored (and re-attached for `move`) and the error is returned.

## Response structure

Almost all the methods in this SDK return response type `Promise<ApiResponse>`

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
