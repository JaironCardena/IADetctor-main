declare module 'node-telegram-bot-api' {
  class TelegramBot {
    constructor(token: string, options?: any);
    sendMessage(chatId: string | number, text: string, options?: any): Promise<any>;
    sendDocument(chatId: string | number, document: any, options?: any, fileOptions?: any): Promise<any>;
    editMessageReplyMarkup(replyMarkup: any, options?: any): Promise<any>;
    answerCallbackQuery(callbackQueryId: string, options?: any): Promise<any>;
    onText(regexp: RegExp, callback: (msg: any, match: RegExpExecArray | null) => void | Promise<void>): void;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  namespace TelegramBot {
    interface InlineKeyboardMarkup {
      inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
    }
  }

  export default TelegramBot;
}
