export interface Configuration {
  ai?: {
    provider?: string;
    model?: string;
    temperature?: number;
  };
  workflow?: {
    autoCommit?: 'allow' | 'ask' | 'deny';
    autoCreateBranch?: 'allow' | 'ask' | 'deny';
    autoStage?: 'allow' | 'ask' | 'deny';
    splitChanges?: 'allow' | 'ask' | 'deny';
    commitStyle?: string;
    defaultBranch?: string;
  };
  ui?: {
    liveUpdates?: boolean;
    color?: 'auto' | 'always' | 'never';
  };
}

export interface ConfigurationService {
  load(): Promise<Configuration>;
  getMerged(): Promise<Configuration>;
}
