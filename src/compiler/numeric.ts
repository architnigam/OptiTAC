export const isNumeric = (value: string) => /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value);
export const numericText = (value: number) => Object.is(value, -0) ? '-0' : String(value);
