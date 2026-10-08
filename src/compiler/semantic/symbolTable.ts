export type DataType = "int" | "float";

export interface SymbolInfo {
  name: string;
  dataType: DataType;
  initialized: boolean;
}

export class SymbolTable {
  private symbols = new Map<string, SymbolInfo>();

  declare(
    name: string,
    dataType: DataType,
    initialized: boolean = false
  ): boolean {
    if (this.symbols.has(name)) {
      return false;
    }

    this.symbols.set(name, {
      name,
      dataType,
      initialized,
    });

    return true;
  }

  lookup(name: string): SymbolInfo | undefined {
    return this.symbols.get(name);
  }

  has(name: string): boolean {
    return this.symbols.has(name);
  }

  getAll(): SymbolInfo[] {
    return Array.from(this.symbols.values());
  }
}