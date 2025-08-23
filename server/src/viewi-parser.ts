import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { systemMethods } from './systemMethods';

export interface ViewiComponent {
  ready: boolean;
  name: string;
  extendClass: string | null;
  phpFile: string;
  htmlFile: string | null;
  properties: ViewiProperty[];
  methods: ViewiMethod[];
}

export interface ViewiProperty {
  name: string;
  className: string;
  type: string;
  visibility: 'public' | 'private' | 'protected';
  isStatic: boolean;
}

export interface ViewiMethod {
  name: string;
  className: string;
  returnType: string;
  visibility: 'public' | 'private' | 'protected';
  isStatic: boolean;
  parameters: ViewiParameter[];
}

export interface ViewiParameter {
  name: string;
  type: string;
  hasDefault: boolean;
}

export class ViewiParser {
  private allComponentsCache: Map<string, ViewiComponent> = new Map();
  private phpFileToComponent: Map<string, string> = new Map();
  private fileMtimes: Map<string, number> = new Map();
  private workspaceRoot: string;
  private searchPaths: string[] = ['./'];
  private isScanning = false;
  private phpFilesByBaseName: { [key: string]: string } = {};

  constructor(workspaceRoot: string, searchPaths?: string[]) {
    this.workspaceRoot = workspaceRoot;
    if (searchPaths) {
      this.searchPaths = searchPaths;
    }
  }

  public setSearchPaths(paths: string[]): void {
    if (JSON.stringify(paths) !== JSON.stringify(this.searchPaths)) {
      this.searchPaths = paths;
      this.clearCache();
      this.getAllComponents();
    }
  }

  public clearCache(): void {
    this.allComponentsCache.clear();
    this.phpFileToComponent.clear();
    this.fileMtimes.clear();
  }

  public async updateComponent(filePath: string): Promise<void> {
    const phpFilePath = filePath.endsWith('.php') ? filePath : filePath.replace(/\.html$/, '.php');
    const htmlFilePath = phpFilePath.replace(/\.php$/, '.html');

    if (fs.existsSync(phpFilePath) && fs.existsSync(htmlFilePath)) {
      const component = await this.parseComponent(phpFilePath, htmlFilePath);
      component && await this.buildComponent(component);
    }
  }

  public getComponent(componentName: string): ViewiComponent | null {
    if (componentName && this.allComponentsCache.has(componentName)) {
      return this.allComponentsCache.get(componentName) || null;
    }
    return null;
  }

  public removeComponentByFile(filePath: string): void {
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

  public async getAllComponents(): Promise<ViewiComponent[]> {
    if (this.allComponentsCache.size === 0 && !this.isScanning) {
      this.isScanning = true;
      console.log('Initial component scan started.');
      for (const searchPath of this.searchPaths) {
        const fullPath = path.join(this.workspaceRoot, searchPath);
        if (fs.existsSync(fullPath)) {
          await this.scanDirectory(fullPath);
        }
      }
      await this.buildMeta();
      this.isScanning = false;
      console.log(`Initial component scan finished. Found ${this.allComponentsCache.size} components.`);
    }
    return Array.from(this.allComponentsCache.values());
  }

  private async buildMeta() {
    for (const key of this.allComponentsCache.keys()) {
      const component = this.allComponentsCache.get(key)!;
      await this.buildComponent(component);
    }
  }

  private async buildComponent(component: ViewiComponent) {
    if (component.ready) {
      return;
    }
    component.ready = true;
    // collect extends
    if (component.extendClass) {
      let extendedClass = this.allComponentsCache.get(component.extendClass);
      if (!extendedClass) {
        if (component.extendClass in this.phpFilesByBaseName) {
          await this.parseComponent(this.phpFilesByBaseName[component.extendClass], null);
        }
        extendedClass = this.allComponentsCache.get(component.extendClass);
      } else if (!extendedClass.ready) {
        this.buildComponent(extendedClass);
      }
      if (extendedClass) {
        // combine properties and methods
        for (let property of extendedClass.properties) {
          if (!component.properties.some(x => x.name === property.name)) {
            component.properties.push(property);
          }
        }
        for (let method of extendedClass.methods) {
          if (!component.methods.some(x => x.name === method.name)) {
            component.methods.push(method);
          }
        }
      }
    }
  }

  public async getComponentForHtmlFile(htmlFilePath: string): Promise<ViewiComponent | null> {
    const phpFilePath = htmlFilePath.replace('file://', '').replace(/\.html$/, '.php');
    const componentName = this.phpFileToComponent.get(phpFilePath);
    if (componentName && this.allComponentsCache.has(componentName)) {
      // Check mtime to see if we need to refresh
      const phpStat = await fs.promises.stat(phpFilePath);
      if (this.fileMtimes.get(phpFilePath) === phpStat.mtimeMs) {
        return this.allComponentsCache.get(componentName)!;
      }
    }

    // If not in cache or outdated, parse it
    if (fs.existsSync(phpFilePath)) {
      return this.parseComponent(phpFilePath, htmlFilePath.replace(/\.php$/, '.html'));
    }

    return null;
  }

  public async getComponentTags(documentUri: string): Promise<string[]> {
    const components = await this.getAllComponents();
    return components.map(c => c.name);
  }

  public async getPhpVariablesAndMethods(documentUri: string): Promise<{
    properties: ViewiProperty[];
    methods: ViewiMethod[];
  }> {
    const filePath = URI.parse(documentUri).fsPath;
    const phpFile = filePath.replace(/\.html$/, '.php');
    const component = await this.getComponentForHtmlFile(filePath);
    // console.log([filePath, component, component?.methods, component?.properties]);

    if (!component) {
      return { properties: [], methods: [] };
    }

    return {
      properties: component.properties.filter(p => p.visibility === 'public'),
      methods: component.methods.filter(m => m.visibility === 'public' && !systemMethods.includes(m.name))
    };
  }

  private async scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.php')) {
          this.phpFilesByBaseName[path.parse(entry.name).name] = fullPath;
          const htmlFile = fullPath.replace(/\.php$/, '.html');
          // console.log([entry, fullPath]);
          if (fs.existsSync(htmlFile)) {
            await this.parseComponent(fullPath, htmlFile);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }
  }

