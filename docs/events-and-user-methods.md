# Events and User methods

## Trigger Events

You can trigger events from client to SuprSend using `track` method. This can be used to trigger [event-based workflows](https://docs.suprsend.com/docs/trigger-workflow#event-based-trigger).

```typescript
const resp = await suprSendClient.track(event: string, properties?: Dictionary, options?: {tenantId?: string})
```

```typescript
const resp = await suprSendClient.track("test", {name:'john doe'})

// attribute a single event to a tenant in multi-tenant workspaces
const resp = await suprSendClient.track("test", {name:'john doe'}, {tenantId: 'tenant-1'})
```

| Properties | Description                                                                                                                                                                                                                                                                                                                        |
| :--------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| event\*    | Name of the event.                                                                                                                                                                                                                                                                                                                 |
| properties | Properties of the event.                                                                                                                                                                                                                                                                                                           |
| tenantId   | Needed only when your workspace has multiple tenants. Attributes this single event to that tenant. Defaults to the active tenant set in [identify](../README.md#2-authenticate-user) or [changeTenant](../README.md#change-active-tenant). Passing it here doesn't change the active tenant of the session. |

If you are passing `tenantId` in track method, make sure it matches `scope.tenant_id` passed while creating [userToken](https://docs.suprsend.com/docs/client-authentication#2-creating-signed-user-jwt-token) else error will be thrown due to scope mismatching.

**Returns:** `Promise<ApiResponse>`

## Update user profile

**Returns:** `Promise<ApiResponse>`

### Update user channels

Set user channel related information using following methods. Its recommended to use SuprSend's Backend SDK's to set user channels instead of Client SDK's.

```typescript
await suprSendClient.user.addEmail(email: string)
await suprSendClient.user.removeEmail(email: string)

// mobile should be as per E.164 standard: https://www.twilio.com/docs/glossary/what-e164
await suprSendClient.user.addSms(mobile: string)
await suprSendClient.user.removeSms(mobile: string)

// mobile should be as per E.164 standard
await suprSendClient.user.addWhatsapp(mobile: string)
await suprSendClient.user.removeWhatsapp(mobile: string)
```

### Update user properties

This is the list of available user update methods:

#### Set Timezone

This method will set users timezone. Timezone value should be in [IANA timezone format](https://timeapi.io/documentation/iana-timezones).

```typescript
await suprSendClient.user.setTimezone(timezone: string)
```

```typescript
await suprSendClient.user.setTimezone("America/Bogota")
```

#### Set Language

This method will set users preferred language. Language value should be in [ISO 639-1 Alpha-2 format](https://gist.github.com/jrnk/8eb57b065ea0b098d571).

```typescript
await suprSendClient.user.setPreferredLanguage(language: string)
```

```typescript
await suprSendClient.user.setPreferredLanguage("en")
```

#### Set

Set is used to set the custom user property or properties. If already property is already present value will be replaced.

```typescript
await suprSendClient.user.set(arg1: string | Dictionary, arg2?: unknown)
```

```typescript
await suprSendClient.user.set("name", "John Doe")
await suprSendClient.user.set({"name": "John Doe", "designation": "manager"})
```

#### Unset

This method will remove user property. To remove channel pass `$email`, `$sms`, `$whatsapp`.

```typescript
await suprSend.user.unset(arg: string | string[])
```

```typescript
await suprSendClient.user.unset("wishlist")
await suprSendClient.user.unset(["wishlist", "$email"]);
```

#### Append

This method will add a value to the list for a given property.

```typescript
await suprSendClient.user.append(arg1: string | Dictionary, arg2?: unknown)
```

```typescript
await suprSendClient.user.append("wishlist", "iphone12")
await suprSendClient.user.append({"wishlist" : "iphone12", "cart" : "Apple airpods"});
```

#### Remove

This method will remove a value from the list for a given property.

```typescript
await suprSendClient.user.remove(arg1: string | Dictionary, arg2?: unknown)
```

```typescript
await suprSendClient.user.remove("wishlist", "iphone12")
await suprSendClient.user.remove({"wishlist" : "iphone12", "cart" : "Apple airpods"});
```

#### SetOnce

This method is similar to set method but values once set cannot be updated.

```typescript
await suprSendClient.user.setOnce(arg1: string | Dictionary, arg2?: unknown)
```

```typescript
await suprSendClient.user.setOnce("DOB", "1991-10-02")
await suprSendClient.user.setOnce({"first_login" : "2021-11-02", "DOB" : "1991-10-02"});
```

#### Increment

Add the given amount to an existing user property. If the user does not already have the associated property, the amount will be added to zero. To reduce a property, provide a negative number as the value.

```typescript
await suprSendClient.user.increment(arg1: string | Dictionary, arg2?: number)
```

```typescript
await suprSendClient.user.increment("login_count", 1);
await suprSendClient.user.increment({"login_count" : 1, "order_count" : 1});
```

> **Note**
>
> Keys starting with `ss_` or `$` will be ignored.
