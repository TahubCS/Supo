import { useId, useMemo, useState } from 'react';
import { X, ArrowLeft, CheckCircle, Upload } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './Button';
import { Card } from './Card';

interface EmailSupportFormProps {
  onClose: () => void;
  onBack: () => void;
}

function formatTicketId(seed: string) {
  const normalized = seed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `TKT-${normalized.slice(-9).padStart(9, '0')}`;
}

export function EmailSupportForm({ onClose, onBack }: EmailSupportFormProps) {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const ticketSeed = useId();
  const ticketId = useMemo(() => formatTicketId(ticketSeed), [ticketSeed]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    category: '',
    description: '',
  });
  const [fileName, setFileName] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
    }
  };

  if (isSubmitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <Card className="w-135 p-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
            className="w-16 h-16 rounded-full bg-[--status-online] flex items-center justify-center mx-auto mb-4"
          >
            <CheckCircle className="w-8 h-8 text-white" />
          </motion.div>
          <h2 className="mb-2">Support Request Submitted</h2>
          <p className="text-[--muted-foreground] mb-4">
            We&apos;ve received your message and will respond within 2-4 hours.
          </p>
          <div className="p-4 bg-[--secondary] rounded-xl mb-6">
            <p className="text-sm text-[--muted-foreground] mb-1">Your Ticket ID</p>
            <code className="text-lg text-[--primary]">{ticketId}</code>
          </div>
          <p className="text-sm text-[--muted-foreground] mb-6">
            We&apos;ve sent a confirmation email to <strong>{formData.email}</strong>
          </p>
          <Button variant="primary" onClick={onClose} className="w-full">
            Close
          </Button>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed bottom-6 right-6 z-50"
    >
      <Card className="w-135 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[--border]">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-[--secondary] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="text-sm">Email Support</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[--secondary] rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6 max-w-md mx-auto">
            <div>
              <label htmlFor="name" className="block text-sm mb-2">
                Full Name
              </label>
              <input
                type="text"
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-[--input-background] border border-[--border] rounded-lg outline-none focus:ring-2 focus:ring-[--primary] transition-all"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2.5 bg-[--input-background] border border-[--border] rounded-lg outline-none focus:ring-2 focus:ring-[--primary] transition-all"
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label htmlFor="category" className="block text-sm mb-2">
                Issue Category
              </label>
              <select
                id="category"
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2.5 bg-[--input-background] border border-[--border] rounded-lg outline-none focus:ring-2 focus:ring-[--primary] transition-all"
              >
                <option value="">Select a category</option>
                <option value="technical">Technical Issue</option>
                <option value="billing">Billing Question</option>
                <option value="account">Account Access</option>
                <option value="feature">Feature Request</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm mb-2">
                Description
              </label>
              <textarea
                id="description"
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={6}
                className="w-full px-4 py-2.5 bg-[--input-background] border border-[--border] rounded-lg outline-none focus:ring-2 focus:ring-[--primary] transition-all resize-none"
                placeholder="Please describe your issue in detail..."
              />
            </div>

            <div>
              <label className="block text-sm mb-2">Attachment (Optional)</label>
              <div className="relative">
                <input
                  type="file"
                  id="file"
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                />
                <label
                  htmlFor="file"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[--secondary] border-2 border-dashed border-[--border] rounded-lg cursor-pointer hover:bg-[--secondary]/70 transition-colors"
                >
                  <Upload className="w-5 h-5 text-[--muted-foreground]" />
                  <span className="text-sm text-[--muted-foreground]">
                    {fileName || 'Click to upload a file'}
                  </span>
                </label>
              </div>
              <p className="text-xs text-[--muted-foreground] mt-1">
                Supported formats: JPG, PNG, PDF, DOC (Max 10MB)
              </p>
            </div>

            <Button type="submit" variant="primary" className="w-full py-3!">
              Submit Request
            </Button>
          </div>
        </form>
      </Card>
    </motion.div>
  );
}
