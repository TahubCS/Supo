import { MessageCircle, Twitter, Github, Linkedin } from 'lucide-react';

export function Footer() {
  return (
    <footer className="relative border-t border-[--glass-border] py-16 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Column 1 - Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-linear-to-br from-[--primary] to-[--accent] flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">SupportAI</span>
            </div>
            <p className="text-sm text-[--muted-foreground] mb-6">
              AI-powered customer support that never sleeps.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="#"
                className="w-9 h-9 rounded-lg bg-[--glass-background] border border-[--glass-border] flex items-center justify-center hover:border-[--primary] transition-colors"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="#"
                className="w-9 h-9 rounded-lg bg-[--glass-background] border border-[--glass-border] flex items-center justify-center hover:border-[--primary] transition-colors"
              >
                <Github className="w-4 h-4" />
              </a>
              <a
                href="#"
                className="w-9 h-9 rounded-lg bg-[--glass-background] border border-[--glass-border] flex items-center justify-center hover:border-[--primary] transition-colors"
              >
                <Linkedin className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Column 2 - Product */}
          <div>
            <h4 className="text-sm mb-4">Product</h4>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors">
                  API Documentation
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors">
                  Integrations
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors">
                  Changelog
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3 - Company */}
          <div>
            <h4 className="text-sm mb-4">Company</h4>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors">
                  About
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors">
                  Blog
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors">
                  Careers
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4 - Legal */}
          <div>
            <h4 className="text-sm mb-4">Legal</h4>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors">
                  Security
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[--status-success]" />
                  All systems operational
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-16 pt-8 border-t border-[--glass-border] flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[--muted-foreground]">
            © 2026 SupportAI. All rights reserved.
          </p>
          <p className="text-sm text-[--muted-foreground]">
            Made with AI · Powered by GPT-4o
          </p>
        </div>
      </div>
    </footer>
  );
}
