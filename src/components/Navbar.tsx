import { MessageCircle } from 'lucide-react';
import { Button } from './Button';

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[rgba(10,15,30,0.8)] backdrop-blur-2xl border-b border-[--glass-border]">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-[--primary] to-[--accent] flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">SupportAI</span>
          </div>

          {/* Center Links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-[--foreground] hover:text-white transition-colors text-sm">
              Features
            </a>
            <a href="#pricing" className="text-[--foreground] hover:text-white transition-colors text-sm">
              Pricing
            </a>
            <a href="#api" className="text-[--foreground] hover:text-white transition-colors text-sm">
              API Docs
            </a>
            <a href="#changelog" className="text-[--foreground] hover:text-white transition-colors text-sm">
              Changelog
            </a>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">
              Dashboard →
            </Button>
            <Button variant="primary" size="sm">
              Get Started
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
