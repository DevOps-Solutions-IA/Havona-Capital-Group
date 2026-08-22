export {};

declare global {
  interface HavonaJitsiApi {
    dispose(): void;
    executeCommand(command: string, ...args: unknown[]): void;
    addListener(event: string, listener: (data: Record<string, unknown>) => void): void;
    removeListener(event: string, listener: (data: Record<string, unknown>) => void): void;
  }

  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => HavonaJitsiApi;
  }
}
