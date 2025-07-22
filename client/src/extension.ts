import * as path from 'path';
import { workspace, ExtensionContext, languages, window, commands } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // The server is implemented in node
  const serverModule = context.asAbsolutePath(path.join('server', 'dist', 'server.js'));
  
  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] }
    }
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for HTML and PHP documents
    documentSelector: [      
      { scheme: 'file', language: 'viewi' },
      { scheme: 'file', language: 'html' },
      { scheme: 'file', language: 'php' }
    ],
    synchronize: {
      // Notify the server about file changes to '.html' and '.php' files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher('**/*.{html,php}')
    },
    // Pass workspace configuration to server
    initializationOptions: {
      settings: workspace.getConfiguration('viewi')
    }
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    'viewiLanguageServer',
    'Viewi Language Server',
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  client.start();

  // Register additional features
  registerAdditionalFeatures(context);
}

function registerAdditionalFeatures(context: ExtensionContext) {
  // Register a command to refresh component cache
  const refreshCommand = commands.registerCommand('viewi.refreshComponents', () => {
    if (client) {
      client.sendNotification('viewi/refreshComponents');
      window.showInformationMessage('Viewi components cache refreshed');
    }
  });

  context.subscriptions.push(refreshCommand);

  // Watch for configuration changes
  const configWatcher = workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('viewi')) {
      if (client) {
        client.sendNotification('workspace/didChangeConfiguration', {
          settings: workspace.getConfiguration('viewi')
        });
      }
    }
  });

  // Watch for file changes to refresh component cache
  const fileWatcher = workspace.createFileSystemWatcher('**/*.{php,html}');
  
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

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
