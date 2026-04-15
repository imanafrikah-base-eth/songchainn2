import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WAVEWARZ_ROLE_ONBOARDING } from '@/data/wavewarzAfrica';

export function WaveWarzRoleTabs() {
  return (
    <Tabs defaultValue="trader" className="w-full">
      <TabsList className="grid w-full grid-cols-3 bg-black/40">
        {WAVEWARZ_ROLE_ONBOARDING.map((role) => (
          <TabsTrigger key={role.key} value={role.key}>
            {role.title}
          </TabsTrigger>
        ))}
      </TabsList>
      {WAVEWARZ_ROLE_ONBOARDING.map((role) => (
        <TabsContent key={role.key} value={role.key} className="mt-4">
          <div className="rounded-2xl border border-cyan-500/25 bg-black/45 p-4 sm:p-6">
            <h4 className="text-lg font-semibold text-white">{role.title} Onboarding</h4>
            <div className="mt-3 space-y-2">
              {role.copy.map((line) => (
                <p key={line} className="text-sm text-zinc-200">
                  {line}
                </p>
              ))}
            </div>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
