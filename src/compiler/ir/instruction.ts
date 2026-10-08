export type TACInstruction =
  | AssignInstruction
  | BinaryInstruction
  | ReturnInstruction;

export interface BaseInstruction {
  id: number;
}

export interface AssignInstruction extends BaseInstruction {
  kind: "assign";
  target: string;
  value: string;
}

export interface BinaryInstruction extends BaseInstruction {
  kind: "binary";
  target: string;
  left: string;
  operator: string;
  right: string;
}

export interface ReturnInstruction extends BaseInstruction {
  kind: "return";
  value: string;
}