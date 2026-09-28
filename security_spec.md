# Security Specification - JW Summit Mail Server

## Data Invariants
1. User accounts must have a unique email.
2. Sessions are tied to a specific user and expire (though expiration logic is in server.ts).
3. Diagnostics are read-only historical records once created.
4. Settings are global and should only be modifiable by admins (server-side).

## The Dirty Dozen Payloads
1. Create account with spoofed `id`.
2. Update another user's `passwordEnc`.
3. Create a session for another user without authentication.
4. Modify global `settings` via client SDK.
5. Inject 1MB string into `name` field of `UserAccount`.
6. Delete the `admin` account from a non-admin client.
7. Create a `custom_folder` with an invalid color hex code.
8. Update `createdAt` timestamp on an existing account.
9. List all `sessions` without being an admin.
10. Update `storageUsedMb` to a negative value.
11. Inject junk characters into `accountId` path.
12. Create a diagnostic result with a future `executedAt` date.

## Test Plan
- Verify that all client-side write/read operations to sensitive collections (accounts, settings, sessions) are denied by default.
- Verify that only the server (via Admin SDK) can perform these operations.
