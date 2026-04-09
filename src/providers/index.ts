import { PaymentProvider } from "./base";
import { midtransProvider } from "./midtrans";
import { sandboxProvider } from "./sandbox";
import { xenditProvider } from "./xendit";

const providers = new Map<string, PaymentProvider>([
  [xenditProvider.id, xenditProvider],
  [midtransProvider.id, midtransProvider],
  [sandboxProvider.id, sandboxProvider]
]);

export function getProvider(providerId: string): PaymentProvider {
  if (providerId === "custom") {
    return sandboxProvider;
  }
  const provider = providers.get(providerId);
  if (!provider) {
    throw new Error(`Provider not supported: ${providerId}`);
  }
  return provider;
}
