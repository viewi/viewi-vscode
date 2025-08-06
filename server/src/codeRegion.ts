import { BraceType } from "./braceType";

export type CodeRegion = {
    insideCode: boolean;
    insideAttribute: boolean;
    insideTag: boolean;
    tagName?: string;
    type: BraceType
};