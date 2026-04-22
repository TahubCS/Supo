import { X, Send, Paperclip, MoreVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useRef, useEffect } from 'react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Card } from './Card';

interface Message {
  id: string;
  type: 'bot' | 'user';
  content: string;
  timestamp: Date;
  quickReplies?: string[];
}

interface ChatWindowProps {
  onClose: () => void;
  onEscalate: () => void;
}

export function ChatWindow({ onClose, onEscalate }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'bot',
      content: "Hi! I'm Aria, your support assistant. How can I help you today?",
      timestamp: new Date(),
      quickReplies: ['Track Order', 'Reset Password', 'Speak to an Agent'],
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: "I understand you need help. Let me connect you with one of our specialists who can better assist you with this request.",
        timestamp: new Date(),
        quickReplies: ['Email Support', 'Live Agent'],
      };
      setMessages((prev) => [...prev, botResponse]);
      setIsTyping(false);
    }, 1500);
  };

  const handleQuickReply = (reply: string) => {
    if (reply === 'Speak to an Agent' || reply === 'Live Agent') {
      onEscalate();
    } else {
      setInputValue(reply);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed bottom-6 right-6 z-50"
    >
      <Card className="w-100 h-150 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[--border]">
          <div className="flex items-center gap-3">
            <Avatar status="online" size="md" fallback="A" />
            <div>
              <h3 className="text-sm">Aria — Support Bot</h3>
              <div className="flex items-center gap-1.5 text-xs text-[--muted-foreground]">
                <span className="w-2 h-2 rounded-full bg-[--status-online]" />
                Online
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-[--secondary] rounded-lg transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[--secondary] rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-70 px-4 py-2.5 rounded-lg ${
                    message.type === 'bot'
                      ? 'bg-[--bot-bubble] text-white'
                      : 'bg-[--user-bubble] text-[--foreground]'
                  }`}
                  style={{ borderRadius: '8px' }}
                >
                  <p className="text-sm leading-relaxed">{message.content}</p>
                  {message.quickReplies && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {message.quickReplies.map((reply) => (
                        <button
                          key={reply}
                          onClick={() => handleQuickReply(reply)}
                          className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded-full transition-colors"
                        >
                          {reply}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-[--bot-bubble] text-white px-4 py-3 rounded-lg">
                <div className="flex items-center gap-1">
                  <motion.span
                    className="w-2 h-2 bg-white rounded-full"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
                  />
                  <motion.span
                    className="w-2 h-2 bg-white rounded-full"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
                  />
                  <motion.span
                    className="w-2 h-2 bg-white rounded-full"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-[--border]">
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-[--secondary] rounded-lg transition-colors">
              <Paperclip className="w-5 h-5 text-[--muted-foreground]" />
            </button>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type your message..."
              className="flex-1 px-3 py-2 bg-[--input-background] rounded-lg outline-none focus:ring-2 focus:ring-[--primary] transition-all"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleSendMessage}
              className="rounded-lg!"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
