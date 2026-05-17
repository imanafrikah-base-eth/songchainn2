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
      user_id: user?.id || null,
      user_label: user?.email || user?.id || 'guest',
      title: title.trim() || 'Feature suggestion',
      details: details.trim(),
      source: 'songchainn-app',
      created_at: new Date().toISOString(),
    };
    try {
      const { error } = await (supabase as any).from('suggestion_forms').insert(payload);
      if (error) {
        // Fallback if table is not ready yet.
        const subject = encodeURIComponent(`$ongChainn Suggestion: ${payload.title}`);
        const body = encodeURIComponent(`User: ${payload.user_label}\n\n${payload.details}`);
        void fcOpenUrl(`mailto:wavewarzafrica@songchainn.xyz?subject=${subject}&body=${body}`);
        toast.success('Suggestion captured and email draft opened.');
      } else {
        toast.success('Suggestion sent. Thank you for helping improve $ongChainn.');
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
