import {
    Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { BraceType } from "./braceType";
import { CodeRegion } from "./codeRegion";

export function isInsideCodeRegion(document: TextDocument, position: Position): CodeRegion {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Check for double braces first - allow whitespace after {{
    let canBrace = true;
    let canEvent = true;
    let insideCode = false;
    let attribute = false;
    let insideAttribute = false;
    let insideAttributeName = false;
    let insideTag = false;
    let type: BraceType = null;
    let tagName: string | undefined = undefined;
    let canTag: boolean = true;
    let catchBraces: boolean = true;
    let catchTag: boolean = true;
    let catchEvent: boolean = true;
    let catchAttributeValue: boolean = true;
    let catchAttributeName: boolean = true;


    //  {{ }} <tag attrName=" attrValue $test " (event)="myEvent($event)"> text


    for (let i = offset - 1; i >= 0; i--) {
        if (catchBraces) {
            if (text[i] === '}' || text[i] === '>') {
                catchBraces = false;
            } else if (catchBraces && text[i] === '{') {
                type = 'single';
                insideCode = true;
                if (i > 0 && text[i - 1] === '{') {
                    type = 'double';
                }
                catchBraces = false;
            }
        }

        if (catchTag) {
            if (text[i] === '>') {
                catchTag = false;
            } else {
                // looking for tag name, attribute name and value or event
                if (catchAttributeName && (text[i] === ' ' || text[i] === '\n' || text[i] === '\r')) {
                    // attributeName
                    insideAttributeName = true;
                    catchAttributeName = false;
                } else if (catchAttributeValue && text[i] === '"') {
                    if (i > 0 && text[i - 1] === '=') {
                        insideAttributeName = false;
                        insideAttribute = true;
                        catchAttributeValue = false;
                        catchAttributeName = false;
                        type = 'attribute';
                        if (i > 1 && text[i - 2] === ')') {
                            // event (click)="onClick"
                            type = 'event';
                            break;
                        }

                    }
                    catchAttributeValue = false;
                } else if (text[i] === '<') {
                    // collect tag name
                    tagName = '';
                    for (let j = i + 1; j < offset; j++) {
                        if (text[j] === ' ' || text[j] === '>' || text[j] === '"' || text[j] === '\n' || text[j] === '\r') {
                            break;
                        }
                        tagName += text[j];
                    }
                    insideTag = !insideAttributeName && !insideAttribute;
                    catchTag = false;
                }
                // end of tag looking
            }
        }
        if (!catchBraces && !catchTag) {
            break;
        }
    }
    if (!tagName) {
        insideAttributeName = false;
        insideAttribute = false;
    }
    return { insideCode, insideAttribute, insideAttributeName, insideTag, tagName, type };
}