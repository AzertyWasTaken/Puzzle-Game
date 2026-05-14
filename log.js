"use strict";
export function strArray(arr) {
    return `[${arr.map((value) =>
        strValue(value)
    ).join(", ")}]`;
}

export function strSet(set) {
    return `Set(${Array.from(set).map((key) =>
        `${key}`
    ).join(", ")})`;
}

export function strMap(map) {
    return `Map(${Array.from(map).map(([key, value]) =>
        `${key} => ${strValue(value)}`
    ).join(", ")})`;
}

export function strObject(obj) {
    return `{${Object.entries(obj).map(([key, value]) =>
        `${key}: ${strValue(value)}`
    ).join(", ")}}`;
}

export function strValue(val) {
    if (val === null) {return "null";}
    if (Array.isArray(val)) {return strArray(val);}
    if (val instanceof Map) {return strMap(val);}
    if (val instanceof Set) {return strSet(val);}
    if (typeof val === "object") {return strObject(val);}
    return val;
}

export function log() {
    const args = Array.from(arguments);
    console.log(...args.map(strValue));
    return true;
}