export type ExtensionEventName =
  | "after_claim"
  | "before_start"
  | "after_start"
  | "before_finish"
  | "after_finish"
  | "after_block"
  | "after_release"
  | "review_requested";

export interface HookBlockResult {
  block: {
    detail: string;
    code?: string;
  };
}

export interface ExtensionLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface ExtensionHookContext<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  rootDir: string;
  event: ExtensionEventName;
  payload: TPayload;
  log: ExtensionLogger;
  getIndex(): Promise<unknown>;
  block(detail: string, code?: string): HookBlockResult;
}

export interface ExtensionCommandContext {
  rootDir: string;
  input: Record<string, unknown>;
  log: ExtensionLogger;
  getIndex(): Promise<unknown>;
}

export interface ExtensionDefinition {
  id: string;
  setup(api: ExtensionApi): void | Promise<void>;
}

export interface ExtensionApi {
  on(event: ExtensionEventName, handler: (context: ExtensionHookContext) => void | HookBlockResult | Promise<void | HookBlockResult>): void;
  registerCommand(name: string, handler: (context: ExtensionCommandContext) => unknown | Promise<unknown>, description?: string): void;
}

export function defineExtension<T extends ExtensionDefinition>(definition: T): T {
  return definition;
}
