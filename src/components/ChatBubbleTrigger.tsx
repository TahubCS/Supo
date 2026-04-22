import { MessageCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

interface ChatBubbleTriggerProps {
  onClick: () => void;
}

export function ChatBubbleTrigger({ onClick }: ChatBubbleTriggerProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      className="fixed bottom-6 right-6 z-50"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
    >
      <div className="relative">
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-[#1A1A1A] text-white text-sm rounded-lg whitespace-nowrap shadow-lg"
          >
            Need help? Chat with us.
            <div className="absolute bottom-[-4px] right-4 w-2 h-2 bg-[#1A1A1A] rotate-45" />
          </motion.div>
        )}
        <motion.button
          onClick={onClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="w-14 h-14 rounded-full bg-[--primary] text-white shadow-[0px_4px_16px_rgba(0,97,213,0.4)] flex items-center justify-center transition-all duration-200"
        >
          <MessageCircle className="w-6 h-6" />
        </motion.button>
      </div>
    </motion.div>
  );
}
