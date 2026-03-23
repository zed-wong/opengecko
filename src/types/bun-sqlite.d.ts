declare module 'bun:sqlite' {
  export type Changes = {
    changes: number;
    lastInsertRowid: number | bigint;
  };

  export class Statement<T = unknown> {
    run(...params: unknown[]): Changes;
    all(...params: unknown[]): T[];
    get(...params: unknown[]): T | undefined;
  }

  export class Database {
    constructor(filename?: string, options?: Record<string, unknown>);
    query<T = unknown>(sql: string): Statement<T>;
    run(sql: string, ...params: unknown[]): Changes;
    exec(sql: string): void;
    close(): void;
  }
}
