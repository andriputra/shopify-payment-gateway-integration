import { PaymentProvider } from "./base";
import { midtransProvider } from "./midtrans";
import { xenditProvider } from "./xendit";

const providers = new Map<string, PaymentProvider>([
  [xenditProvider.id, xenditProvider],
  [midtransProvider.id, midtransProvider]
]);

export function getProvider(providerId: string): PaymentProvider {
  const provider = providers.get(providerId);
  if (!provider) {
    throw new Error(`Provider not supported: ${providerId}`);
  }
  return provider;
}
