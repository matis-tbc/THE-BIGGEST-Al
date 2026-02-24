declare module 'better-sqlite3' {
  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Statement {
    all(...params: any[]): any[];
    run(...params: any[]): RunResult;
    get(...params: any[]): any;
  }

  interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): void;
    transaction<T>(fn: () => T): () => T;
    backup(destination: Database): void;
    close(): void;
    pragma(sql: string, options?: { simple?: boolean }): any;
  }

  const Database: {
    new (path: string, options?: any): Database;
  };

  export default Database;
  export { RunResult };
}