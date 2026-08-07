# Changelog

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
