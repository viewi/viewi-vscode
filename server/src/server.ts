import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  Position,
} from 'vscode-languageserver/node';
import * as fs from 'fs';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { ViewiParser } from './viewi-parser';
import { isInsideCodeRegion } from './isInsideCodeRegion';

// Create a connection for the server, using Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

interface ViewiSettings {
  enableAutocompletion: boolean;
  componentSearchPaths: string[];
}

const defaultSettings: ViewiSettings = {
  enableAutocompletion: true,
  componentSearchPaths: ['.']
};

const builtInControlTags = ['slot', 'slotContent', 'template'];

let viewiParser: ViewiParser;
let settings: ViewiSettings = defaultSettings;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  // Initialize the parser with workspace root
  const workspaceRoot = params.workspaceFolders?.[0]?.uri || params.rootUri || '';
  const workspacePath = workspaceRoot.replace('file://', '');

  // Get initial settings
  const initSettings = params.initializationOptions?.settings || defaultSettings;
  viewiParser = new ViewiParser(workspacePath, initSettings.componentSearchPaths);

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
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
    result.capabilities.workspace!.workspaceFolders = {
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
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
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
  } else {
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
function getWordAtPosition(document: TextDocument, position: Position): string {
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

function isInsideTag(document: TextDocument, position: Position): boolean {
  const text = document.getText();
  const offset = document.offsetAt(position);

  let lastOpenTag = text.lastIndexOf('<', offset);
  let lastCloseTag = text.lastIndexOf('>', offset);

  return lastOpenTag > lastCloseTag;
}

function getLineTextBeforePosition(document: TextDocument, position: Position): string {
  return document.getText({
    start: { line: position.line, character: 0 },
    end: position
  });
}

// File system watchers
documents.onDidSave(change => {
  if (viewiParser) {
    const filePath = URI.parse(change.document.uri).fsPath;
    if (filePath.endsWith('.php') || filePath.endsWith('.html')) {
      console.log(`File saved, updating component: ${filePath}`);
      viewiParser.updateComponent(filePath);
    }
  }
});

connection.workspace.onDidCreateFiles(params => {
  if (viewiParser) {
    for (const file of params.files) {
      const filePath = URI.parse(file.uri).fsPath;
      console.log(`File created, updating component: ${filePath}`);
      viewiParser.updateComponent(filePath);
    }
  }
});

connection.workspace.onDidDeleteFiles(params => {
  if (viewiParser) {
    for (const file of params.files) {
      const filePath = URI.parse(file.uri).fsPath;
      console.log(`File deleted, removing component: ${filePath}`);
      viewiParser.removeComponentByFile(filePath);
    }
  }
});

connection.onCompletion(
  async (_textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
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

    const completions: CompletionItem[] = [];
    const { properties, methods } = await viewiParser.getPhpVariablesAndMethods(document.uri);
    const components = await viewiParser.getComponentTags(document.uri);

    const text = document.getText();
    const offset = document.offsetAt(position);
    const charBeforeCursor = offset > 0 ? text[offset - 1] : '';

    // Check if we're inside braces (for PHP expressions) - with whitespace support
    const braceContext = isInsideCodeRegion(document, position);
    const insideEvent = braceContext.type === 'event';
    console.log(['braceContext', braceContext]);
    const hasCursorDollar =
      // Check if user is typing a variable (starts with $)
      charBeforeCursor === '$' || (wordAtPosition.startsWith('$') && wordAtPosition.length > 1);

    if (!insideEvent) {
      // Add property completions as variables
      for (const property of properties) {
        completions.push({
          label: `$${property.name}`,
          kind: CompletionItemKind.Variable,
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
    }

    // component props
    if (braceContext.insideTag && braceContext.tagName) {
      const propsTargetComponent = viewiParser.getComponent(braceContext.tagName);
      if (propsTargetComponent) {

        // TODO: suggest events
        const props = propsTargetComponent.properties.filter(p => p.visibility === 'public');
        for (const property of props) {
          completions.push({
            label: `${property.name}`,
            kind: CompletionItemKind.Variable,
            detail: `${property.type} - Component Prop`,
            documentation: {
              kind: 'markdown',
              value: `**Type:** \`${property.type}\`\n\nComponent property from PHP class`
            },
            // if $ - Just insert the name part since $ is already typed
            insertText: `${property.name}="$0"`,
            insertTextFormat: 2, // Snippet format
            sortText: `#${property.name}`
            // filterText: `$${property.name}`
          });
        }
      }
    }

    // Add method completions as functions
    for (const method of methods) {
      const paramString = method.parameters
        .map(p => `${p.type} $${p.name}${p.hasDefault ? '?' : ''}`)
        .join(', ');

      const paramInsert = method.parameters.filter(p => !p.hasDefault).map((p, index) => `\${${index + 1}:$${p.name}}`).join(', ');

      if (insideEvent) {
        // Also add completion with parentheses for full method signature
        completions.push({
          label: `${method.name}($event)`,
          kind: CompletionItemKind.Function,
          detail: `${method.returnType} - Component Method`,
          documentation: {
            kind: 'markdown',
            value: `**Returns:** \`${method.returnType}\`\n\n**Parameters:** ${paramString || 'none'}\n\nComponent method from PHP class`
          },
          insertText: `${method.name}($event)`,
          insertTextFormat: 1,
          sortText: `0${method.name}`
        });
        completions.push({
          label: `${method.name}`,
          kind: CompletionItemKind.Function,
          detail: `${method.returnType} - Component Method`,
          documentation: {
            kind: 'markdown',
            value: `**Returns:** \`${method.returnType}\`\n\n**Parameters:** ${paramString || 'none'}\n\nComponent method from PHP class`
          },
          insertText: `${method.name}`,
          insertTextFormat: 1,
          sortText: `0${method.name}`
        });
      } else {
        // Also add completion with parentheses for full method signature
        completions.push({
          label: `${method.name}()`,
          kind: CompletionItemKind.Function,
          detail: `${method.returnType} - Component Method`,
          documentation: {
            kind: 'markdown',
            value: `**Returns:** \`${method.returnType}\`\n\n**Parameters:** ${paramString || 'none'}\n\nComponent method from PHP class`
          },
          insertText: braceContext.insideCode ? `${method.name}(${paramInsert})` : `{ ${method.name}(${paramInsert}) }`,
          insertTextFormat: 2, // Snippet format
          sortText: `0${method.name}`
        });
      }
    }

    // Check if we're inside a tag (for component suggestions)
    if (!braceContext.insideCode && !braceContext.insideAttribute) {
      if (isInsideTag(document, position)) {
        for (const componentName of components) {
          completions.push({
            label: componentName,
            kind: CompletionItemKind.Class,
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
            kind: CompletionItemKind.Class,
            detail: 'Viewi Control Tag',

            documentation: {
              kind: 'markdown',
              value: `Viewi built-in \`${componentName}\``
            },
            insertText: componentName,
          });
        }
      } else {
        for (const componentName of components) {
          completions.push({
            label: componentName,
            kind: CompletionItemKind.Class,
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
            kind: CompletionItemKind.Class,
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
    }
    return completions;
  }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    return item;
  }
);

connection.onDefinition(
  async (params): Promise<any> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }
    const position = params.position;
    const word = getWordAtPosition(document, position);
    if (!word) {
      return null;
    }

    const braceContext = isInsideCodeRegion(document, position);
    
    const component = await viewiParser.getComponentForHtmlFile(document.uri);
    if (!component) {
      return null;
    }

    const memberName = word.startsWith('$') ? word.substring(1) : word;
    const member =
      component.properties.find(p => p.name === memberName) ||
      component.methods.find(m => m.name === memberName);

    if (!member) {
      // check component tag
      const tagComponent = viewiParser.getComponent(word);
      if (tagComponent) {
        const phpDocument = await TextDocument.create(tagComponent.phpFile, 'php', 1, await fs.promises.readFile(tagComponent.phpFile, 'utf-8'));
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

    const phpDocument = await TextDocument.create(component.phpFile, 'php', 1, await fs.promises.readFile(component.phpFile, 'utf-8'));
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
  }
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
