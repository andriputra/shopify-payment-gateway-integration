import { getStorage } from "../storage";
import type { SwipePayloadAppendInput } from "../storage/contracts";

export async function persistSwipePayload(input: SwipePayloadAppendInput): Promise<void> {
  try {
    await getStorage().swipePayloadRepo.append(input);
  } catch (err) {
    console.error("[swipe-payload-persist]", err);
  }
}
