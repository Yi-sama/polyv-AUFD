# BACKEND-007: POLYV Official Account Login Investigation

Date: 2026-10-24, Asia/Shanghai.
Outcome: investigation completed; official-account integration blocked.

## User Requirement And Current Behavior

- User confirmed the official POLYV management backend, not a separate customer
  business system. AUFD should reuse that identity system, not keep a second
  password. The user authorized investigation and an integration attempt.
- Existing source is local auth: `server/app.mjs:169` calls `store.login`;
  `server/store.mjs:124` verifies the local account with scrypt;
  `server/auth.mjs:61` issues an AUFD session after that check.
- `server/polyv.mjs:50` loads shared video API credentials. They are not a proof
  of which visitor owns an official management account.
- No applicable on-disk AGENTS.md. User instructions and current project memory
  were read; Claude's frontend and shared daily-log edits were preserved.

## Official Evidence

1. Backend SSO:
   https://help.polyv.net/live/api/account/sso_manager/
   It starts from an already authenticated external system and enters POLYV.
   The integration sets a token using appId/appSecret and redirects to the
   POLYV userLogin endpoint. Its optional childEmail targets a subaccount.
   This is not an identity assertion returned to AUFD.

2. VOD subaccount permissions:
   https://help.polyv.net/vod/product/manual/setting/sub_account_privilege/
   Subaccounts can have resource-limited API credentials. These describe
   resource access, not a third-party application login protocol.

3. Lecturer/assistant/guest login URL:
   https://help.polyv.net/live/api/channel/operate/get_token_login_url/
   The signed API generates a URL into the POLYV broadcasting interface for a
   channel role. That role must not be mistaken for an official admin identity.

An independent read-only researcher checked the public official material.
The root agent point-checked the SSO direction, parameters, subaccount scope
and channel-role distinction. No usable POLYV-as-identity-provider contract
for AUFD was established. This is not proof that a private partner interface
does not exist.

## Required From The POLYV Partner

- Confirm support for official-account login to an external application and
  which VOD/live main accounts or subaccounts are supported.
- Provide the official protocol and endpoints, application onboarding,
  callback allowlisting and a test environment. If OIDC/OAuth or a signed
  assertion is supported, provide its exact validation and key-discovery rules.
- Specify stable identity, tenant/main-account membership, account type,
  permissions, disabled-account behavior, expiry/replay protection and logout.
- Define how a verified identity is allowed to manage an AUFD creator and
  which video resources it can access. Do not assume username/slug equivalence
  or silently merge existing creator accounts.
- Supply test application configuration through local private configuration,
  not committed files or frontend code. Do not request production passwords in
  chat. If only password verification is available, first obtain its documented
  third-party usage, MFA, CAPTCHA, lockout and rate-limit requirements.

## Decision And Changes

- Updated the product-direction correction, API status notice and project
  memory. The runtime contract stays v2.2; no new endpoint is claimed.
- Kept current demo behavior and persisted data intact. Did not modify
  `server/` or Claude's `frontend/`, restart services, migrate accounts, invent
  OAuth URLs, collect official passwords or replay browser cookies.
- Did not invoke the reverse SSO APIs: creating a POLYV session would not test
  the required identity direction and would needlessly change external state.
- Once an approved identity contract is available, implement that concrete
  verifier and identity mapping before issuing AUFD sessions. Retain owner-only
  authorization and add tests for forged, expired, replayed and wrong-tenant
  assertions, plus account linking. This is future work, not implemented code.

## Verification And Limits

- Local HTTP baseline: `/api/health` 200, status=ok, polyvConfigured=true;
  anonymous `/api/auth/me` 401 AUTH_REQUIRED. Existing service was not disrupted.
- The prior 32-test pass applies to local demo auth and video integration only.
  Tests were not rerun for documentation-only changes and do not validate SSO.
- No official-account login request, credential submission or callback test
  occurred because no supported target contract was available.
- spec_check: pass for documenting the new requirement and implementation gap.
- runtime_check: partial; local baseline only, official authentication not run.
- human_check: pending for partner confirmation and real-account acceptance.
- overall: blocked for official login; public documentation research alone
  cannot meet the user's unified-login acceptance criterion.
- Tool/network failures and recovery are in `docs/debug/2026-10-24-debug.md`.
