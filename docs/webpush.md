# WebPush

> 💡 WebPush notifications only work over HTTPS. Most browsers allow push to work in localhost also for development purposes.

### Pre-Requisites

- Integration of [JavaScript SDK](../README.md)

## Integration Steps

### 1. Configuration

While creating SuprSend instance you have to pass vapidKey (get it in SuprSend Dashboard --> Vendors --> WebPush).

If you want to have custom serviceworker file name instead of `serviceworker.js`(mentioned in step2), you can pass name of it in `swFileName`.

```typescript
new SuprSend(publicApiKey: string, {vapidKey?: string, swFileName?: string})
```

### 2. Add ServiceWorker file

Service worker file is the background worker script which handles push notifications.

Create `serviceworker.js` file such that it should be publicly accessible from `https://<your_domain>/serviceworker.js`. Add below lines of code in that file and replace publicApiKey with key you find in API Keys page in SuprSend Dashboard.

```javascript
importScripts('https://cdn.jsdelivr.net/npm/@suprsend/web-sdk@3.0.3/public/serviceworker.min.js');
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

**Returns:** `Promise<ApiResponse>`

**NOTE:** This method should be called on user action like button click for better UX, don't call this on page load.

## Other available methods

### Check for permission

To check if user has enabled notifications permission use method provided by library

```typescript
suprSendClient.webpush.notificationPermission():
```

This will return a string representing the current permission. The value can be:

**granted:** The user has granted permission for the current origin to display notifications.

**denied:** The user has denied permission for the current origin to display notifications.

**default:** The user's decision is unknown. This will be permission when user first lands on website.
