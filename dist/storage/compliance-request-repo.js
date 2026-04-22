"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComplianceRequestRepository = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
class ComplianceRequestRepository {
    constructor(filePath = node_path_1.default.resolve(process.cwd(), "data/compliance-requests.json")) {
        this.filePath = filePath;
        this.ensureFile();
    }
    async append(record) {
        const data = this.readAll();
        data.unshift(record);
        this.writeAll(data);
        return record;
    }
    async list() {
        return this.readAll();
    }
    async get(id) {
        return this.readAll().find((record) => record.id === id);
    }
    ensureFile() {
        const dir = node_path_1.default.dirname(this.filePath);
        if (!node_fs_1.default.existsSync(dir)) {
            node_fs_1.default.mkdirSync(dir, { recursive: true });
        }
        if (!node_fs_1.default.existsSync(this.filePath)) {
            node_fs_1.default.writeFileSync(this.filePath, "[]");
        }
    }
    readAll() {
        this.ensureFile();
        const content = node_fs_1.default.readFileSync(this.filePath, "utf8");
        if (!content.trim()) {
            return [];
        }
        return JSON.parse(content);
    }
    writeAll(data) {
        this.ensureFile();
        node_fs_1.default.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    }
}
exports.ComplianceRequestRepository = ComplianceRequestRepository;
