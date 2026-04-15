import { useMemo, useState } from 'react';
import { MapPin, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WAVEWARZ_AFRICA_LINKS } from '@/data/wavewarzAfrica';

interface WaveWarzCountryJoinDialogProps {
  triggerLabel?: string;
  triggerClassName?: string;
}

export function WaveWarzCountryJoinDialog({
  triggerLabel = 'Register Country / City',
  triggerClassName,
}: WaveWarzCountryJoinDialogProps) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [message, setMessage] = useState('');

  const mailToHref = useMemo(() => {
    const subject = `WaveWarz Africa rollout request: ${country || 'Country request'}`;
    const body = [
      `Name: ${fullName || '-'}`,
      `Email: ${email || '-'}`,
      `Country: ${country || '-'}`,
      `City: ${city || '-'}`,
      '',
      'Message:',
      message || '-',
    ].join('\n');

    return `mailto:${WAVEWARZ_AFRICA_LINKS.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [city, country, email, fullName, message]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={triggerClassName}>
          <MapPin className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md p-4 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle>Register Your Country Or City</DialogTitle>
          <DialogDescription>
            Submit your location details and $ongChainn sends this to {WAVEWARZ_AFRICA_LINKS.contactEmail}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wavewarz-name">Full Name</Label>
            <Input id="wavewarz-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wavewarz-email">Email</Label>
            <Input id="wavewarz-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wavewarz-country">Country</Label>
            <Input id="wavewarz-country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wavewarz-city">City</Label>
            <Input id="wavewarz-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="wavewarz-message">Notes</Label>
            <Textarea
              id="wavewarz-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us about your community, artists, and expected battle activity."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button asChild className="w-full sm:w-auto">
            <a href={mailToHref}>
              <Send className="h-4 w-4" />
              Send Registration
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
