import { BraceType } from "./braceType";

export type CodeRegion = {
    insideCode: boolean;
    insideAttribute: boolean;
    insideTag: boolean;
    insideAttributeName: boolean;
    tagName?: string;
    type: BraceType
};