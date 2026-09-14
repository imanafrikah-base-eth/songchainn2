import { useArtistRegions } from "@/battlezone/lib/regions";

/* Places we are reaching for that have no artist here yet. A country with an
   artist on SONGCHAINN is live the moment they arrive, and drops off this list. */
const COMING_SOON = ["South Africa", "Nigeria", "Zimbabwe", "Botswana"];

const CountryChips = () => {
  const live = useArtistRegions();
  const countries = [
    ...live.map((name) => ({ name, status: "live" as const })),
    ...COMING_SOON.filter((name) => !live.includes(name)).map((name) => ({ name, status: "coming-soon" as const })),
  ];

  return (
    <div className="flex flex-wrap justify-center gap-3">
      {countries.map((c) => (
        <div key={c.name} className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-2 text-sm backdrop-blur">
          <span className="font-medium text-foreground">{c.name}</span>{" "}
          {c.status === "live" ? (
            <span className="rounded-full bg-live/20 px-2 py-0.5 text-[10px] font-bold uppercase text-live pulse-live">
              Live
            </span>
          ) : (
            <span className="text-muted-foreground">Coming soon</span>
          )}
        </div>
      ))}
    </div>
  );
};

export default CountryChips;
