import { useEffect, useMemo, useState } from 'react';
import { Lightbulb, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { fcOpenUrl } from '@/lib/farcasterActions';
import { toast } from 'sonner';

interface SuggestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SuggestionDialog({ open, onOpenChange }: SuggestionDialogProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userLabel = useMemo(() => user?.id || 'guest', [user?.id]);

  useEffect(() => {
    const handleOpen = () => onOpenChange(true);
    window.addEventListener('songchainn:open-suggestion-form', handleOpen as EventListener);
    return () => {
      window.removeEventListener('songchainn:open-suggestion-form', handleOpen as EventListener);
    };
  }, [onOpenChange]);

  const handleSubmit = async () => {
    if (!details.trim()) {
      toast.error('Please add your suggestion details.');
      return;
    }
    setIsSubmitting(true);
    const payload = {
      kind: 'suggestion',
      subject: title.trim() || 'Feature suggestion',
      text: details.trim(),
      page: window.location.pathname,
    };
    try {
      // One door for everything sent to the founders: it is saved and it
      // lands in the main inbox. If the door is shut, the person's own mail
      // app opens with the same note to the same inbox.
      const { data, error } = await supabase.functions.invoke('founder-inbox', { body: payload });
      if (error || !data?.success) {
        const subject = encodeURIComponent(`$ongChainn suggestion: ${payload.subject}`);
        const body = encodeURIComponent(`From: ${user?.email || user?.id || 'guest'}\n\n${payload.text}`);
        void fcOpenUrl(`mailto:songchaindao@gmail.com?subject=${subject}&body=${body}`);
        toast.success('Your mail app has it, addressed to us.');
      } else {
        toast.success('Sent. Thank you for helping improve $ongChainn.');
      }
      setTitle('');
      setDetails('');
      onOpenChange(false);
    } catch {
      toast.error('Could not submit suggestion right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-primary" />
            Suggest an Improvement
          </DialogTitle>
          <DialogDescription>
            Share ideas to improve $ongChainn. Your user ID is attached automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">User ID</p>
            <Input value={userLabel} readOnly className="h-9 text-xs" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Title</p>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9 text-sm"
              placeholder="Short summary"
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Improvement details</p>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="min-h-28 text-sm"
              placeholder="Tell us what should be improved and why it helps."
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