  private async parseComponent(phpFile: string, htmlFile: string | null): Promise<ViewiComponent | null> {
    try {
      const phpStat = await fs.promises.stat(phpFile);
      const htmlStat = htmlFile ? await fs.promises.stat(htmlFile) : null;

      const lastPhpMtime = this.fileMtimes.get(phpFile);
      const lastHtmlMtime = htmlFile ? this.fileMtimes.get(htmlFile) : null;

      const componentNameFromCache = this.phpFileToComponent.get(phpFile);
      if (
        componentNameFromCache &&
        this.allComponentsCache.has(componentNameFromCache) &&
        lastPhpMtime === phpStat.mtimeMs &&
        (!htmlFile || lastHtmlMtime === htmlStat!.mtimeMs)
      ) {
        return this.allComponentsCache.get(componentNameFromCache)!;
      }

      const content = await fs.promises.readFile(phpFile, 'utf-8');
      const [className, extendClass] = this.extractClassName(content);

      if (!className) {
        return null;
      }

      const properties = this.extractProperties(content, className);
      const methods = this.extractMethods(content, className);

      const component: ViewiComponent = {
        ready: false,
        name: className,
        extendClass,
        phpFile,
        htmlFile,
        properties,
        methods
      };
      this.allComponentsCache.set(className, component);
      this.phpFileToComponent.set(phpFile, className);
      this.fileMtimes.set(phpFile, phpStat.mtimeMs);
      htmlFile && this.fileMtimes.set(htmlFile, htmlStat!.mtimeMs);

      return component;
    } catch (error) {
      return null;
    }
  }

  private extractClassName(content: string): [string | null, string | null] {
    // Match class declaration, potentially with extends
    const classMatch = content.match(/class\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+extends\s+([A-Za-z_][A-Za-z0-9_\\]*))?/);
    return classMatch ? [classMatch[1], classMatch?.[2]] : [null, null];
  }

  private extractProperties(content: string, className: string): ViewiProperty[] {
    const properties: ViewiProperty[] = [];

    // Match property declarations: visibility [static] [type] $name
    const propertyRegex = /(public|private|protected)\s+(static\s+)?(?:([A-Za-z_][A-Za-z0-9_]*|\||\[\]|\?)*\s+)?\$([A-Za-z_][A-Za-z0-9_]*)/g;

    let match;
    while ((match = propertyRegex.exec(content)) !== null) {
      const visibility = match[1] as 'public' | 'private' | 'protected';
      const isStatic = !!match[2];
      const type = match[3] || 'mixed';
      const name = match[4];

      properties.push({
        name,
        className,
        type,
        visibility,
        isStatic
      });
    }

    return properties;
  }

  private extractMethods(content: string, className: string): ViewiMethod[] {
    const methods: ViewiMethod[] = [];

    // Match method declarations: [visibility] [static] function name(params): returnType
    // If no visibility is specified, default to public
    const methodRegex = /(?:(public|private|protected)\s+)?(static\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g;

    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      const visibility = (match[1] as 'public' | 'private' | 'protected') || 'public'; // Default to public if not specified
      const isStatic = !!match[2];
      const name = match[3];
      const paramString = match[4] || '';
      const returnType = match[5] ? match[5].trim() : 'void';

      const parameters = this.parseParameters(paramString);

      methods.push({
        name,
        className,
        returnType,
        visibility,
        isStatic,
        parameters
      });
    }

    return methods;
  }

  private parseParameters(paramString: string): ViewiParameter[] {
    if (!paramString.trim()) {
      return [];
    }

    const parameters: ViewiParameter[] = [];
    const params = paramString.split(',');

    for (const param of params) {
      const trimmed = param.trim();
      if (!trimmed) continue;

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
