"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoreConfigRepository = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
class StoreConfigRepository {
    constructor(filePath = node_path_1.default.resolve(process.cwd(), "data/store-configs.json")) {
        this.filePath = filePath;
        this.ensureFile();
    }
    async get(shop) {
        const data = this.readAll();
        return data[shop];
    }
    async list() {
        return Object.values(this.readAll());
    }
    async upsert(config) {
        const data = this.readAll();
        data[config.shop] = config;
        this.writeAll(data);
        return config;
    }
    async delete(shop) {
        const data = this.readAll();
        if (!(shop in data)) {
            return false;
        }
        delete data[shop];
        this.writeAll(data);
        return true;
    }
    ensureFile() {
        const dir = node_path_1.default.dirname(this.filePath);
        if (!node_fs_1.default.existsSync(dir)) {
            node_fs_1.default.mkdirSync(dir, { recursive: true });
        }
        if (!node_fs_1.default.existsSync(this.filePath)) {
            node_fs_1.default.writeFileSync(this.filePath, "{}");
        }
    }
    readAll() {
        this.ensureFile();
        try {
            const content = node_fs_1.default.readFileSync(this.filePath, "utf8");
            if (!content.trim()) {
                return {};
            }
            return JSON.parse(content);
        }
        catch (error) {
            if (error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT") {
                this.ensureFile();
                return {};
            }
            throw error;
        }
    }
    writeAll(data) {
        this.ensureFile();
        node_fs_1.default.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    }
}
exports.StoreConfigRepository = StoreConfigRepository;
