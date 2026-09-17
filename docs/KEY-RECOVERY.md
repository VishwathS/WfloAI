# INTEGRATION_TOKEN_KEY — what it protects and how to recover it

**B9.** This is the one secret in WfloAI whose loss is unrecoverable by any
means. Everything else can be regenerated from its provider.

## What it is

A 32-byte key, base64 encoded, read by `lib/crypto.ts`. It encrypts, with
AES-256-GCM:

- every Gmail **refresh token** and cached access token in `gmail_connections`
- every third-party **credential** in `user_credentials` (bearer tokens, basic
  auth pairs, API keys)
- the Gmail OAuth **state cookie** during the connect flow

Ciphertext is stored as a versioned envelope, `v1:<iv>:<ciphertext>:<authTag>`.
The version prefix anticipates rotation, but **no rotation path is implemented**
— only `v1` decrypts, with the one current key.

## What happens if it is lost or regenerated

Every stored integration secret becomes unreadable, **simultaneously and
permanently**. Concretely:

- Every user's Gmail connection stops working. Each of them has to reconnect,
  which means going through Google OAuth again.
- Every stored API credential stops working. The values cannot be recovered and
  cannot be shown to the user, because the application never returns a stored
  secret to a browser — so users must re-enter secrets they may no longer have.
- Every scheduled workflow with a Gmail or HTTP step starts failing on its own
  timetable, with the owner not present.

There is no partial recovery, and no way to decrypt the old rows later if the
key turns up. Regenerating this key is equivalent to deleting every stored
credential in the system.

## Generating it

```
openssl rand -base64 32
```

Do this **once**. Generating a second one is the failure described above.

## Where it must live

Two independent places, so that losing either one is survivable:

1. **The host's secret store** — where the running application reads it from.
2. **A password manager** you control, in an entry that names this file.

"Two independent places" excludes: two copies inside the same host account, a
copy in a repository (it would be committed), and a copy in a chat or an email
to yourself.

## Confirming the host will not regenerate it

Some platforms offer to generate environment values for you, and some rotate
them as part of a project reset or a restore-from-template. Confirm that yours
does not, and that the variable is set explicitly rather than derived. If the
platform cannot promise that, treat the password manager copy as the primary.

## Testing the restore path — do this once

An untested backup is not a backup. The point is to prove you can get the value
back, not to prove it exists.

1. Retrieve the key from the **password manager**, not from the host.
2. Compare it to what the host currently holds. It must match exactly, including
   any trailing `=` padding.
3. Confirm the value round-trips: with that key set, an existing Gmail
   connection still works and a stored credential still decrypts.
4. Write down the date you did this, and where you retrieved it from, in
   `RELEASE_PROGRESS.md` under Manual / external action log.

## If you believe it has been exposed

Rotation is not implemented, so there is no clean rotation. The recovery is a
deliberate reset:

1. Generate a new key and set it in the host.
2. Accept that all existing ciphertext is now undecryptable.
3. Delete the rows holding the old ciphertext — `gmail_connections` and
   `user_credentials` — so users are prompted to reconnect and re-enter rather
   than hitting decryption errors.
4. Tell affected users what happened and what they need to redo.

Building a real rotation path (decrypt with `v1`, re-encrypt as `v2`, dual-read
during the migration) is deferred work, not a V1 requirement. This document is
the substitute.
