"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStagedFiles = getStagedFiles;
exports.getFileDiff = getFileDiff;
exports.parseDiffHunks = parseDiffHunks;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
function getStagedFiles() {
    const output = (0, child_process_1.execSync)('git diff --cached --name-only --diff-filter=ACM')
        .toString()
        .trim();
    return output
        .split('\n')
        .filter((file) => file.endsWith('.js') ||
        file.endsWith('.jsx') ||
        file.endsWith('.ts') ||
        file.endsWith('.tsx'))
        .map((file) => path_1.default.resolve(process.cwd(), file));
}
function getFileDiff(filePath) {
    return (0, child_process_1.execSync)(`git diff --cached --unified=0 ${filePath}`).toString();
}
function parseDiffHunks(diff) {
    const added = [];
    const removed = [];
    if (!diff)
        return { added, removed };
    const lines = diff.split('\n');
    let currentFile = '';
    let lineNumber = 0;
    let oldLine = 0;
    let newLine = 0;
    for (const line of lines) {
        // 检查文件头
        if (line.startsWith('+++ ') || line.startsWith('--- ')) {
            continue;
        }
        // 检查差异块头
        const hunkHeaderMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (hunkHeaderMatch) {
            oldLine = parseInt(hunkHeaderMatch[1]);
            newLine = parseInt(hunkHeaderMatch[3]);
            continue;
        }
        // 解析差异内容
        if (line.startsWith('+')) {
            added.push(`${newLine}`);
            newLine++;
        }
        else if (line.startsWith('-')) {
            removed.push(`${oldLine}`);
            oldLine++;
        }
        else {
            // 上下文行，两边行号都增加
            oldLine++;
            newLine++;
        }
    }
    return { added, removed };
}
