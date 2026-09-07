# Changelog

## 5.2.0

### Added

- `changeTenant()` now accepts an options object with `pushTokenAction` (`'none' | 'copy' | 'move'`, defaults to `'none'`). `copy` attaches the existing webpush subscription to the new tenant while keeping it on the current tenant. `move` detaches it from the current tenant and attaches it to the new tenant. If attaching to the new tenant fails, the active tenant is restored and the error is returned. If the device has no push subscription, the tenant switch still succeeds.

### Changed

- `changeTenant()` is now async and returns `Promise<ApiResponse>` instead of `ApiResponse`. Await it if you rely on the response.

### Notes

- With the default `pushTokenAction: 'none'`, `changeTenant()` behaves as before and the webpush subscription stays attached to the previous tenant.

[5.2.0]: https://github.com/suprsend/suprsend-web-sdk/compare/v5.1.0...v5.2.0

## 5.1.0

### Changed

- `userToken` is now refreshed on-demand before each api call (when expired or within 30 seconds of expiry) instead of via a background timer, so refreshes aren't missed in inactive or throttled tabs. Concurrent calls share a single refresh.
- The in-app feed socket reuses the same refresh flow on connection errors and reconnects with the refreshed token.
- Token refresh failures now log a warning instead of failing silently.

### Notes

- No integration changes are needed.

[5.1.0]: https://github.com/suprsend/suprsend-web-sdk/compare/v5.0.0...v5.1.0

## 5.0.0

### Added

- Tenant scoping support for multi-tenant workspaces:
  - Once a tenant is set, all SDK calls (events, preferences, feed) are scoped to the active tenant. No changes are needed if your workspace doesn't use multiple tenants.
  - `identify()` now accepts a `tenantId` option that sets the active tenant for the session. Its value must match `scope.tenant_id` in the `userToken` payload, else it raises a scoping error.
  - New `changeTenant(tenantId)` method to switch the active tenant of an identified user without resetting the session. Meant for user tokens that scope multiple tenants (`scope.tenant_id` as an array).
  - `track()` now accepts an options object with `tenantId` to attribute a single event to a tenant. This does not change the active tenant of the session.

### Notes

- Already running feed instances and previously fetched preferences keep the tenant they were initialized with when `changeTenant()` is called. Re-initialize the feed and call `getPreferences()` again to load data for the new tenant.

[5.0.0]: https://github.com/suprsend/suprsend-web-sdk/compare/v4.4.0...v5.0.0
