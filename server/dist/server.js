"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
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
    return result;
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
        viewiParser.clearCache();
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
    }
    // Check if user is typing a variable (starts with $)
    if (charBeforeCursor === '$' || (wordAtPosition.startsWith('$') && wordAtPosition.length > 1)) {
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
                insertText: property.name, // Just insert the name part since $ is already typed
                filterText: `$${property.name}`
            });
        }
    }
    // Check if we're inside braces (for PHP expressions) - with whitespace support
    const braceContext = isInsideBracesWithWhitespace(document, position);
    if (braceContext.inside) {
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
                insertText: ` $${property.name} `
            });
        }
        // Add method completions as functions
        for (const method of methods) {
            const paramString = method.parameters
                .map(p => `${p.type} $${p.name}${p.hasDefault ? '?' : ''}`)
                .join(', ');
            const paramInsert = method.parameters.filter(p => !p.hasDefault).map((p, index) => `\${${index + 1}:$${p.name}}`).join(', ');
            // Add completion for method name without parentheses (for partial typing)
            completions.push({
                label: method.name,
                kind: node_1.CompletionItemKind.Function,
                detail: `${method.returnType} - Component Method`,
                documentation: {
                    kind: 'markdown',
                    value: `**Returns:** \`${method.returnType}\`\n\n**Parameters:** ${paramString || 'none'}\n\nComponent method from PHP class`
                },
                insertText: ` ${method.name}(${paramInsert}) `,
                insertTextFormat: 2, // Snippet format
                filterText: method.name
            });
            // Also add completion with parentheses for full method signature
            completions.push({
                label: `${method.name}()`,
                kind: node_1.CompletionItemKind.Function,
                detail: `${method.returnType} - Component Method`,
                documentation: {
                    kind: 'markdown',
                    value: `**Returns:** \`${method.returnType}\`\n\n**Parameters:** ${paramString || 'none'}\n\nComponent method from PHP class`
                },
                insertText: ` ${method.name}(${paramInsert}) `,
                insertTextFormat: 2 // Snippet format
            });
        }
    }
    // Check if user just typed '{' to suggest expression templates
    if (lineText.endsWith('{') && !lineText.endsWith('{{')) {
        // Suggest single brace expressions for properties
        for (const property of properties) {
            completions.push({
                label: `{$${property.name}}`,
                kind: node_1.CompletionItemKind.Snippet,
                detail: 'Single Brace Expression',
                documentation: {
                    kind: 'markdown',
                    value: `Insert \`$${property.name}\` as a single-brace expression`
                },
                insertText: ` $${property.name} }`
            });
        }
        // Suggest single brace expressions for methods
        for (const method of methods) {
            const paramInsert = method.parameters.filter(p => !p.hasDefault).map((p, index) => `\${${index + 1}:$${p.name}}`).join(', ');
            completions.push({
                label: `{${method.name}()}`,
                kind: node_1.CompletionItemKind.Snippet,
                detail: 'Single Brace Method Call',
                documentation: {
                    kind: 'markdown',
                    value: `Call \`${method.name}()\` as a single-brace expression`
                },
                insertText: ` ${method.name}(${paramInsert}) }`,
                insertTextFormat: 2 // Snippet format
            });
        }
        // Suggest double brace expressions for properties
        for (const property of properties) {
            completions.push({
                label: `{{$${property.name}}}`,
                kind: node_1.CompletionItemKind.Snippet,
                detail: 'Double Brace Expression',
                documentation: {
                    kind: 'markdown',
                    value: `Insert \`$${property.name}\` as a double-brace expression`
                },
                insertText: `{ $${property.name} }}`
            });
        }
    }
    // Always provide variable and component suggestions anywhere in HTML
    // Add property completions as variables for general use
    for (const property of properties) {
        completions.push({
            label: `$${property.name}`,
            kind: node_1.CompletionItemKind.Variable,
            detail: `${property.type} - Component Property`,
            documentation: {
                kind: 'markdown',
                value: `**Type:** \`${property.type}\`\n\nComponent property from PHP class`
            },
            insertText: `$${property.name}`
        });
    }
    if (!braceContext.inside) {
        // Add component suggestions anywhere (not just inside tags) - suggest with opening bracket
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
    }
    return completions;
});
// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item) => {
    return item;
});
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();
//# sourceMappingURL=server.js.map