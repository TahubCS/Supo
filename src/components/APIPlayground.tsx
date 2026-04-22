import { motion } from 'motion/react';
import { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { Play, Copy, Check } from 'lucide-react';

const codeExamples = {
  curl: `curl -X POST https://api.supportai.com/v1/chat \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "How do I reset my password?",
    "user_id": "user_123",
    "context": {
      "account_tier": "premium"
    }
  }'`,
  node: `const SupportAI = require('support-ai');

const client = new SupportAI('YOUR_API_KEY');

const response = await client.chat.create({
  message: 'How do I reset my password?',
  userId: 'user_123',
  context: {
    accountTier: 'premium'
  }
});`,
  python: `from supportai import SupportAI

client = SupportAI(api_key='YOUR_API_KEY')

response = client.chat.create(
  message='How do I reset my password?',
  user_id='user_123',
  context={
    'account_tier': 'premium'
  }
)`,
};

const mockResponse = {
  id: 'msg_7x9k2p',
  message: "I'll send you a password reset link to your registered email. Please check your inbox and spam folder.",
  confidence: 0.94,
  escalate: false,
  suggested_actions: ['send_reset_email'],
  processing_time: '234ms',
};

export function APIPlayground() {
  const [activeTab, setActiveTab] = useState<'curl' | 'node' | 'python'>('curl');
  const [showResponse, setShowResponse] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRun = () => {
    setShowResponse(true);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(codeExamples[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="api" className="relative py-24 px-6 bg-[--card]">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left - Text */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <p className="text-sm text-[--accent] uppercase tracking-wider mb-4">
              — Try the API
            </p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">
              Integrate in minutes, not days.
            </h2>
            <p className="text-lg text-[--muted-foreground] mb-6" style={{ lineHeight: 1.7 }}>
              Our REST API and SDKs make it simple to add AI-powered support to your application. Available for Node.js, Python, and PHP with full TypeScript support.
            </p>
            <a href="#" className="text-[--primary] hover:text-[--accent] transition-colors inline-flex items-center gap-2">
              Read the full API docs →
            </a>
          </motion.div>

          {/* Right - Code Editor */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <Card className="overflow-hidden">
              {/* Tabs */}
              <div className="flex items-center gap-1 p-2 border-b border-[--glass-border]">
                {(['curl', 'node', 'python'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg text-sm transition-all ${
                      activeTab === tab
                        ? 'bg-[--glass-background] text-[--foreground]'
                        : 'text-[--muted-foreground] hover:text-[--foreground]'
                    }`}
                  >
                    {tab === 'curl' ? 'cURL' : tab === 'node' ? 'Node.js' : 'Python'}
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  onClick={handleCopy}
                  className="p-2 hover:bg-[--glass-background] rounded-lg transition-colors"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-[--status-success]" />
                  ) : (
                    <Copy className="w-4 h-4 text-[--muted-foreground]" />
                  )}
                </button>
              </div>

              {/* Code Block */}
              <div className="p-4 bg-[#0D1117] font-mono text-sm overflow-x-auto">
                <pre className="text-[#E6EDF3]">
                  <code>{codeExamples[activeTab]}</code>
                </pre>
              </div>

              {/* Run Button */}
              <div className="p-4 border-t border-[--glass-border]">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRun}
                  className="w-full"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Run
                </Button>
              </div>

              {/* Response Output */}
              {showResponse && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="border-t border-[--glass-border]"
                >
                  <div className="p-4 bg-[#0D1117] font-mono text-xs overflow-x-auto">
                    <div className="text-[--status-success] mb-2">Response (200 OK):</div>
                    <pre className="text-[#E6EDF3]">
                      <code>{JSON.stringify(mockResponse, null, 2)}</code>
                    </pre>
                  </div>
                </motion.div>
              )}
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
