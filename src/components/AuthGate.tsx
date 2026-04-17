import { motion } from 'framer-motion';
import { ExternalLink, Shield, Music, Users } from 'lucide-react';
const logo = '/songchainn-logo.webp';
import { Button } from '@/components/ui/button';

interface AuthGateProps {
  onLogin: () => void;
}

export function AuthGate({ onLogin }: AuthGateProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-glow-cyan/10 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1.5s' }} />
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-md w-full text-center"
        >
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-8"
          >
            <img 
              src={logo} 
              alt="$ongChainn" 
              className="w-32 h-32 mx-auto object-contain animate-float"
            />
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h1 className="font-heading text-4xl font-bold text-foreground mb-2">
              $ongChainn
            </h1>
            <p className="text-primary font-medium mb-2">Audience Edition · Phase One</p>
            <p className="text-muted-foreground text-sm mb-8">
              Your decentralized music platform built with artists and fans together.
            </p>
          </motion.div>

          {/* Base Requirement Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card rounded-2xl p-5 border border-border mb-6"
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-primary flex-shrink-0" />
              <h2 className="font-heading font-semibold text-foreground">
                Built on Base
              </h2>
            </div>
            
            <p className="text-sm text-muted-foreground mb-5 leading-relaxed px-1">
              $ongChainn runs on Base. You need the Base App to access your platform experience.
            </p>

            {/* Features */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="py-3 px-2 rounded-xl bg-secondary/50 text-center">
                <Music className="w-5 h-5 mx-auto text-primary mb-1.5" />
                <p className="text-xs text-muted-foreground leading-tight">Stream Music</p>
              </div>
              <div className="py-3 px-2 rounded-xl bg-secondary/50 text-center">
                <Users className="w-5 h-5 mx-auto text-primary mb-1.5" />
                <p className="text-xs text-muted-foreground leading-tight">Join Community</p>
              </div>
            </div>

            {/* Primary CTA - Base App Download */}
            <a
              href="https://base.app/invite/imanafrikah/WTL0V0H3"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button className="w-full gradient-primary text-primary-foreground font-semibold h-12 px-6 text-sm shadow-glow hover:scale-[1.02] transition-transform gap-2">
                Download Base App (Free)
                <ExternalLink className="w-4 h-4 flex-shrink-0" />
              </Button>
            </a>
            <p className="text-xs text-muted-foreground mt-2">Earn by Being Social</p>
          </motion.div>

          {/* Simulated Login for Demo */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <button
              onClick={onLogin}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            >
              I have a wallet – Continue
            </button>
          </motion.div>

          {/* Early Access Note */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-8 text-xs text-muted-foreground"
          >
            You are in an early edition designed to build your listening culture before ownership features begin.
          </motion.p>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="p-4 text-center border-t border-border">
        <p className="text-xs text-muted-foreground">
          Livingstone Town Square · Create On Base · Pioneer Town Square
        </p>
      </div>
    </div>
  );
}
