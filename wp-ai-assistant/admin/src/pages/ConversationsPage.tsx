import { SectionCard } from '../components/SectionCard';

type ConversationSummary = {
  id: string;
  session_id: string;
  updated_at: string;
  message_count?: number;
};

type Message = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

type ConversationsPageProps = {
  conversations: ConversationSummary[];
  messages: Message[];
  onSelect: (id: string) => Promise<void>;
};

export function ConversationsPage({ conversations, messages, onSelect }: ConversationsPageProps) {
  return (
    <div className="nastroje-split-grid">
      <SectionCard title="Conversations">
        <div className="nastroje-list">
          {conversations.map((conversation) => (
            <button key={conversation.id} className="nastroje-list-item" onClick={() => onSelect(conversation.id)}>
              <strong>{conversation.session_id}</strong>
              <span>{conversation.updated_at}</span>
            </button>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Messages">
        <div className="nastroje-message-list">
          {messages.map((message) => (
            <article key={message.id} className={`nastroje-message nastroje-message--${message.role}`}>
              <strong>{message.role}</strong>
              <p>{message.content}</p>
              <small>{message.created_at}</small>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
