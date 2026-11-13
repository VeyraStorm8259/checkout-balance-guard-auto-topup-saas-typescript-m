import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { checkoutDecision, verifyWebhookSignature } from "./balance_guard.ts";

assert.equal(checkoutDecision(12, 3), "allow");
assert.equal(checkoutDecision(2, 3), "hold");

const body = JSON.stringify({ event: "autorecharge.charged", amount: 50 });
const secret = "checkout-webhook-secret";
const signature = createHmac("sha256", secret).update(body).digest("hex");
assert.equal(verifyWebhookSignature(body, signature, secret), true);
assert.equal(verifyWebhookSignature(body, signature.slice(0, -1) + "0", secret), false);
console.log("checkout decision and webhook signature checks passed");
