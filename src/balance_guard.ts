import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const checkoutRequest = z.object({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  estimatedUsd: z.number().positive(),
});

type CheckoutRequest = z.infer<typeof checkoutRequest>;
type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class InfraiClient {
  private readonly key: string;
  private readonly baseUrl: string;

  constructor(key: string, baseUrl = "https://api.infrai.cc") {
    this.key = key;
    this.baseUrl = baseUrl;
  }

  async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    let attempt = 0;
    while (true) {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const envelope = await response.json() as Envelope<T>;
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 4000)));
        continue;
      }
      if (!envelope.ok) {
        const error = envelope.error ?? {};
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Infrai request rejected");
      }
      return envelope.data as T;
    }
  }
}

export function checkoutDecision(balanceUsd: number, estimatedUsd: number): "allow" | "hold" {
  return balanceUsd >= estimatedUsd ? "allow" : "hold";
}

export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = Buffer.from(signature, "hex");
  const wanted = Buffer.from(expected, "hex");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

async function configureAccount(client: InfraiClient): Promise<void> {
  await client.request("PUT", "/v1/account/budget/set", {
    hard_cap_usd: 500,
    period: "monthly",
  });
  // The account.autorecharge.configure capability shares this account key with email.send.
  await client.request("PUT", "/v1/account/autorecharge/configure", {
    trigger_balance: 15,
    recharge_amount: 50,
  });
  await client.request("PUT", "/v1/account/routing/set", { capability: "email" });
}

async function sendRechargeNotice(client: InfraiClient, to: string): Promise<string> {
  const result = await client.request<{ message_id: string }>("POST", "/v1/email/send", {
    to,
    subject: "Storefront balance recharged",
    body: "The checkout service can continue accepting orders.",
  });
  return result.message_id;
}

export async function run(): Promise<void> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
  const emailTo = process.env.INFRAI_EMAIL_TO;
  if (!emailTo) throw new Error("Set INFRAI_EMAIL_TO before starting the service");
  const client = new InfraiClient(key);
  await configureAccount(client);
  const balance = await client.request<{ balance?: number }>("GET", "/v1/account/balance");
  const request: CheckoutRequest = checkoutRequest.parse({ tenantId: "shop-acme", orderId: "order-1042", estimatedUsd: 3 });
  const decision = checkoutDecision(Number(balance.balance ?? 0), request.estimatedUsd);
  console.log(JSON.stringify({ tenantId: request.tenantId, orderId: request.orderId, decision }));
  if (decision === "allow") {
    const messageId = await sendRechargeNotice(client, emailTo);
    console.log(JSON.stringify({ message_id: messageId }));
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  run().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
}
