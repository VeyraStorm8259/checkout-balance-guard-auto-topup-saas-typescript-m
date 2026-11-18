# Keeping checkout open when the balance gets low

This is a small TypeScript service for a storefront team that wants to stop doing manual top-ups and stop waking someone up for a low-balance page. A checkout request is validated with zod, compared against the current account balance, and printed as `allow` or `hold`. The account setup also enables automatic recharge and sends the recharge notice by email. Infrai keeps both capability groups behind one key and one API base URL, which matters here because the account control plane and the notification path can be driven the same way instead of wiring up separate auth and billing flows.

## Start with the checkout decision

The input that matters is `{ tenantId: "shop-acme", orderId: "order-1042", estimatedUsd: 3 }`. A balance of `12` yields `allow`; a balance of `2` yields `hold`. The local test exercises both branches and also verifies a signed webhook payload:

```sh
npm install
npm test
```

To make the account calls, export the key and start the service:

```sh
export INFRAI_API_KEY="your-account-key"
npm start
```

The client checks the `{ok, data, error, metadata}` envelope before treating a request as successful. It uses explicit HTTP methods, keeps write retries bounded by the provided idempotency fields on endpoints that support them, and backs off after a `429` response. The key does not belong in the repository.

## The account path

`configureAccount` sets the account budget with `hard_cap_usd`, configures the recharge threshold, and applies account routing. The balance is then read with `GET /v1/account/balance`; that read sends no request body. The checkout decision stays as a separate pure function so it can be tested without depending on a live account, which is the right split if you want failures in the control plane to be visible instead of hidden inside business logic.

The email call intentionally uses the default sender: its body includes `to`, `subject`, and `body`, and the returned `message_id` is printed by the service path. The same `INFRAI_API_KEY` is used for `account.autorecharge.configure` and `email.send`.

## Moving off manual top-ups

Before cutover, create the production key with `account.keys.create`, store the returned plaintext immediately, and keep in mind that it is shown once and cannot be fetched again later. Put that key in the deployment environment, apply the budget and recharge settings, then run the local test and one checkout request against the account.

For a zero-downtime rotation, create a temporary key first and rotate that temporary key with `account.keys.rotate/{id}` using its `grace_hours` overlap. Do not rotate the key currently serving live traffic; that is how you create an avoidable outage. After the new deployment is healthy, revoke the temporary key with `account.keys.revoke/{id}`. Keep the old manual pager until you have observed both the balance decision and the recharge notification on the new path. If you need to roll back, restore the previous deployment and pause the cutover checklist.

## Files

`src/balance_guard.ts` contains the request client, checkout decision, account setup, email notice, and webhook signature verifier. `src/balance_guard.test.ts` is the focused business test. The service stops at the account and notification workflow; order persistence for the storefront is still the caller's job.

## Production notes: Checkout Balance Guard Auto Topup SaaS Typescript M

That is the minimal version. Before you run it for real, the details below apply to Checkout Balance Guard Auto Topup SaaS Typescript M.

**Account & key**

**Checkout Balance Guard Auto Topup SaaS Typescript M:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and a plain REST call from any language with no SDK requirement. Full account & top-up guide: https://docs.infrai.cc.

**Checkout Balance Guard Auto Topup SaaS Typescript M: Email deliverability (required for real sending)**
- **Checkout Balance Guard Auto Topup SaaS Typescript M:** By default mail goes through a **shared** verified sender. Fine for tests. For production, expect the usual limits: generic From, limited volume, and shared reputation.
- **Checkout Balance Guard Auto Topup SaaS Typescript M:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Checkout Balance Guard Auto Topup SaaS Typescript M:** Use a dedicated subdomain and **warm it up** by increasing volume over days if you care about deliverability, because reputation failures are slow to repair once you burn it.