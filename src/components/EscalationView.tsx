import { useId, useMemo, useState } from 'react';
import { X, Mail, UserCircle, ArrowLeft, Copy, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './Button';
import { Card } from './Card';

interface EscalationViewProps {
  onClose: () => void;
  onBack: () => void;
  onEmailSupport: () => void;
}

function formatTicketId(seed: string) {
  const normalized = seed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `TKT-${normalized.slice(-9).padStart(9, '0')}`;
}

export function EscalationView({ onClose, onBack, onEmailSupport }: EscalationViewProps) {
  const [selectedOption, setSelectedOption] = useState<'email' | 'live' | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const ticketSeed = useId();
  const ticketNumber = useMemo(() => formatTicketId(ticketSeed), [ticketSeed]);
  const [copied, setCopied] = useState(false);

  const handleLiveAgent = () => {
    setIsConnecting(true);
    setTimeout(() => {
      setIsConnecting(false);
    }, 3000);
  };

  const copyTicketNumber = () => {
    navigator.clipboard.writeText(ticketNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed bottom-6 right-6 z-50"
    >
      <Card className="w-[400px] h-[600px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[--border]">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-[--secondary] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="text-sm">Get Help from Our Team</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[--secondary] rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedOption ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="text-center mb-6">
                <h3 className="mb-2">How would you like to connect?</h3>
                <p className="text-sm text-[--muted-foreground]">
                  Choose the best way for us to assist you
                </p>
              </div>

              <button
                onClick={() => setSelectedOption('live')}
                className="w-full p-4 border-2 border-[--border] rounded-2xl hover:border-[--primary] hover:bg-[--primary]/5 transition-all text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[--primary]/10 flex items-center justify-center group-hover:bg-[--primary]/20 transition-colors">
                    <UserCircle className="w-6 h-6 text-[--primary]" />
                  </div>
                  <div className="flex-1">
                    <h4 className="mb-1">Live Agent Chat</h4>
                    <p className="text-sm text-[--muted-foreground]">
                      Connect with an available support agent
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full bg-[--status-online]" />
                      <span className="text-[--status-online]">2 agents available</span>
                      <span className="text-[--muted-foreground]">• Est. wait: 2 min</span>
                    </div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  setSelectedOption('email');
                  onEmailSupport();
                }}
                className="w-full p-4 border-2 border-[--border] rounded-2xl hover:border-[--primary] hover:bg-[--primary]/5 transition-all text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[--primary]/10 flex items-center justify-center group-hover:bg-[--primary]/20 transition-colors">
                    <Mail className="w-6 h-6 text-[--primary]" />
                  </div>
                  <div className="flex-1">
                    <h4 className="mb-1">Email Support</h4>
                    <p className="text-sm text-[--muted-foreground]">
                      Send us a detailed message
                    </p>
                    <div className="mt-2 text-xs text-[--muted-foreground]">
                      We typically respond within 2-4 hours
                    </div>
                  </div>
                </div>
              </button>

              <div className="mt-6 p-4 bg-[--secondary] rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="text-sm">
                    <p className="mb-1">
                      <span>Ticket Reference:</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="px-2 py-1 bg-white rounded text-[--primary]">
                        {ticketNumber}
                      </code>
                      <button
                        onClick={copyTicketNumber}
                        className="p-1 hover:bg-white rounded transition-colors"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-[--status-online]" />
                        ) : (
                          <Copy className="w-4 h-4 text-[--muted-foreground]" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : selectedOption === 'live' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center"
            >
              <div className="w-16 h-16 rounded-full bg-[--primary]/10 flex items-center justify-center mb-4">
                {isConnecting ? (
                  <motion.div
                    className="w-8 h-8 border-3 border-[--primary] border-t-transparent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                ) : (
                  <UserCircle className="w-8 h-8 text-[--primary]" />
                )}
              </div>
              <h3 className="mb-2">
                {isConnecting ? 'Connecting you to an agent...' : 'Ready to connect'}
              </h3>
              <p className="text-sm text-[--muted-foreground] mb-6">
                {isConnecting
                  ? 'Please wait while we find an available support specialist'
                  : 'Click below to start a live chat session'}
              </p>
              {!isConnecting && (
                <Button variant="primary" onClick={handleLiveAgent}>
                  Start Live Chat
                </Button>
              )}
              <p className="text-xs text-[--muted-foreground] mt-4">
                Estimated wait time: 2 minutes
              </p>
            </motion.div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
