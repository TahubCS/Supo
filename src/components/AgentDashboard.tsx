import { Bell, Send, User, Clock, Tag, Search, Filter } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';

interface Conversation {
  id: string;
  customerName: string;
  priority: 'urgent' | 'normal' | 'low';
  subject: string;
  preview: string;
  timestamp: string;
  unread: boolean;
  tags: string[];
}

interface Customer {
  name: string;
  email: string;
  accountTier: string;
  joinDate: string;
  totalTickets: number;
  resolvedTickets: number;
}

const mockConversations: Conversation[] = [
  {
    id: '1',
    customerName: 'Sarah Johnson',
    priority: 'urgent',
    subject: 'Payment processing error',
    preview: "I'm unable to complete my payment and keep getting an error...",
    timestamp: '2 min ago',
    unread: true,
    tags: ['billing', 'technical'],
  },
  {
    id: '2',
    customerName: 'Michael Chen',
    priority: 'normal',
    subject: 'Feature inquiry',
    preview: 'Is there a way to export data in CSV format?',
    timestamp: '15 min ago',
    unread: true,
    tags: ['feature-request'],
  },
  {
    id: '3',
    customerName: 'Emma Davis',
    priority: 'low',
    subject: 'Account settings question',
    preview: 'How do I update my notification preferences?',
    timestamp: '1 hour ago',
    unread: false,
    tags: ['account'],
  },
];

const mockCustomer: Customer = {
  name: 'Sarah Johnson',
  email: 'sarah.johnson@example.com',
  accountTier: 'Enterprise',
  joinDate: 'Jan 2024',
  totalTickets: 12,
  resolvedTickets: 11,
};

const suggestedReplies = [
  "I'd be happy to help you with that. Let me check on this for you.",
  'Thank you for bringing this to our attention. Could you provide more details about when this started?',
  'I understand how frustrating this must be. Let me escalate this to our technical team right away.',
];

