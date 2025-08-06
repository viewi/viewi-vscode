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
    let insideTag = false;
    let type: BraceType = null;
    let tagName: string | undefined = undefined;

    for (let i = offset - 1; i >= 0; i--) {
        if (text[i] === '}' || text[i] === '>') {
            canBrace = false;
            break;
        } else if (canBrace && text[i] === '{') {
            type = 'single';
            insideCode = true;
            if (i > 0 && text[i - 1] === '{') {
                type = 'double';
            }
            break;
        } else if (text[i] === '"') {
            if (i > 0 && text[i - 1] === '=') {
                if (attribute) { // we are passed the attribute
                    canEvent = false;
                }
                if (canEvent) {
                    // attribute
                    insideAttribute = true;
                    type = 'attribute';
                    if (i > 1 && text[i - 2] === ')') {
                        // event (click)="onClick"
                        type = 'event';
                        break;
                    }
                }
            }
            attribute = !attribute;
            if (!attribute) {
                canEvent = false;
            }
        } else if (text[i] === '<') {
            insideTag = !attribute && text[offset - 1] === ' ';
            if (insideTag) {
                // collect tag name
                tagName = '';
                for (let j = i + 1; j < offset; j++) {
                    if (text[j] === ' ' || text[j] === '>' || text[j] === '"') {
                        break;
                    }
                    tagName += text[j];
                }
            }
            break;
        }
    }

    return { insideCode, insideAttribute, insideTag, tagName, type };
}