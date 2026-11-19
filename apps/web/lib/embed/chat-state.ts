export type ChatMessage = { id: string; role: "visitor" | "bot" | "error"; text: string };

export type ChatState = {
  messages: ChatMessage[];
  waiting: boolean;
  conversationId?: string;
};

export type ChatAction =
  | { type: "sent"; id: string; text: string }
  | { type: "replied"; id: string; text: string; conversationId: string }
  /** `resetConversation`: drop the conversation, so the next send starts a new one (a 404). */
  | { type: "failed"; id: string; text: string; resetConversation?: boolean };

export const INITIAL_CHAT_STATE: ChatState = { messages: [], waiting: false };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "sent":
      return { ...state, waiting: true, messages: [...state.messages, { id: action.id, role: "visitor", text: action.text }] };
    case "replied":
      return {
        waiting: false,
        conversationId: action.conversationId,
        messages: [...state.messages, { id: action.id, role: "bot", text: action.text }],
      };
    case "failed":
      return {
        waiting: false,
        // Kept in panel state only, until the page reloads (product owner decision).
        conversationId: action.resetConversation ? undefined : state.conversationId,
        messages: [...state.messages, { id: action.id, role: "error", text: action.text }],
      };
  }
}
