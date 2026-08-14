# InApp Feed

**NOTE:** Refer type definitions for this guide [here](https://github.com/suprsend/suprsend-web-sdk/blob/main/src/interface.ts).

## Initialise feed client

Using SuprSend client instance create Feed client instance.

```typescript
const feedClient: Feed = suprSendClient.feeds.initialize(options?: IFeedOptions);

interface IFeedOptions {
  tenantId?: string;
  pageSize?: number;
  stores?: IStore[] | null;
  host?: { socketHost?: string; apiHost?: string };
}
```

`tenantId` defaults to the active tenant set in [identify](../README.md#2-authenticate-user) or [changeTenant](../README.md#change-active-tenant), else the `default` tenant. Passing it here overrides the active tenant for that feed instance. Already running feed instances keep the tenant they were initialized with when `changeTenant` is called — re-initialize the feed to reflect the new tenant.

If you are passing `tenant_id` in feed, make sure to pass scope key while creating [userToken](https://docs.suprsend.com/docs/client-authentication#2-creating-signed-user-jwt-token) else error will be thrown due to scope mismatching.

## Feed client

### Get feed data

This returns notification store which contains list of notifications and other meta data like page information etc. You can call this anytime to get updated store data.

```typescript
const feedData: IFeedData = feedClient.data;
```

### Initialise socket for realtime update

```typescript
feedClient.initializeSocketConnection();
```

### Fetching notification data

This method will get first page of notifications from SuprSend server and set data in notification store.

```typescript
feedClient.fetch();
```

### Fetch more notifications

This method will get next page of notifications from SuprSend server and set data in notification store.

```typescript
feedClient.fetchNextPage();
```

### Listening for updates to store

Whenever there is update in notification store (ex: on new notification or existing notification state updated) this event is fired by library. You can listen to this event and update your local state so that UI of you application is refreshed.

```typescript
feedClient.emitter.on('feed.store_update', (updatedStoreData: IFeedData) => {
  // update your local state to refresh UI
});
```

### Listening for new notification

In case you want to show toast notification on receiving new notification you can use this listener.

```typescript
feedClient.emitter.on(
  'feed.new_notification',
  (notificationData: IRemoteNotification) => {
    // your logic to trigger toast with new notification data
  }
);
```

### Removing feed

This will remove feed client data and abort socket connection. Additionally calling `suprSendClient.reset` method during logout will also remove all feedClient instances attached SuprSend client instance.

```typescript
feedClient.remove();
```

### Other methods

```typescript
// If stores are used, this method will change active store
feedClient.changeActiveStore(storeId: string)

// Used to reset badge count which is shown on bell icon. This count is latest notifications that user received from the last he opened inbox popup.
// call this on click of bell icon
feedClient.resetBadgeCount()

// mark notification as seen
await feedClient.markAsSeen(notificationId: string)

// mark notification as read
await feedClient.markAsRead(notificationId: string)

// mark notification as unread
await feedClient.markAsUnread(notificationId: string)

// mark notification as archived
await feedClient.markAsArchived(notificationId: string)

// mark notification as interacted
await feedClient.markAsInteracted(notificationId: string)

// bulk mark all notifications as read
await feedClient.markAllAsRead()

// bulk mark given notification id's as seen
await feedClient.markBulkAsSeen(notificationIds: string[])
```

## Feed Notification Data Structure

```json
{
  "tenant_id": "default",
  "is_expiry_visible": false,
  "seen_on": 1754346745613,
  "read_on": 1754346745613,
  "is_pinned": false,
  "archived": false,
  "created_on": 1753966489304,
  "n_category": "transactional",
  "interacted_on": 1754346745613,
  "n_id": "01K1G8SBGS4A1QG2CGYSVXQ517",
  "message": {
    "schema": "1.0",
    "header": "Your invoice for {{event.billing_month}} is ready",
    "text": "An invoice of **{{event.amount}}** has been generated for your workspace {{event.workspace_name}}.",
    "subtext": {
      "text": "View full billing history",
      "action_url": "https://app.suprsend.com/billing/history"
    },
    "avatar": {
      "avatar_url": "https://cdn-icons-png.flaticon.com/512/3144/3144456.png",
      "action_url": "https://app.suprsend.com/settings"
    },
    "url": "https://app.suprsend.com/billing/{{event.invoice_id}}",
    "extra_data": "{\n  \"workspace\": \"{{event.workspace_name}}\"\n}",
    "tags": ["billing", "finance"],
    "expiry": {
      "format": "absolute",
      "expiry_type": "fixed",
      "is_expiry_visible": true,
      "value": "2025-09-30T23:59:59Z"
    },
    "is_pinned": true,
    "is_expiry_enabled": true,
    "actions": [
      {
        "url": "https://app.suprsend.com/billing/{{event.invoice_id}}",
        "name": "View Invoice"
      },
      {
        "url": "https://app.suprsend.com/billing/pay/{{event.invoice_id}}",
        "name": "Pay Now"
      }
    ]
  }
}
```

<br>

| Field                               | Type    | Description                                                                                                                                                                                                                                                 |
| ----------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `n_id`                              | string  | Unique notification ID for a message.                                                                                                                                                                                                                       |
| `n_category`                        | string  | [Category of the notification](https://docs.suprsend.com/docs/notification-category). Used to fetch and apply category-level preferences (for example, `transactional`, `marketing`). You can also use categories to group notifications in different tabs. |
| `created_on`                        | number  | Timestamp (epoch ms) when the notification reached the inbox.                                                                                                                                                                                               |
| `seen_on`                           | number  | Timestamp (epoch ms) when the notification was first seen.                                                                                                                                                                                                  |
| `read_on`                           | number  | Timestamp (epoch ms) when the notification was marked as read using the `markAsRead` method.                                                                                                                                                                |
| `interacted_on`                     | number  | Timestamp (epoch ms) when the user clicked or interacted with the notification.                                                                                                                                                                             |
| [`message`](#message-object-fields) | object  | Payload containing the actual notification content and metadata.                                                                                                                                                                                            |
| `tenant_id`                         | string  | [Tenant identifier](https://docs.suprsend.com/docs/tenants). Used to identify the tenant in a multi-tenant setup.                                                                                                                                           |
| `is_pinned`                         | boolean | Whether the notification is pinned in the inbox. Pinned notifications remain fixed at the top of the inbox feed. Commonly used for critical messages that should not scroll down as new notifications arrive.                                               |
| `archived`                          | boolean | Whether the notification has been archived by the user. Archived notifications are hidden from the inbox feed by default unless you explicitly pass `is_archived = false` in the [store config](https://docs.suprsend.com/docs/multi-tabs).                 |
| `is_expiry_visible`                 | boolean | Whether the notification's expiry is visible to the user. Expiry details are found inside the `message` object. Useful when you want notifications to auto-delete after a certain time.                                                                     |

#### **`message` Object Fields**

| Field               | Type    | Description                                                                                                                                                                                                                                                             |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`            | string  | Schema version for the message format.                                                                                                                                                                                                                                  |
| `header`            | string  | Main title/header of the notification.                                                                                                                                                                                                                                  |
| `text`              | string  | Body text of the notification; supports Markdown and HTML content. Default format is markdown.                                                                                                                                                                          |
| `subtext`           | object  | Secondary text with optional `action_url`. Is visible below the main text. Generally used to show additional information or footer text.                                                                                                                                |
| `avatar`            | object  | Avatar image shown with the notification, generally used to show sender's profile picture; can include an action link.                                                                                                                                                  |
| `url`               | string  | URL where user will be redirected when they click the notification.                                                                                                                                                                                                     |
| `extra_data`        | string  | JSON string for passing additional data that can be used to design custom notification card UI.                                                                                                                                                                         |
| `tags`              | array   | List of tags to classify the notification (for example, `feature_launch`, `mentions`). Generally used to filter and organize notifications inside [multiple tabs](https://docs.suprsend.com/docs/multi-tabs).                                                           |
| `is_expiry_enabled` | boolean | Whether expiry handling is enabled for this notification. Expiry is set for notifications that are supposed to auto delete after a certain time (for example, upcoming maintenances, events, etc.). Used to send notifications like upcoming maintenances, events, etc. |
| `expiry`            | object  | Expiry configuration (format, type, visibility, value) set when `is_expiry_enabled` is true.                                                                                                                                                                            |
| `is_pinned`         | boolean | Whether this message should pin at top of the notification feed. Generally used to send critical notifications to the user that you don't want to go down when new notifications are added.                                                                             |
| `actions`           | array   | List of call-to-action buttons (each with `url` and `name`).                                                                                                                                                                                                            |

You can understand more about usage and details of message fields in [template documentation](https://docs.suprsend.com/docs/in-app-inbox-template).

## Example

For understanding purpose we have added current simple example in react. You could refer this headless example and design the feed in your Angular or Vue.js etc. If you want to implement in react please refer [@suprsend/react](https://github.com/suprsend/suprsend-react-sdk#suprsend-react-sdk)

```jsx
import { SuprSend } from '@suprsend/web-sdk';
import { useEffect, useState } from 'react';

export default function Example() {
  const [feedData, setFeedData] = useState();
  const [feedInstance, setFeedInstance] = useState();

  const initializeFeed = async (suprSendClient) => {
    await suprSendClient.identify('YOUR_DISTINCT_ID'); // authenticating user

    const feedClient = suprSendClient.feeds.initialize(); // creating feed instance using suprsend client instance
    setFeedInstance(feedClient); // storing it in state so that feed client methods like markRead can be accessed outside
    const initialFeedData = feedClient?.data; // get initial store data from feed instance
    setFeedData(initialFeedData); // storing that data in react state so that UI is rendered accordingly

    feedClient?.emitter.on('feed.store_update', (updatedStoreData) => {
      setFeedData(updatedStoreData); // register listener to get updated store data and store it in local react state so that UI is updated w.r.t new state
    });

    feedClient.initializeSocketConnection(); // register for socketio connection for realtime updated in feed data
    feedClient.fetch(); // fetch existing notifications. Once API call is success you get first page notifications in feed.store_update listener and react state update happens which cause UI to renrender.
  };

  useEffect(() => {
    const suprSendClient = new SuprSend('YOUR_PUBLIC_API_KEY'); // creating suprsend client instance

    initializeFeed(suprSendClient);

    return () => suprSendClient.reset(); // up on unmounting remove user so that inbox data will also be cleared
  }, []);

  if (!feedData) return null;
  if (feedData.apiStatus === 'LOADING') return <p>Loading Data</p>;
  if (feedData.apiStatus === 'SUCCESS' && !feedData?.notifications?.length) {
    return <p>No Notifications</p>;
  }
  if (feedData.notifications) {
    return (
      <div>
        <div>
          {feedData.notifications.map((notification) => {
            return (
              <div
                key={notification.n_id}
                onClick={() => {
                  feedInstance.markAsRead(notification.n_id);
                }}
              >
                {notification.n_id}
              </div>
            );
          })}
        </div>
        {feedData.apiStatus === 'FETCHING_MORE' ? (
          <p>Loading More</p>
        ) : (
          <div>
            {feedData.pageInfo.hasMore && (
              <button
                onClick={() => {
                  feedInstance.fetchNextPage();
                }}
              >
                Next
              </button>
            )}
          </div>
        )}
      </div>
    );
  }
  return null;
}
```
