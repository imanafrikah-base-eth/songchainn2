import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function ArtistSubmissionForm() {
  const { user } = useAuth();
  const [realName, setRealName] = useState('');
  const [artistName, setArtistName] = useState('');
  const [location, setLocation] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!realName.trim() || !artistName.trim() || !location.trim() || !reason.trim()) {
      toast.error('Please fill in every field.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('submit-artist-application', {
        body: {
          realName: realName.trim(),
          artistName: artistName.trim(),
          location: location.trim(),
          reason: reason.trim(),
          contactEmail: user?.email || null,
        },
      });

      if (error || (data as any)?.error) {
        throw new Error(error?.message || (data as any)?.error || 'Something went wrong.');
      }

      toast.success("Sent! We'll be in touch soon.");
      setRealName('');
      setArtistName('');
      setLocation('');
      setReason('');
    } catch (err: any) {
      toast.error('Could not send your submission', {
        description: err?.message || 'Please try again in a moment.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="artist-real-name">Your real name</Label>
          <Input
            id="artist-real-name"
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            placeholder="Jane Doe"
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="artist-name">Artist name</Label>
          <Input
            id="artist-name"
            value={artistName}
            onChange={(e) => setArtistName(e.target.value)}
            placeholder="How you perform"
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="artist-location">Location</Label>
        <Input
          id="artist-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="City, Country"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="artist-reason">Why do you want to be on $ongChainn?</Label>
        <Textarea
          id="artist-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Tell us about your music and why $ongChainn is the right home for it."
          className="min-h-28"
          disabled={isSubmitting}
        />
      </div>

      <Button type="submit" className="w-full sm:w-auto gradient-primary text-primary-foreground gap-2" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Submit Your Music
      </Button>
    </form>
  );
}
