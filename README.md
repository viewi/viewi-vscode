# Viewi Components VSCode Extension

A comprehensive VSCode extension that provides syntax highlighting and intelligent autocompletion for Viewi PHP/HTML components.

## Features

### 1. Syntax Highlighting
- **PHP expressions in HTML**: Highlights PHP code within `{` `}` and `{{` `}}` braces
- **Viewi components**: Special highlighting for component tags (PascalCase tags)
- **PHP variables and functions**: Proper syntax highlighting for PHP expressions in HTML templates

### 2. Component Autocompletion
- **Component tags**: Autocomplete component names when typing `<` in HTML files
- **Cross-project discovery**: Automatically finds all Viewi components across the project

### 3. PHP Expression Autocompletion
- **Property completion**: Autocomplete public properties from the corresponding PHP component class
- **Method completion**: Autocomplete public methods with parameter hints
- **Trigger on `{`**: Automatically suggests expressions when typing opening braces
- **Context-aware**: Only shows relevant completions based on the current component

### 4. Intelligent Pairing
- Automatically detects PHP/HTML component pairs (same base name, same location)
- Links HTML templates with their corresponding PHP component classes

## How It Works

### Component Structure
Viewi components consist of two files:
- `ComponentName.php` - Contains the PHP class with the component logic
- `ComponentName.html` - Contains the HTML template

### Example Component

**HomePage.php**:
```php
<?php

namespace Components\Views\Home;

use Viewi\Components\BaseComponent;

class HomePage extends BaseComponent
{
    public string $title = 'Viewi - Reactive application for PHP';
    public bool $isLoading = false;
    
    function getName(): string
    {
        return 'HomePage';
    }
    
    function getTitle(): string
    {
        return $this->title;
    }
}
```

**HomePage.html**:
```html
<div class="home-page">
    <h1>$title</h1>
    <p>Loading: {$isLoading ? 'Yes' : 'No'}</p>
    <p>Component: {getName()}</p>
    <p>Title: {{getTitle()}}</p>
</div>
```

### Usage in Other Templates
```html
<div>
    <MyButton text="Save" />
    <MyButton text="Cancel" disabled="true" />
</div>
```

## Configuration

The extension can be configured through VSCode settings:

```json
{
    "viewi.enableAutocompletion": true,
    "viewi.componentSearchPaths": ["."]
}
```

### Settings

- **`viewi.enableAutocompletion`** (boolean, default: `true`): Enable/disable autocompletion features
- **`viewi.componentSearchPaths`** (array, default: `["src", "components"]`): Directories to search for Viewi components

## Commands

- **`Viewi: Refresh Components`**: Manually refresh the component cache

## Language Support

The extension enhances the built-in HTML language support in VS Code to provide syntax highlighting and autocompletion for Viewi components and expressions.

### Trigger Characters
Autocompletion is triggered by:
- `<` - For component tag suggestions
- `{` - For PHP expression suggestions  
- `$` - For variable suggestions anywhere in HTML files

### Autocompletion Scenarios

1. **Component Tags**: Type `<My` → suggests `MyButton`, `HomePage`, etc.
2. **Variables anywhere**: Type `$` → suggests `$title`, `$isLoading`, etc.
3. **Variables in braces**: Type `{$` → suggests `$title`, `$isLoading`, etc.
4. **Methods in braces**: Type `{get` → suggests `getName()`, `getTitle()`, etc.
5. **Expression templates**: Type `{` → suggests `{$title}`, `{{$title}}`, `{getName()}`, etc.

## Installation

1. Install the extension from the VSCode marketplace
2. Open a project containing Viewi components
3. The extension will automatically detect and index your components

## Development

### Building from Source
```bash
npm install
npm run compile
```

### Project Structure
```
├── client/                 # VSCode extension client
│   ├── src/
│   │   └── extension.ts   # Main extension entry point
│   └── package.json
├── server/                 # Language server
│   ├── src/
│   │   ├── server.ts      # Language server implementation
│   │   └── viewi-parser.ts # Component parsing logic
│   └── package.json
├── syntaxes/              # Syntax highlighting rules
│   └── viewi-html.tmLanguage.json
└── package.json           # Extension manifest
```

## Requirements

- VSCode 1.80.0 or higher
- Node.js for development

## Known Issues

- Component discovery is currently limited to the configured search paths
- PHP parsing is regex-based and may not handle all edge cases

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT License