export function AgentDashboard() {
  const [activeConversation, setActiveConversation] = useState<string | null>('1');
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSendMessage = () => {
    if (!messageInput.trim()) return;
    setMessageInput('');
  };

  return (
    <div className="h-screen bg-[--background] flex">
      {/* Left Panel - Conversation Queue */}
      <div className="w-80 bg-white border-r border-[--border] flex flex-col">
        {/* Queue Header */}
        <div className="p-4 border-b border-[--border]">
          <div className="flex items-center justify-between mb-4">
            <h2>Conversations</h2>
            <button className="p-2 hover:bg-[--secondary] rounded-lg transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-[--status-offline] rounded-full" />
            </button>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--muted-foreground]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-10 pr-4 py-2 bg-[--secondary] rounded-lg outline-none focus:ring-2 focus:ring-[--primary] transition-all text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="flex-1">
              <Filter className="w-4 h-4 mr-1" />
              Filter
            </Button>
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {mockConversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setActiveConversation(conversation.id)}
              className={`w-full p-4 border-b border-[--border] text-left transition-colors ${
                activeConversation === conversation.id
                  ? 'bg-[--primary]/5 border-l-4 border-l-[--primary]'
                  : 'hover:bg-[--secondary]'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Avatar size="sm" fallback={conversation.customerName[0]} />
                  <div>
                    <h4 className="text-sm">{conversation.customerName}</h4>
                    {conversation.unread && (
                      <span className="w-2 h-2 bg-[--primary] rounded-full inline-block" />
                    )}
                  </div>
                </div>
                <Badge variant={conversation.priority} className="text-xs">
                  {conversation.priority}
                </Badge>
              </div>
              <h4 className="text-sm mb-1">{conversation.subject}</h4>
              <p className="text-xs text-[--muted-foreground] line-clamp-2 mb-2">
                {conversation.preview}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 flex-wrap">
                  {conversation.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-[--secondary] text-xs rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-[--muted-foreground]">
                  {conversation.timestamp}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Center Panel - Active Conversation */}
      <div className="flex-1 flex flex-col">
        {/* Conversation Header */}
        <div className="p-4 bg-white border-b border-[--border]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar size="md" fallback="SJ" status="online" />
              <div>
                <h3 className="text-sm">{mockCustomer.name}</h3>
                <p className="text-xs text-[--muted-foreground]">{mockCustomer.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm">
                <Tag className="w-4 h-4 mr-1" />
                Add Tag
              </Button>
            </div>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-6 bg-[--background]">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Bot conversation history indicator */}
            <div className="flex items-center gap-3 py-3">
              <div className="flex-1 h-px bg-[--border]" />
              <span className="text-xs text-[--muted-foreground] px-3">
                Previous bot conversation
              </span>
              <div className="flex-1 h-px bg-[--border]" />
            </div>

            {/* Sample messages */}
            <div className="flex justify-start">
              <div className="bg-[--bot-bubble] text-white px-4 py-2.5 rounded-lg max-w-[70%]">
                <p className="text-sm">
                  Hi! I&apos;m Aria, your support assistant. How can I help you today?
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="bg-white px-4 py-2.5 rounded-lg max-w-[70%] shadow-sm">
                <p className="text-sm">
                  I&apos;m unable to complete my payment and keep getting an error message.
                </p>
              </div>
            </div>

            {/* Handoff indicator */}
            <div className="flex items-center gap-3 py-3">
              <div className="flex-1 h-px bg-[--border]" />
              <span className="text-xs text-[--muted-foreground] px-3">
                Agent takeover point
              </span>
              <div className="flex-1 h-px bg-[--border]" />
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-[--border]">
          {/* Suggested Replies */}
          <div className="mb-3">
            <p className="text-xs text-[--muted-foreground] mb-2">Suggested replies:</p>
            <div className="flex flex-wrap gap-2">
              {suggestedReplies.map((reply, index) => (
                <button
                  key={index}
                  onClick={() => setMessageInput(reply)}
                  className="px-3 py-1.5 bg-[--secondary] hover:bg-[--primary]/10 text-xs rounded-full transition-colors"
                >
                  {reply.substring(0, 40)}...
                </button>
              ))}
            </div>
          </div>

          {/* Message Input */}
          <div className="flex items-end gap-2">
            <textarea
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Type your response..."
              rows={3}
              className="flex-1 px-4 py-2.5 bg-[--secondary] rounded-lg outline-none focus:ring-2 focus:ring-[--primary] transition-all resize-none"
            />
            <Button variant="primary" onClick={handleSendMessage} className="h-full">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel - Customer Profile */}
      <div className="w-80 bg-white border-l border-[--border] overflow-y-auto">
        <div className="p-6">
          <h3 className="mb-4">Customer Profile</h3>

          <Card className="p-4 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <Avatar size="lg" fallback="SJ" />
              <div>
                <h4 className="text-sm">{mockCustomer.name}</h4>
                <p className="text-xs text-[--muted-foreground]">{mockCustomer.email}</p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[--muted-foreground]">Account Tier</span>
                <Badge variant="normal">{mockCustomer.accountTier}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[--muted-foreground]">Customer Since</span>
                <span>{mockCustomer.joinDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[--muted-foreground]">Total Tickets</span>
                <span>{mockCustomer.totalTickets}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[--muted-foreground]">Resolved</span>
                <span className="text-[--status-online]">{mockCustomer.resolvedTickets}</span>
              </div>
            </div>
          </Card>

          <div className="mb-4">
            <h4 className="text-sm mb-3">Recent Activity</h4>
            <div className="space-y-2">
              {[
                { action: 'Ticket resolved', time: '2 days ago' },
                { action: 'Account upgraded', time: '1 week ago' },
                { action: 'First contact', time: '2 months ago' },
              ].map((activity, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 p-2 bg-[--secondary] rounded-lg"
                >
                  <Clock className="w-4 h-4 text-[--muted-foreground] mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm">{activity.action}</p>
                    <p className="text-xs text-[--muted-foreground]">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button variant="secondary" className="w-full">
            <User className="w-4 h-4 mr-2" />
            View Full Profile
          </Button>
        </div>
      </div>
    </div>
  );
}
