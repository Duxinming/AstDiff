"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImpactAnalyzer = void 0;
const path_1 = __importDefault(require("path"));
const git_utils_1 = require("./git-utils");
class ImpactAnalyzer {
    constructor(graph) {
        this.graph = graph;
    }
    analyzeImpact(changedFiles) {
        const impactedEntities = new Set();
        changedFiles.forEach((filePath) => {
            const diff = (0, git_utils_1.getFileDiff)(filePath);
            const { added, removed } = (0, git_utils_1.parseDiffHunks)(diff);
            const changedEntities = this.findChangedEntities(filePath, added, removed);
            const impacted = this.findImpactedEntities(changedEntities);
            impacted.forEach((entity) => impactedEntities.add(entity));
        });
        return Array.from(impactedEntities);
    }
    findChangedEntities(filePath, addedLines, removedLines) {
        // 根据变更的行号范围找到受影响的代码实体
        return Array.from(this.graph.entities.values())
            .filter((entity) => {
            // 规范化路径
            const normalizedPath1 = path_1.default.normalize(entity.filePath);
            const normalizedPath2 = path_1.default.normalize(filePath);
            return normalizedPath1 === normalizedPath2;
        })
            .filter((entity) => {
            const pos = entity.position;
            if (!pos)
                return false;
            // 简化实现，实际应该检查行号范围
            return (addedLines.some((line) => this.getInludesLines(pos.line, Number(line))) ||
                removedLines.some((line) => this.getInludesLines(pos.line, Number(line))));
        });
    }
    findImpactedEntities(changedEntities) {
        const impacted = new Set();
        const visited = new Set();
        const visit = (entity) => {
            const key = `${entity.filePath}:${entity.name}:${entity.type}`;
            if (visited.has(key))
                return;
            visited.add(key);
            impacted.add(entity);
            // 查找所有依赖此实体的其他实体
            this.graph.edges
                .filter((edge) => edge.target.filePath === entity.filePath &&
                edge.target.name === entity.name &&
                edge.target.type === entity.type)
                .forEach((edge) => {
                visit(edge.source);
            });
        };
        changedEntities.forEach(visit);
        return Array.from(impacted);
    }
    getInludesLines(lines, line) {
        const [startLine, endLine] = lines;
        return startLine <= line && endLine >= line;
    }
}
exports.ImpactAnalyzer = ImpactAnalyzer;
