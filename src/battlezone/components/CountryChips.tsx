const countries = [
  { name: "Zambia", status: "live" as const },
  { name: "South Africa", status: "coming-soon" as const },
  { name: "Nigeria", status: "coming-soon" as const },
  { name: "Zimbabwe", status: "coming-soon" as const },
  { name: "Botswana", status: "coming-soon" as const },
];

const CountryChips = () => (
  <div className="flex flex-wrap justify-center gap-3">
    {countries.map((c) => (
      <div key={c.name} className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-2 text-sm backdrop-blur">
        <span className="font-medium text-foreground">{c.name}</span>{" "}
        {c.status === "live" ? (
          <span className="rounded-full bg-live/20 px-2 py-0.5 text-[10px] font-bold uppercase text-live pulse-live">
            Live
          </span>
        ) : (
          <span className="text-muted-foreground">- Coming Soon</span>
        )}
      </div>
    ))}
  </div>
);

export default CountryChips;
