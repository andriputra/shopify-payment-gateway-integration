"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistSwipePayload = persistSwipePayload;
const storage_1 = require("../storage");
async function persistSwipePayload(input) {
    try {
        await (0, storage_1.getStorage)().swipePayloadRepo.append(input);
    }
    catch (err) {
        console.error("[swipe-payload-persist]", err);
    }
}
