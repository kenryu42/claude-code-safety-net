interface CommandDefinition {
  description?: string;
  template: string;
}

export type BuiltinCommands = Record<string, CommandDefinition>;
