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
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
let client;
function activate(context) {
    console.log('Viewi Extension is activating');
    // The server is implemented in node
    const serverModule = context.asAbsolutePath(path.join('server', 'dist', 'server.js'));
    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] }
        }
    };
    // Options to control the language client
    const clientOptions = {
        // Register the server for HTML and PHP documents
        documentSelector: [
            { scheme: 'file', language: 'viewi' },
            { scheme: 'file', language: 'html' },
            { scheme: 'file', language: 'php' }
        ],
        synchronize: {
            // Notify the server about file changes to '.html' and '.php' files contained in the workspace
            fileEvents: vscode_1.workspace.createFileSystemWatcher('**/*.{html,php}')
        },
        // Pass workspace configuration to server
        initializationOptions: {
            settings: vscode_1.workspace.getConfiguration('viewi')
        }
    };
    // Create the language client and start the client.
    client = new node_1.LanguageClient('viewiLanguageServer', 'Viewi Language Server', serverOptions, clientOptions);
    // Start the client. This will also launch the server
    client.start();
    // Register additional features
    registerAdditionalFeatures(context);
}
function registerAdditionalFeatures(context) {
    // Register a command to refresh component cache
    const refreshCommand = vscode_1.commands.registerCommand('viewi.refreshComponents', () => {
        if (client) {
            client.sendNotification('viewi/refreshComponents');
            vscode_1.window.showInformationMessage('Viewi components cache refreshed');
        }
    });
    context.subscriptions.push(refreshCommand);
    // Watch for configuration changes
    const configWatcher = vscode_1.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('viewi')) {
            if (client) {
                client.sendNotification('workspace/didChangeConfiguration', {
                    settings: vscode_1.workspace.getConfiguration('viewi')
                });
            }
        }
    });
    // Watch for file changes to refresh component cache
    const fileWatcher = vscode_1.workspace.createFileSystemWatcher('**/*.{php,html}');
    fileWatcher.onDidCreate(() => {
        if (client) {
            client.sendNotification('viewi/refreshComponents');
        }
    });
    fileWatcher.onDidDelete(() => {
        if (client) {
            client.sendNotification('viewi/refreshComponents');
        }
    });
    fileWatcher.onDidChange(() => {
        if (client) {
            client.sendNotification('viewi/refreshComponents');
        }
    });
    context.subscriptions.push(configWatcher, fileWatcher);
}
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
//# sourceMappingURL=extension.js.map