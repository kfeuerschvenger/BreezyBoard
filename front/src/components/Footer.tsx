import React from 'react';
import { IconBrandGithub, IconBrandLinkedin, IconMail } from '@tabler/icons-react';
import { Icon } from '@/shared/ui';

/**
 * Footer component
 *
 * Displays author attribution and social/contact links with icons.
 * Semantic <footer> element for accessibility.
 */
const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-100 mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          {/* Left side: attribution */}
          <p className="text-sm text-gray-500 text-center md:text-left" aria-label="Site footer attribution">
            🦆 {currentYear} Kevin Feuerschvenger. Made with <span aria-hidden="true">❤</span> and some{' '}
            <span aria-hidden="true">☕</span>.
          </p>

          {/* Right side: social links */}
          <div className="flex items-center gap-2">
            <a
              href="https://www.linkedin.com/in/kevin-feuerschvenger/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn profile"
              className="inline-flex p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="LinkedIn profile"
            >
              <Icon as={IconBrandLinkedin} size={20} />
            </a>
            <a
              href="https://github.com/kfeuerschvenger"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub profile"
              className="inline-flex p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="GitHub profile"
            >
              <Icon as={IconBrandGithub} size={20} />
            </a>
            <a
              href="mailto:kfeuerschvenger@gmail.com"
              aria-label="Send email"
              className="inline-flex p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Email me"
            >
              <Icon as={IconMail} size={20} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
