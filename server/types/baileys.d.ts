declare module '@whiskeysockets/baileys' {
  export const DisconnectReason: {
    loggedOut: number;
  };

  export function makeWASocket(config: any): any;
  export function useMultiFileAuthState(folder: string): Promise<{ state: any; saveCreds: () => Promise<void> }>;
  export function fetchLatestBaileysVersion(): Promise<{ version: number[] }>;
  const defaultExport: any;
  export default defaultExport;
}
