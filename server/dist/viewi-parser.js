"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewiParser = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode_uri_1 = require("vscode-uri");
class ViewiParser {
    constructor(workspaceRoot, searchPaths) {
        this.allComponentsCache = new Map();
        this.phpFileToComponent = new Map();
        this.fileMtimes = new Map();
        this.searchPaths = ['./'];
        this.isScanning = false;
        this.workspaceRoot = workspaceRoot;
        if (searchPaths) {
            this.searchPaths = searchPaths;
        }
    }
    setSearchPaths(paths) {
        this.searchPaths = paths;
        this.clearCache();
    }
    clearCache() {
        this.allComponentsCache.clear();
        this.phpFileToComponent.clear();
        this.fileMtimes.clear();
    }
    async updateComponent(filePath) {
        const phpFilePath = filePath.endsWith('.php') ? filePath : filePath.replace(/\.html$/, '.php');
        const htmlFilePath = phpFilePath.replace(/\.php$/, '.html');
        if (fs.existsSync(phpFilePath) && fs.existsSync(htmlFilePath)) {
            await this.parseComponent(phpFilePath, htmlFilePath);
        }
    }
    removeComponentByFile(filePath) {
        const phpFilePath = filePath.endsWith('.php') ? filePath : filePath.replace(/\.html$/, '.php');
        const componentName = this.phpFileToComponent.get(phpFilePath);
        if (componentName && this.allComponentsCache.has(componentName)) {
            this.allComponentsCache.delete(componentName);
            this.phpFileToComponent.delete(phpFilePath);
            this.fileMtimes.delete(phpFilePath);
            const htmlFilePath = phpFilePath.replace(/\.php$/, '.html');
            this.fileMtimes.delete(htmlFilePath);
        }
    }
    async getAllComponents() {
        if (this.allComponentsCache.size === 0 && !this.isScanning) {
            this.isScanning = true;
            console.log('Initial component scan started.');
            for (const searchPath of this.searchPaths) {
                const fullPath = path.join(this.workspaceRoot, searchPath);
                if (fs.existsSync(fullPath)) {
                    await this.scanDirectory(fullPath);
                }
            }
            this.isScanning = false;
            console.log(`Initial component scan finished. Found ${this.allComponentsCache.size} components.`);
        }
        return Array.from(this.allComponentsCache.values());
    }
    async getComponentForHtmlFile(htmlFilePath) {
        const phpFilePath = htmlFilePath.replace(/\.html$/, '.php');
        const componentName = this.phpFileToComponent.get(phpFilePath);
        if (componentName && this.allComponentsCache.has(componentName)) {
            // Check mtime to see if we need to refresh
            const phpStat = await fs.promises.stat(phpFilePath);
            if (this.fileMtimes.get(phpFilePath) === phpStat.mtimeMs) {
                return this.allComponentsCache.get(componentName);
            }
        }
        // If not in cache or outdated, parse it
        if (fs.existsSync(phpFilePath)) {
            return this.parseComponent(phpFilePath, htmlFilePath.replace(/\.php$/, '.html'));
        }
        return null;
    }
    async getComponentTags(documentUri) {
        const components = await this.getAllComponents();
        return components.map(c => c.name);
    }
    async getPhpVariablesAndMethods(documentUri) {
        const filePath = vscode_uri_1.URI.parse(documentUri).fsPath;
        const phpFile = filePath.replace(/\.html$/, '.php');
        const component = await this.getComponentForHtmlFile(filePath);
        console.log([filePath, component, component?.methods, component?.properties]);
        if (!component) {
            return { properties: [], methods: [] };
        }
        return {
            properties: component.properties.filter(p => p.visibility === 'public'),
            methods: component.methods.filter(m => m.visibility === 'public')
        };
    }
    async scanDirectory(dirPath) {
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    await this.scanDirectory(fullPath);
                }
                else if (entry.isFile() && entry.name.endsWith('.php')) {
                    const htmlFile = fullPath.replace(/\.php$/, '.html');
                    console.log([entry, fullPath]);
                    if (fs.existsSync(htmlFile)) {
                        await this.parseComponent(fullPath, htmlFile);
                    }
                }
            }
        }
        catch (error) {
            // Directory doesn't exist or can't be read
        }
    }
    async parseComponent(phpFile, htmlFile) {
        try {
            const phpStat = await fs.promises.stat(phpFile);
            const htmlStat = await fs.promises.stat(htmlFile);
            const lastPhpMtime = this.fileMtimes.get(phpFile);
            const lastHtmlMtime = this.fileMtimes.get(htmlFile);
            const componentNameFromCache = this.phpFileToComponent.get(phpFile);
            if (componentNameFromCache &&
                this.allComponentsCache.has(componentNameFromCache) &&
                lastPhpMtime === phpStat.mtimeMs &&
                lastHtmlMtime === htmlStat.mtimeMs) {
                return this.allComponentsCache.get(componentNameFromCache);
            }
            const content = await fs.promises.readFile(phpFile, 'utf-8');
            const className = this.extractClassName(content);
            if (!className) {
                return null;
            }
            const properties = this.extractProperties(content);
            const methods = this.extractMethods(content);
            const component = {
                name: className,
                phpFile,
                htmlFile,
                properties,
                methods
            };
            this.allComponentsCache.set(className, component);
            this.phpFileToComponent.set(phpFile, className);
            this.fileMtimes.set(phpFile, phpStat.mtimeMs);
            this.fileMtimes.set(htmlFile, htmlStat.mtimeMs);
            return component;
        }
        catch (error) {
            return null;
        }
    }
    extractClassName(content) {
        // Match class declaration, potentially with extends
        const classMatch = content.match(/class\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+extends\s+[A-Za-z_][A-Za-z0-9_\\]*)?/);
        return classMatch ? classMatch[1] : null;
    }
    extractProperties(content) {
        const properties = [];
        // Match property declarations: visibility [static] [type] $name
        const propertyRegex = /(public|private|protected)\s+(static\s+)?(?:([A-Za-z_][A-Za-z0-9_]*|\||\[\]|\?)*\s+)?\$([A-Za-z_][A-Za-z0-9_]*)/g;
        let match;
        while ((match = propertyRegex.exec(content)) !== null) {
            const visibility = match[1];
            const isStatic = !!match[2];
            const type = match[3] || 'mixed';
            const name = match[4];
            properties.push({
                name,
                type,
                visibility,
                isStatic
            });
        }
        return properties;
    }
    extractMethods(content) {
        const methods = [];
        // Match method declarations: [visibility] [static] function name(params): returnType
        // If no visibility is specified, default to public
        const methodRegex = /(?:(public|private|protected)\s+)?(static\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g;
        let match;
        while ((match = methodRegex.exec(content)) !== null) {
            const visibility = match[1] || 'public'; // Default to public if not specified
            const isStatic = !!match[2];
            const name = match[3];
            const paramString = match[4] || '';
            const returnType = match[5] ? match[5].trim() : 'void';
            const parameters = this.parseParameters(paramString);
            methods.push({
                name,
                returnType,
                visibility,
                isStatic,
                parameters
            });
        }
        return methods;
    }
    parseParameters(paramString) {
        if (!paramString.trim()) {
            return [];
        }
        const parameters = [];
        const params = paramString.split(',');
        for (const param of params) {
            const trimmed = param.trim();
            if (!trimmed)
                continue;
            // Match: [type] $name [= default]
            const paramMatch = trimmed.match(/(?:([A-Za-z_][A-Za-z0-9_]*|\||\[\]|\?)*\s+)?\$([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*(.+))?/);
            if (paramMatch) {
                const type = paramMatch[1] ? paramMatch[1].trim() : 'mixed';
                const name = paramMatch[2];
                const hasDefault = !!paramMatch[3];
                parameters.push({
                    name,
                    type,
                    hasDefault
                });
            }
        }
        return parameters;
    }
}
exports.ViewiParser = ViewiParser;
//# sourceMappingURL=viewi-parser.js.map