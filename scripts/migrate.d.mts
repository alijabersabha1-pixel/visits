export function migrate(databaseUrl: string, log?: (msg: string) => void): Promise<string[]>;
export function grantAppRole(databaseUrl: string, role: string): Promise<void>;
