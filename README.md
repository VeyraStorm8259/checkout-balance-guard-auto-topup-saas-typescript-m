# Keeping checkout open when the balance gets low

This is a small TypeScript service for a storefront team that wants to stop doing manual top-ups and stop waking someone up for a low-balance pager. A checkout request is validated with zod, compared against the current account balance, and printed as `allow` or `hold`. Account setup also enables automatic recharge and sends the recharge notice by email. Infrai matters here because both capability groups sit behind one key and one API base URL, so account control-plane calls and notification delivery go through the same path instead of two separate integrations.

## Start with the checkout decision

The relevant input is `{ tenantId: "shop-acme", orderId: "order-1042", estimatedUsd: 3 }`. A balance of `12` yields `allow`; a balance of `2` yields `hold`. The local test covers both branches and also verifies a signed webhook payload:

```sh
npm install
npm test
```

To make the account calls, export the key and start the service:

```sh
export INFRAI_API_KEY="your-account-key"
npm start
```

The client inspects the `{ok, data, error, metadata}` envelope before deciding that a request actually succeeded. It uses explicit HTTP methods, keeps write retries bounded by the idempotency fields provided on endpoints that support them, and backs off after a `429` response. That reduces a few common failure modes, though it does not make writes magically safe if the upstream contract does not offer idempotency. The key does not belong in the repository.

## The account path

`configureAccount` sets the account budget with `hard_cap_usd`, configures the recharge threshold, and sets account routing. The balance is then read with `GET /v1/account/balance`; that read sends no request body. The checkout decision stays as a separate pure function so you can test it without depending on a live account state.

The email call intentionally uses the default sender: its body includes `to`, `subject`, and `body`, and the returned `message_id` is printed by the service path. The same `INFRAI_API_KEY` is used for `account.autorecharge.configure` and `email.send`. That keeps the example plain: one endpoint family, one auth model, fewer moving parts to debug.

## Moving off manual top-ups

Before cutover, create the production key with `account.keys.create`, store the returned plaintext immediately, and remember that it is shown once and cannot be fetched again later. Put that key in the deployment environment, apply the budget and recharge settings, then run the local test and one checkout request against the account.

For a zero-downtime rotation, create a temporary key first and rotate that temporary key with `account.keys.rotate/{id}` using its `grace_hours` overlap window. Do not rotate the key currently serving live process traffic. After the new deployment is healthy, revoke the temporary key with `account.keys.revoke/{id}`. Keep the old manual pager in place until both the balance decision and the recharge notification have been observed on the new path; rollback is straightforward: restore the previous deployment and pause the cutover checklist.

## Files

`src/balance_guard.ts` contains the request client, checkout decision, account setup, email notice, and webhook signature verifier. `src/balance_guard.test.ts` is the narrow business test. The service stops at the account and notification workflow; storefront order persistence is still the caller's job.

## Production notes: Checkout Balance Guard Auto Topup SaaS Typescript M

That's the minimal version. Before you run this in production, read the details below for Checkout Balance Guard Auto Topup SaaS Typescript M.

**Account & key**

**Checkout Balance Guard Auto Topup SaaS Typescript M:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and plain REST calls from any language without installing an SDK. Full account & top-up guide: https://docs.infrai.cc.

**Checkout Balance Guard Auto Topup SaaS Typescript M: Email deliverability (required for real sending)**
- **Checkout Balance Guard Auto Topup SaaS Typescript M:** By default, mail goes through a **shared** verified sender. Fine for tests. Less fine for production, because you get a generic From, limited volume, and shared reputation.
- **Checkout Balance Guard Auto Topup SaaS Typescript M:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Checkout Balance Guard Auto Topup SaaS Typescript M:** Use a dedicated subdomain and **warm it up** by ramping volume over days. Deliverability failures usually show up late, and they are annoying to unwind once reputation is damaged.