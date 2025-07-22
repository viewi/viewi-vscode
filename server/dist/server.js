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
const node_1 = require("vscode-languageserver/node");
const fs = __importStar(require("fs"));
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const vscode_uri_1 = require("vscode-uri");
const viewi_parser_1 = require("./viewi-parser");
// Create a connection for the server, using Node's IPC as a transport.
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Create a simple text document manager.
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
const defaultSettings = {
    enableAutocompletion: true,
    componentSearchPaths: ['.']
};
const builtInControlTags = ['slot', 'slotContent', 'template'];
let viewiParser;
let settings = defaultSettings;
connection.onInitialize((params) => {
    const capabilities = params.capabilities;
    // Does the client support the `workspace/configuration` request?
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
    hasDiagnosticRelatedInformationCapability = !!(capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation);
    // Initialize the parser with workspace root
    const workspaceRoot = params.workspaceFolders?.[0]?.uri || params.rootUri || '';
    const workspacePath = workspaceRoot.replace('file://', '');
    // Get initial settings
    const initSettings = params.initializationOptions?.settings || defaultSettings;
    viewiParser = new viewi_parser_1.ViewiParser(workspacePath, initSettings.componentSearchPaths);
    const result = {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['<', '{', '$', ' ']
            },
            definitionProvider: true,
            workspace: {
                fileOperations: {
                    didCreate: {
                        filters: [{ pattern: { glob: '**/*.{php,html}' } }]
                    },
                    didDelete: {
                        filters: [{ pattern: { glob: '**/*.{php,html}' } }]
                    }
                }
            }
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace.workspaceFolders = {
            supported: true
        };
    }
    connection.console.log(`Initialized with language mode for HTML: text.html.viewi`);
    return result;
});
connection.onDidOpenTextDocument(params => {
    console.log(['onDidOpenTextDocument', params.textDocument.uri, params.textDocument.languageId]);
    if (params.textDocument.uri.endsWith('.html')) {
        connection.console.log(`Opened document: ${params.textDocument.uri}, languageId: ${params.textDocument.languageId}`);
    }
});
connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
    // Initial scan of components
    viewiParser.getAllComponents();
});
connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        settings = change.settings?.viewi || defaultSettings;
    }
    else {
        settings = change.settings?.viewi || defaultSettings;
    }
    // Update parser settings
    if (viewiParser) {
        viewiParser.setSearchPaths(settings.componentSearchPaths);
    }
});
// Custom notification handlers
connection.onNotification('viewi/refreshComponents', () => {
    if (viewiParser) {
        // viewiParser.clearCache();
    }
});
connection.onNotification('workspace/didChangeConfiguration', (params) => {
    const newSettings = params.settings || defaultSettings;
    settings = newSettings;
    if (viewiParser) {
        viewiParser.setSearchPaths(settings.componentSearchPaths);
    }
});
// Helper functions
function getWordAtPosition(document, position) {
    const text = document.getText();
    const offset = document.offsetAt(position);
    let start = offset;
    let end = offset;
    // Find word boundaries
    while (start > 0 && /[a-zA-Z0-9_$]/.test(text[start - 1])) {
        start--;
    }
    while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) {
        end++;
    }
    return text.substring(start, end);
}
function isInsideTag(document, position) {
    const text = document.getText();
    const offset = document.offsetAt(position);
    let lastOpenTag = text.lastIndexOf('<', offset);
    let lastCloseTag = text.lastIndexOf('>', offset);
    return lastOpenTag > lastCloseTag;
}
function isInsideBraces(document, position) {
    const text = document.getText();
    const offset = document.offsetAt(position);
    // Check for double braces first
    let lastDoubleBraceOpen = text.lastIndexOf('{{', offset);
    let lastDoubleBraceClose = text.lastIndexOf('}}', offset);
    if (lastDoubleBraceOpen > lastDoubleBraceClose) {
        return { inside: true, type: 'double' };
    }
    // Check for single braces
    let lastSingleBraceOpen = text.lastIndexOf('{', offset);
    let lastSingleBraceClose = text.lastIndexOf('}', offset);
    // Make sure it's not part of double braces
    if (lastSingleBraceOpen > lastSingleBraceClose) {
        const beforeBrace = text[lastSingleBraceOpen - 1];
        const afterBrace = text[lastSingleBraceOpen + 1];
        if (beforeBrace !== '{' && afterBrace !== '{') {
            return { inside: true, type: 'single' };
        }
    }
    return { inside: false, type: null };
}
function getLineTextBeforePosition(document, position) {
    return document.getText({
        start: { line: position.line, character: 0 },
        end: position
    });
}
// File system watchers
documents.onDidSave(change => {
    if (viewiParser) {
        const filePath = vscode_uri_1.URI.parse(change.document.uri).fsPath;
        if (filePath.endsWith('.php') || filePath.endsWith('.html')) {
            console.log(`File saved, updating component: ${filePath}`);
            viewiParser.updateComponent(filePath);
        }
    }
});
connection.workspace.onDidCreateFiles(params => {
    if (viewiParser) {
        for (const file of params.files) {
            const filePath = vscode_uri_1.URI.parse(file.uri).fsPath;
            console.log(`File created, updating component: ${filePath}`);
            viewiParser.updateComponent(filePath);
        }
    }
});
connection.workspace.onDidDeleteFiles(params => {
    if (viewiParser) {
        for (const file of params.files) {
            const filePath = vscode_uri_1.URI.parse(file.uri).fsPath;
            console.log(`File deleted, removing component: ${filePath}`);
            viewiParser.removeComponentByFile(filePath);
        }
    }
});
connection.onCompletion(async (_textDocumentPosition) => {
    if (!settings.enableAutocompletion) {
        return [];
    }
    const document = documents.get(_textDocumentPosition.textDocument.uri);
    if (!document) {
        return [];
    }
    const position = _textDocumentPosition.position;
    const lineText = getLineTextBeforePosition(document, position);
    const wordAtPosition = getWordAtPosition(document, position);
    // Only provide completions for HTML files
    if (!document.uri.endsWith('.html')) {
        return [];
    }
    const completions = [];
    const { properties, methods } = await viewiParser.getPhpVariablesAndMethods(document.uri);
    const components = await viewiParser.getComponentTags(document.uri);
    const text = document.getText();
    const offset = document.offsetAt(position);
    const charBeforeCursor = offset > 0 ? text[offset - 1] : '';
    // Helper function to check if we're inside braces with whitespace support
    function isInsideBracesWithWhitespace(document, position) {
        const text = document.getText();
        const offset = document.offsetAt(position);
        // Check for double braces first - allow whitespace after {{
        let lastDoubleBraceOpen = -1;
        let lastDoubleBraceClose = -1;
        for (let i = offset - 1; i >= 1; i--) {
            if (text.substring(i - 1, i + 1) === '{{') {
                lastDoubleBraceOpen = i - 1;
                break;
            }
            if (text.substring(i - 1, i + 1) === '}}') {
                lastDoubleBraceClose = i - 1;
                break;
            }
        }
        if (lastDoubleBraceOpen > lastDoubleBraceClose) {
            return { inside: true, type: 'double' };
        }
        // Check for single braces - allow whitespace after {
        let lastSingleBraceOpen = -1;
        let lastSingleBraceClose = -1;
        for (let i = offset - 1; i >= 0; i--) {
            if (text[i] === '{' && (i === 0 || text[i - 1] !== '{') && (i === text.length - 1 || text[i + 1] !== '{')) {
                lastSingleBraceOpen = i;
                break;
            }
            if (text[i] === '}' && (i === 0 || text[i - 1] !== '}') && (i === text.length - 1 || text[i + 1] !== '}')) {
                lastSingleBraceClose = i;
                break;
            }
        }
        if (lastSingleBraceOpen > lastSingleBraceClose) {
            return { inside: true, type: 'single' };
        }
        return { inside: false, type: null };
    }
    // Check if we're inside braces (for PHP expressions) - with whitespace support
    const braceContext = isInsideBracesWithWhitespace(document, position);
    const hasCursorDollar = 
    // Check if user is typing a variable (starts with $)
    charBeforeCursor === '$' || (wordAtPosition.startsWith('$') && wordAtPosition.length > 1);
    // Add property completions as variables
    for (const property of properties) {
        completions.push({
            label: `$${property.name}`,
            kind: node_1.CompletionItemKind.Variable,
            detail: `${property.type} - Component Property`,
            documentation: {
                kind: 'markdown',
                value: `**Type:** \`${property.type}\`\n\nComponent property from PHP class`
            },
            // if $ - Just insert the name part since $ is already typed
            insertText: hasCursorDollar ? property.name : `$${property.name}`,
            // filterText: `$${property.name}`
        });
    }
    // Add method completions as functions
    for (const method of methods) {
        const paramString = method.parameters
            .map(p => `${p.type} $${p.name}${p.hasDefault ? '?' : ''}`)
            .join(', ');
        const paramInsert = method.parameters.filter(p => !p.hasDefault).map((p, index) => `\${${index + 1}:$${p.name}}`).join(', ');
        // Also add completion with parentheses for full method signature
        completions.push({
            label: `${method.name}()`,
            kind: node_1.CompletionItemKind.Function,
            detail: `${method.returnType} - Component Method`,
            documentation: {
                kind: 'markdown',
                value: `**Returns:** \`${method.returnType}\`\n\n**Parameters:** ${paramString || 'none'}\n\nComponent method from PHP class`
            },
            insertText: braceContext.inside ? `${method.name}(${paramInsert})` : `{ ${method.name}(${paramInsert}) }`,
            insertTextFormat: 2 // Snippet format
        });
    }
    // Check if we're inside a tag (for component suggestions)
    if (isInsideTag(document, position)) {
        for (const componentName of components) {
            completions.push({
                label: componentName,
                kind: node_1.CompletionItemKind.Class,
                detail: 'Viewi Component',
                documentation: {
                    kind: 'markdown',
                    value: `Viewi component \`${componentName}\``
                },
                insertText: componentName
            });
        }
        // build-int virtual tags
        for (const componentName of builtInControlTags) {
            completions.push({
                label: componentName,
                kind: node_1.CompletionItemKind.Class,
                detail: 'Viewi Control Tag',
                documentation: {
                    kind: 'markdown',
                    value: `Viewi built-in \`${componentName}\``
                },
                insertText: componentName,
            });
        }
    }
    else if (!braceContext.inside) {
        for (const componentName of components) {
            completions.push({
                label: componentName,
                kind: node_1.CompletionItemKind.Class,
                detail: 'Viewi Component',
                documentation: {
                    kind: 'markdown',
                    value: `Viewi component \`${componentName}\``
                },
                insertText: `<${componentName}>$0</${componentName}>`,
                insertTextFormat: 2, // Snippet format
                filterText: componentName
            });
        }
        // build-int virtual tags
        for (const componentName of builtInControlTags) {
            completions.push({
                label: componentName,
                kind: node_1.CompletionItemKind.Class,
                detail: 'Viewi Control Tag',
                documentation: {
                    kind: 'markdown',
                    value: `Viewi built-in \`${componentName}\``
                },
                insertText: `<${componentName}>$0</${componentName}>`,
                insertTextFormat: 2, // Snippet format
                filterText: componentName
            });
        }
    }
    return completions;
});
// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item) => {
    return item;
});
connection.onDefinition(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null;
    }
    const position = params.position;
    const word = getWordAtPosition(document, position);
    if (!word) {
        return null;
    }
    const component = await viewiParser.getComponentForHtmlFile(document.uri);
    if (!component) {
        return null;
    }
    const memberName = word.startsWith('$') ? word.substring(1) : word;
    const member = component.properties.find(p => p.name === memberName) ||
        component.methods.find(m => m.name === memberName);
    if (!member) {
        // check component tag
        const tagComponent = viewiParser.getComponent(word);
        if (tagComponent) {
            const phpDocument = await vscode_languageserver_textdocument_1.TextDocument.create(tagComponent.phpFile, 'php', 1, await fs.promises.readFile(tagComponent.phpFile, 'utf-8'));
            const regex = new RegExp(`${word}\\b`);
            const match = regex.exec(phpDocument.getText());
            if (match) {
                const startPosition = phpDocument.positionAt(match.index);
                const endPosition = phpDocument.positionAt(match.index + match[0].length);
                return {
                    uri: tagComponent.phpFile,
                    range: {
                        start: startPosition,
                        end: endPosition
                    }
                };
            }
        }
        return null;
    }
    const phpDocument = await vscode_languageserver_textdocument_1.TextDocument.create(component.phpFile, 'php', 1, await fs.promises.readFile(component.phpFile, 'utf-8'));
    const regex = new RegExp(`((public|protected|private)\\s+)?(static\\s+)?(function\\s+)?([\\w\\d_]+\\s+)?\\$?${member.name}\\b`);
    const match = regex.exec(phpDocument.getText());
    if (match) {
        const startPosition = phpDocument.positionAt(match.index);
        const endPosition = phpDocument.positionAt(match.index + match[0].length);
        return {
            uri: component.phpFile,
            range: {
                start: startPosition,
                end: endPosition
            }
        };
    }
    return null;
});
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();
//# sourceMappingURL=server.js.map