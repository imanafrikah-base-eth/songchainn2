import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════
   TOKENS
═══════════════════════════════════════════════ */
const T = {
  navy:     "#0B1622",
  navyD:    "#060E18",
  navyC:    "#101E2E",
  navyH:    "#162840",
  gold:     "#F0A500",
  goldL:    "#FFD166",
  goldPale: "#FFFBF0",
  cream:    "#F9F7F2",
  white:    "#FFFFFF",
  ink:      "#1A2B3C",
  slate:    "#4A6070",
  mist:     "#8FA3B3",
  line:     "#E8E2D6",
  lineD:    "#1A2C3E",
  px:       "clamp(18px,5vw,72px)",
  mw:       "1080px",
};

/* ═══════════════════════════════════════════════
   GLOBAL CSS
═══════════════════════════════════════════════ */
function GlobalCSS() {
  useEffect(() => {
    const s = document.createElement("style");
    s.id = "bcz-global";
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Outfit:wght@300;400;500;600;700&family=Syne:wght@700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{scroll-behavior:smooth;font-size:16px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
      body{background:${T.cream};color:${T.ink};overflow-x:hidden}
      a{text-decoration:none;color:inherit}
      img{display:block;max-width:100%}
      button{cursor:pointer;border:none;background:none;font-family:inherit}
      input,textarea{font-family:inherit}

      ::-webkit-scrollbar{width:3px}
      ::-webkit-scrollbar-track{background:${T.navyD}}
      ::-webkit-scrollbar-thumb{background:${T.gold};border-radius:2px}

      /* ── scroll progress bar ── */
      #bcz-progress{position:fixed;top:0;left:0;height:2px;background:linear-gradient(90deg,${T.gold},${T.goldL});z-index:9999;transition:width 0.1s linear;pointer-events:none}

      /* ── reveal ── */
      .rv{opacity:0;transform:translateY(28px);transition:opacity .7s cubic-bezier(.4,0,.2,1),transform .7s cubic-bezier(.4,0,.2,1)}
      .rv.on{opacity:1;transform:translateY(0)}
      .rv-l{opacity:0;transform:translateX(-28px);transition:opacity .7s .1s cubic-bezier(.4,0,.2,1),transform .7s .1s cubic-bezier(.4,0,.2,1)}
      .rv-l.on{opacity:1;transform:translateX(0)}
      .rv-r{opacity:0;transform:translateX(28px);transition:opacity .7s .15s cubic-bezier(.4,0,.2,1),transform .7s .15s cubic-bezier(.4,0,.2,1)}
      .rv-r.on{opacity:1;transform:translateX(0)}

      /* ── keyframes ── */
      @keyframes fadeUp{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
      @keyframes floatR{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-7px) rotate(2deg)}}
      @keyframes shimmer{0%{background-position:-600px 0}100%{background-position:600px 0}}
      @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
      @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      @keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
      @keyframes marqRev{from{transform:translateX(-50%)}to{transform:translateX(0)}}
      @keyframes slideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
      @keyframes glow{0%,100%{box-shadow:0 0 20px ${T.gold}33}50%{box-shadow:0 0 40px ${T.gold}66}}

      /* ── marquee ── */
      .mq-wrap{overflow:hidden;white-space:nowrap;width:100%}
      .mq-inner{display:inline-flex;animation:marquee 28s linear infinite}
      .mq-inner:hover{animation-play-state:paused}
      .mq-inner2{display:inline-flex;animation:marqRev 32s linear infinite}

      /* ── card hover ── */
      .proj-card{transition:transform .28s cubic-bezier(.4,0,.2,1),box-shadow .28s cubic-bezier(.4,0,.2,1),border-color .28s cubic-bezier(.4,0,.2,1)}
      .proj-card:hover{transform:translateY(-7px) scale(1.01)}

      /* ── mobile ── */
      @media(max-width:768px){
        .desk{display:none!important}
        .mob-col{grid-template-columns:1fr!important}
        .mob-col3{grid-template-columns:1fr 1fr!important}
        .hero-r{display:none!important}
        .tl-alt{grid-template-columns:28px 1fr!important}
        .tl-empty{display:none!important}
      }
      @media(max-width:480px){
        .mob-col3{grid-template-columns:1fr!important}
        .stats-row{grid-template-columns:1fr 1fr!important}
      }
    `;
    document.head.appendChild(s);
    return () => { const el = document.getElementById("bcz-global"); if(el) el.remove(); };
  }, []);
  return null;
}

/* ═══════════════════════════════════════════════
   SCROLL PROGRESS + REVEAL OBSERVER
═══════════════════════════════════════════════ */
function useScrollFeatures() {
  const scrollY = useRef(0);
  useEffect(() => {
    // progress bar
    const bar = document.createElement("div");
    bar.id = "bcz-progress";
    document.body.appendChild(bar);

    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const pct = h > 0 ? (window.scrollY / h) * 100 : 0;
      bar.style.width = pct + "%";
      scrollY.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // reveal observer
    const obs = new IntersectionObserver(
      es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add("on"); }),
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    const observe = () => document.querySelectorAll(".rv,.rv-l,.rv-r").forEach(el => obs.observe(el));
    observe();
    const mo = new MutationObserver(observe);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      obs.disconnect(); mo.disconnect();
      bar.remove();
    };
  }, []);
  return scrollY;
}

function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const h = () => setY(window.scrollY);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  return y;
}

/* ═══════════════════════════════════════════════
   NETWORK CANVAS
═══════════════════════════════════════════════ */
function Net({ alpha = 0.6 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d");
    let raf;
    const resize = () => { c.width = c.offsetWidth; c.height = c.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(c);
    const N = Math.min(28, Math.floor((c.width * c.height) / 16000));
    const nodes = Array.from({ length: N }, () => ({
      x: Math.random()*c.width, y: Math.random()*c.height,
      vx: (Math.random()-.5)*.35, vy: (Math.random()-.5)*.35,
      r: Math.random()*2+1.5,
    }));
    const draw = () => {
      ctx.clearRect(0,0,c.width,c.height);
      nodes.forEach((n,i) => {
        n.x+=n.vx; n.y+=n.vy;
        if(n.x<0||n.x>c.width) n.vx*=-1;
        if(n.y<0||n.y>c.height) n.vy*=-1;
        for(let j=i+1;j<nodes.length;j++){
          const m=nodes[j], dx=n.x-m.x, dy=n.y-m.y, d=Math.hypot(dx,dy);
          if(d<130){
            ctx.beginPath();
            ctx.strokeStyle=`rgba(240,165,0,${(1-d/130)*.22*alpha})`;
            ctx.lineWidth=.8; ctx.moveTo(n.x,n.y); ctx.lineTo(m.x,m.y); ctx.stroke();
          }
        }
        ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2);
        ctx.fillStyle=`rgba(240,165,0,${(i%3===0?.55:.28)*alpha})`; ctx.fill();
      });
      raf=requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [alpha]);
  return <canvas ref={ref} style={{ position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none" }} />;
}

/* ═══════════════════════════════════════════════
   COUNTER
═══════════════════════════════════════════════ */
function Count({ to, pre="", suf="" }) {
  const [v, setV] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; obs.disconnect();
      const n = parseInt(String(to).replace(/\D/g,""));
      let cur=0; const step=Math.max(1,Math.ceil(n/60));
      const t = setInterval(()=>{ cur=Math.min(cur+step,n); setV(cur); if(cur>=n) clearInterval(t); },18);
    },{ threshold:.5 });
    if(ref.current) obs.observe(ref.current);
    return ()=>obs.disconnect();
  },[to]);
  return <span ref={ref}>{pre}{v.toLocaleString()}{suf}</span>;
}

/* ═══════════════════════════════════════════════
   PILL TAG
═══════════════════════════════════════════════ */
function Pill({ label }) {
  return (
    <span style={{
      fontFamily:"'Outfit',sans-serif", fontSize:10, fontWeight:700,
      letterSpacing:"0.1em", textTransform:"uppercase",
      color:T.gold, background:`${T.gold}14`, border:`1px solid ${T.gold}35`,
      borderRadius:6, padding:"3px 10px", whiteSpace:"nowrap",
    }}>{label}</span>
  );
}

/* ═══════════════════════════════════════════════
   BUTTON
═══════════════════════════════════════════════ */
function Btn({ children, href="#", v="primary", sz="md", onClick, full=false, style={} }) {
  const [h, setH] = useState(false);
  const pad = { sm:"9px 20px", md:"13px 28px", lg:"16px 38px" }[sz];
  const fz  = { sm:12, md:14, lg:15 }[sz];
  const variants = {
    primary: { background:h?T.goldL:T.gold, color:T.navy, border:`2px solid ${T.gold}`, boxShadow:h?`0 12px 36px rgba(240,165,0,.5)`:`0 4px 18px rgba(240,165,0,.28)`, transform:h?"translateY(-3px)":"none" },
    ghost:   { background:"transparent", color:h?T.gold:T.white, border:`1.5px solid ${h?T.gold:"rgba(255,255,255,.25)"}`, transform:h?"translateY(-3px)":"none" },
    outline: { background:h?`${T.gold}12`:"transparent", color:h?T.gold:T.ink, border:`1.5px solid ${h?T.gold:T.line}`, transform:h?"translateY(-2px)":"none" },
    outlineW:{ background:h?`${T.gold}18`:"transparent", color:T.white, border:`1.5px solid ${h?T.gold:"rgba(255,255,255,.3)"}`, transform:h?"translateY(-2px)":"none" },
  };
  const Tag = href!="#" ? "a" : "button";
  return (
    <Tag href={href!="#"?href:undefined} onClick={onClick}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      target={href.startsWith("http")?"_blank":undefined}
      rel={href.startsWith("http")?"noopener noreferrer":undefined}
      style={{ display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,
        padding:pad, borderRadius:11,
        fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:fz,
        letterSpacing:"0.02em", cursor:"pointer",
        transition:"all .22s cubic-bezier(.4,0,.2,1)",
        whiteSpace:"nowrap", width:full?"100%":"auto",
        ...variants[v], ...style,
      }}
    >{children}</Tag>
  );
}

/* ═══════════════════════════════════════════════
   SECTION LABEL
═══════════════════════════════════════════════ */
function Label({ text, light=false }) {
  return (
    <div style={{ display:"inline-flex",alignItems:"center",gap:10,marginBottom:14 }}>
      <span style={{ width:22,height:2,background:T.gold,borderRadius:1,display:"inline-block" }} />
      <span style={{ fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,
        letterSpacing:"0.14em",textTransform:"uppercase",color:T.gold }}>{text}</span>
      <span style={{ width:22,height:2,background:T.gold,borderRadius:1,display:"inline-block" }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MARQUEE STRIP
═══════════════════════════════════════════════ */
function Marquee({ items, reverse=false, bg=T.navy }) {
  const doubled = [...items,...items,...items,...items];
  return (
    <div style={{ background:bg, borderTop:`1px solid ${T.lineD}`, borderBottom:`1px solid ${T.lineD}`,
      padding:"14px 0", overflow:"hidden", position:"relative", zIndex:3 }}>
      <div className="mq-wrap">
        <div className={reverse?"mq-inner2":"mq-inner"} style={{ animationDuration:reverse?"36s":"28s" }}>
          {doubled.map((item,i)=>(
            <span key={i} style={{ display:"inline-flex",alignItems:"center",gap:16,
              fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:13,
              color:reverse?T.mist:T.gold,letterSpacing:"0.04em",
              paddingRight:48, whiteSpace:"nowrap" }}>
              <span style={{ width:5,height:5,borderRadius:"50%",background:T.gold,display:"inline-block",opacity:.6 }} />
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   NAV
═══════════════════════════════════════════════ */
const LINKS = [
  {label:"About",href:"#about"},
  {label:"Serve",href:"#serve"},
  {label:"Work",href:"#work"},
  {label:"Journey",href:"#journey"},
  {label:"Words",href:"#testimonials"},
  {label:"Contact",href:"#contact"},
];

function Nav() {
  const y = useScrollY();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  const scrolled = y > 60;

  useEffect(()=>{
    document.body.style.overflow = open?"hidden":"";
    return ()=>{ document.body.style.overflow=""; };
  },[open]);

  useEffect(()=>{
    const ids = LINKS.map(l=>l.href.slice(1));
    const obs = new IntersectionObserver(
      es=>es.forEach(e=>{ if(e.isIntersecting) setActive(e.target.id); }),
      { rootMargin:"-40% 0px -50% 0px" }
    );
    ids.forEach(id=>{ const el=document.getElementById(id); if(el) obs.observe(el); });
    return ()=>obs.disconnect();
  },[]);

  const go = (href) => {
    setOpen(false);
    setTimeout(()=>{
      const el = document.querySelector(href);
      if(el) el.scrollIntoView({ behavior:"smooth" });
    },320);
  };

  return (
    <>
      <nav style={{
        position:"fixed",top:0,left:0,right:0,zIndex:600,height:66,
        background:scrolled?"rgba(6,14,24,.96)":"transparent",
        backdropFilter:scrolled?"blur(20px)":"none",
        borderBottom:scrolled?`1px solid ${T.lineD}`:"none",
        transition:"all .3s ease",
        display:"flex",alignItems:"center",padding:`0 ${T.px}`,gap:16,
      }}>
        {/* Logo */}
        <a href="#" onClick={e=>{e.preventDefault();window.scrollTo({top:0,behavior:"smooth"});}}
          style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
          <div style={{ width:34,height:34,borderRadius:"50%",
            background:`linear-gradient(135deg,${T.gold},${T.goldL})`,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:T.navy,
            boxShadow:`0 0 18px ${T.gold}44`,flexShrink:0,animation:"glow 3s ease-in-out infinite" }}>Z</div>
          <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,
            color:T.white,letterSpacing:"-.01em" }}>
            Better<span style={{color:T.gold}}>Call</span>Zaal
          </span>
        </a>

        {/* Desktop links */}
        <div className="desk" style={{ display:"flex",alignItems:"center",gap:28,marginLeft:"auto",marginRight:28 }}>
          {LINKS.map(l=>(
            <a key={l.label} href={l.href}
              onClick={e=>{e.preventDefault();go(l.href);}}
              style={{ fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:500,
                color:active===l.href.slice(1)?T.gold:"rgba(255,255,255,.55)",
                letterSpacing:"0.03em",transition:"color .2s",
                borderBottom:`1.5px solid ${active===l.href.slice(1)?T.gold:"transparent"}`,
                paddingBottom:2 }}
              onMouseEnter={e=>e.currentTarget.style.color=T.gold}
              onMouseLeave={e=>e.currentTarget.style.color=active===l.href.slice(1)?T.gold:"rgba(255,255,255,.55)"}
            >{l.label}</a>
          ))}
        </div>
        <div className="desk" style={{ marginLeft:"auto" }}><Btn href="#contact" sz="sm">Let's Talk →</Btn></div>

        {/* Hamburger */}
        <button onClick={()=>setOpen(!open)} aria-label="Menu"
          style={{ marginLeft:"auto",display:"none",width:42,height:42,
            alignItems:"center",justifyContent:"center",flexDirection:"column",gap:5,
            borderRadius:10,background:`${T.gold}14`,border:`1px solid ${T.gold}30`,
            flexShrink:0,
          }} className="mob-menu-btn">
          {[0,1,2].map(i=>(
            <span key={i} style={{ display:"block",width:18,height:1.5,
              background:open?T.gold:T.white,borderRadius:1,transition:"all .25s",
              transform:i===0&&open?"rotate(45deg) translate(4px,4px)":i===2&&open?"rotate(-45deg) translate(4px,-4px)":"none",
              opacity:i===1&&open?0:1 }} />
          ))}
        </button>
      </nav>

      <style>{`@media(max-width:768px){.mob-menu-btn{display:flex!important}}`}</style>

      {/* Backdrop */}
      {open&&<div onClick={()=>setOpen(false)} style={{ position:"fixed",inset:0,zIndex:590,
        background:"rgba(6,14,24,.65)",backdropFilter:"blur(6px)" }} />}

      {/* Drawer */}
      <div style={{ position:"fixed",top:0,right:0,bottom:0,zIndex:595,
        width:"min(300px,84vw)",background:T.navyD,
        borderLeft:`1px solid ${T.lineD}`,
        transform:open?"translateX(0)":"translateX(100%)",
        transition:"transform .35s cubic-bezier(.4,0,.2,1)",
        display:"flex",flexDirection:"column",padding:"80px 28px 36px",
        overflowY:"auto" }}>
        <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,
          color:T.white,marginBottom:36 }}>
          Better<span style={{color:T.gold}}>Call</span>Zaal
        </div>
        <nav style={{ display:"flex",flexDirection:"column",gap:0 }}>
          {LINKS.map(l=>(
            <a key={l.label} href={l.href}
              onClick={e=>{e.preventDefault();go(l.href);}}
              style={{ fontFamily:"'Outfit',sans-serif",fontSize:17,fontWeight:600,
                color:active===l.href.slice(1)?T.gold:"rgba(255,255,255,.7)",
                padding:"15px 0",borderBottom:`1px solid ${T.lineD}`,
                display:"flex",alignItems:"center",justifyContent:"space-between",
                transition:"color .2s" }}>
              {l.label}
              <span style={{ color:T.gold,opacity:.5,fontSize:14 }}>→</span>
            </a>
          ))}
        </nav>
        <div style={{ marginTop:"auto",paddingTop:28,display:"flex",flexDirection:"column",gap:14 }}>
          <Btn href="#contact" onClick={()=>go("#contact")} full>Let's Talk →</Btn>
          <a href="mailto:zaalp99@gmail.com"
            style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,color:T.gold,textAlign:"center" }}>
            zaalp99@gmail.com
          </a>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════
   SCROLL-TO-TOP
═══════════════════════════════════════════════ */
function ScrollTop() {
  const y = useScrollY();
  const [h, setH] = useState(false);
  if(y < 500) return null;
  return (
    <button onClick={()=>window.scrollTo({top:0,behavior:"smooth"})}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      aria-label="Back to top"
      style={{ position:"fixed",bottom:24,right:20,zIndex:500,
        width:44,height:44,borderRadius:"50%",
        background:h?T.gold:T.navyD, border:`1.5px solid ${T.gold}`,
        color:h?T.navy:T.gold,fontSize:18,
        display:"flex",alignItems:"center",justifyContent:"center",
        boxShadow:h?`0 8px 28px ${T.gold}55`:`0 4px 18px rgba(0,0,0,.35)`,
        transition:"all .22s ease" }}>↑</button>
  );
}

/* ═══════════════════════════════════════════════
   HERO
═══════════════════════════════════════════════ */
function Hero() {
  return (
    <section style={{ position:"relative",minHeight:"100vh",
      background:`linear-gradient(150deg,${T.navyD} 0%,#0D1E30 55%,#0B1A28 100%)`,
      display:"flex",alignItems:"center",
      padding:`100px ${T.px} 80px`,overflow:"hidden" }}>
      <Net alpha={.7} />
      <div style={{ position:"absolute",top:"18%",left:"4%",width:480,height:480,
        background:`radial-gradient(circle,${T.gold}0C 0%,transparent 70%)`,
        borderRadius:"50%",pointerEvents:"none" }} />
      <div style={{ position:"absolute",bottom:"8%",right:"6%",width:340,height:340,
        background:`radial-gradient(circle,${T.gold}08 0%,transparent 70%)`,
        borderRadius:"50%",pointerEvents:"none" }} />

      <div style={{ maxWidth:T.mw,margin:"0 auto",width:"100%",position:"relative",zIndex:2 }}>
        <div className="mob-col" style={{ display:"grid",gridTemplateColumns:"1fr 400px",gap:64,alignItems:"center" }}>

          {/* LEFT */}
          <div>
            <div style={{ display:"inline-flex",alignItems:"center",gap:8,
              background:`${T.gold}12`,border:`1px solid ${T.gold}30`,
              borderRadius:99,padding:"7px 16px",marginBottom:28,
              animation:"fadeIn .8s ease both" }}>
              <span style={{ width:7,height:7,borderRadius:"50%",background:"#4ADE80",
                boxShadow:"0 0 8px #4ADE80",animation:"pulse 2s infinite",display:"inline-block" }} />
              <span style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:600,
                letterSpacing:"0.08em",color:"rgba(255,255,255,.7)" }}>
                Available · Engineer · Builder · Connector · Ecosystem Architect
              </span>
            </div>

            <h1 style={{ fontFamily:"'Cormorant Garamond',serif",
              fontSize:"clamp(44px,7.5vw,82px)",fontWeight:700,lineHeight:1.05,
              color:T.white,letterSpacing:"-.02em",marginBottom:22,
              animation:"fadeUp .8s .1s ease both",opacity:0,animationFillMode:"forwards" }}>
              Got a problem?<br />
              <span style={{ background:`linear-gradient(90deg,${T.gold} 0%,${T.goldL} 50%,${T.gold} 100%)`,
                backgroundSize:"600px 100%",WebkitBackgroundClip:"text",
                WebkitTextFillColor:"transparent",backgroundClip:"text",
                animation:"shimmer 3s linear infinite" }}>BetterCallZaal.</span>
            </h1>

            <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:"clamp(15px,2vw,18px)",
              color:"rgba(255,255,255,.55)",lineHeight:1.8,maxWidth:460,marginBottom:36,
              animation:"fadeUp .8s .2s ease both",opacity:0,animationFillMode:"forwards" }}>
              Tell me what you're building. I'll bring the right people to the table —
              including myself — to build, grow, and ship.
            </p>

            <div style={{ display:"flex",gap:14,flexWrap:"wrap",
              animation:"fadeUp .8s .3s ease both",opacity:0,animationFillMode:"forwards" }}>
              <Btn href="#contact" sz="lg">Start Building →</Btn>
              <Btn href="#work" v="ghost" sz="lg">See the Work</Btn>
            </div>

            {/* Hero stats */}
            <div className="stats-row" style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",
              marginTop:52,paddingTop:36,borderTop:`1px solid ${T.lineD}`,
              animation:"fadeUp .8s .4s ease both",opacity:0,animationFillMode:"forwards" }}>
              {[
                {val:"1000",suf:"+",pre:"",label:"People Connected"},
                {val:"50000",suf:"+",pre:"$",label:"On-chain Volume"},
                {val:"65",suf:"+",pre:"",label:"Open Source Repos"},
              ].map((s,i)=>(
                <div key={i} style={{ borderRight:i<2?`1px solid ${T.lineD}`:"none",
                  paddingRight:i<2?20:0,paddingLeft:i>0?20:0 }}>
                  <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif",
                    fontSize:"clamp(20px,3vw,28px)",fontWeight:800,color:T.gold,lineHeight:1 }}>
                    <Count to={s.val} pre={s.pre} suf={s.suf} />
                  </div>
                  <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:11,
                    color:"rgba(255,255,255,.38)",marginTop:5,fontWeight:500 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT */}
          <div className="hero-r" style={{ display:"flex",justifyContent:"center",alignItems:"center",position:"relative" }}>
            <div style={{ position:"relative",animation:"float 5s ease-in-out infinite" }}>
              <div style={{ width:300,height:300,borderRadius:"50%",
                background:`conic-gradient(from 0deg,${T.gold}77,${T.goldL}99,${T.gold}77)`,
                padding:3,animation:"spin 14s linear infinite",
                boxShadow:`0 0 60px ${T.gold}33,0 0 120px ${T.gold}18` }}>
                <div style={{ width:"100%",height:"100%",borderRadius:"50%",
                  background:T.navyD,overflow:"hidden",display:"flex",
                  alignItems:"center",justifyContent:"center" }}>
                  <img src="https://www.bettercallzaal.com/assets/pfp.jpeg" alt="Zaal"
                    style={{ width:"100%",height:"100%",objectFit:"cover" }}
                    onError={e=>{ e.target.style.display="none";
                      e.target.parentNode.innerHTML=`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:88px;font-weight:800;color:${T.gold}">Z</div>`; }}
                  />
                </div>
              </div>
              {[
                {top:-22,left:-32,icon:"🤝",text:"1,000+ Connected"},
                {bottom:-14,left:-44,icon:"🎵",text:"$50K+ On-chain"},
                {top:72,right:-48,icon:"⚡",text:"65+ Repos"},
              ].map((c,i)=>(
                <div key={i} style={{ position:"absolute",top:c.top,bottom:c.bottom,
                  left:c.left,right:c.right,
                  background:"rgba(11,22,34,.92)",backdropFilter:"blur(16px)",
                  border:`1px solid ${T.gold}28`,borderRadius:12,padding:"10px 14px",
                  display:"flex",alignItems:"center",gap:8,
                  boxShadow:"0 8px 32px rgba(0,0,0,.3)",whiteSpace:"nowrap",
                  animation:`float ${4.5+i*.7}s ease-in-out infinite`,
                  animationDelay:`${i*.8}s` }}>
                  <span style={{fontSize:16}}>{c.icon}</span>
                  <span style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:600,color:T.white }}>{c.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scroll cue */}
      <div style={{ position:"absolute",bottom:28,left:"50%",transform:"translateX(-50%)",
        display:"flex",flexDirection:"column",alignItems:"center",gap:8,
        animation:"float 2.5s ease-in-out infinite" }}>
        <span style={{ fontFamily:"'Outfit',sans-serif",fontSize:9,letterSpacing:".18em",
          color:"rgba(255,255,255,.25)",textTransform:"uppercase" }}>scroll</span>
        <div style={{ width:1,height:36,background:`linear-gradient(to bottom,${T.gold}88,transparent)` }} />
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   MARQUEE 1 — after hero
═══════════════════════════════════════════════ */
const M1 = ["Engineer","Builder","Connector","Ecosystem Architect","DAO Governance","Creator Economy","Solana","Farcaster","Open Source","IRL Events","Web3 Music","Build in Public","Maine, USA","The ZAO","WaveWarZ","ZAO Festivals","Podcast Host"];

/* ═══════════════════════════════════════════════
   ABOUT
═══════════════════════════════════════════════ */
function About() {
  return (
    <section id="about" style={{ background:T.cream,position:"relative",overflow:"hidden" }}>
      <div style={{ position:"absolute",top:-60,right:-60,width:380,height:380,
        background:`radial-gradient(circle,${T.gold}0B 0%,transparent 70%)`,
        borderRadius:"50%",pointerEvents:"none" }} />
      <div style={{ maxWidth:T.mw,margin:"0 auto",padding:`88px ${T.px}`,position:"relative",zIndex:2 }}>
        <div className="mob-col" style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:72,alignItems:"center" }}>

          {/* Image */}
          <div className="rv-l" style={{ position:"relative" }}>
            <div style={{ borderRadius:24,overflow:"hidden",
              boxShadow:"0 24px 80px rgba(11,22,34,.14)",
              border:`2px solid ${T.gold}28`,aspectRatio:"4/5",background:T.navyC,
              position:"relative" }}>
              <img src="https://www.bettercallzaal.com/assets/pfp.jpeg" alt="Zaal Panthaki"
                style={{ width:"100%",height:"100%",objectFit:"cover",display:"block" }}
                onError={e=>{ e.target.style.display="none";
                  e.target.parentNode.innerHTML=`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:110px;font-weight:800;color:${T.gold};background:${T.navyC}">Z</div>`; }}
              />
              {/* overlay */}
              <div style={{ position:"absolute",bottom:0,left:0,right:0,
                background:"linear-gradient(0deg,rgba(6,14,24,.95) 0%,transparent 100%)",
                padding:"32px 24px 22px" }}>
                <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:19,color:T.white }}>Zaal Panthaki</div>
                <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:13,color:T.gold,marginTop:4 }}>
                  Founder · The ZAO · Maine, USA
                </div>
              </div>
            </div>
            {/* floating badge */}
            <div style={{ position:"absolute",top:-18,right:-18,
              background:T.gold,borderRadius:14,padding:"14px 16px",
              boxShadow:`0 8px 28px ${T.gold}44`,textAlign:"center",
              animation:"floatR 4.5s ease-in-out infinite" }}>
              <div style={{fontSize:20,marginBottom:4}}>⚡</div>
              <div style={{ fontFamily:"'Outfit',sans-serif",fontWeight:700,
                fontSize:10,color:T.navy,lineHeight:1.4,letterSpacing:".04em",textTransform:"uppercase" }}>
                BS Electrical<br/>Engineering<br/>RIT
              </div>
            </div>
          </div>

          {/* Text */}
          <div className="rv-r">
            <Label text="Meet Zaal" />
            <h2 style={{ fontFamily:"'Cormorant Garamond',serif",
              fontSize:"clamp(28px,4vw,46px)",fontWeight:700,
              color:T.navy,lineHeight:1.18,letterSpacing:"-.02em",
              marginBottom:22 }}>
              Closing the gap between builders and the people who need them.
            </h2>
            <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:16,color:T.slate,lineHeight:1.85,marginBottom:18 }}>
              For too long, middlemen have extracted from artists — their revenue, their data, their audiences.
              I build the infrastructure that gives it back.
            </p>
            <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:16,color:T.slate,lineHeight:1.85,marginBottom:18 }}>
              I'm <strong style={{color:T.navy}}>Zaal</strong> — electrical engineer turned ecosystem architect,
              based in Maine. I founded <strong style={{color:T.gold}}>The ZAO</strong> to close the gap between
              blockchain tools and creator distribution.
            </p>
            <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:16,color:T.slate,lineHeight:1.85,marginBottom:28 }}>
              I also connect builders, artists, and communities with the right people to make things happen.
              Whether you need infrastructure built or the right introduction made — <em style={{color:T.ink}}>that's what I do.</em>
            </p>
            <div style={{ display:"flex",flexWrap:"wrap",gap:8,marginBottom:32 }}>
              {["Ecosystem Architect","Creator Economy","DAO Governance","Farcaster","Solana","IRL Events","Open Source","MIT Licensed"].map(t=><Pill key={t} label={t} />)}
            </div>
            <Btn href="#contact" sz="lg">Work with Zaal →</Btn>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   WHO I SERVE
═══════════════════════════════════════════════ */
function Serve() {
  const cards = [
    { icon:"🎨",who:"Artists & Creators",
      blurb:"You make the work. You should own it — the revenue, the audience, the data. Zaal builds infrastructure that puts power back in creative hands.",
      detail:"Connect with the community, find collaborators, and own your work.",
      cta:"Join the ZAO →",href:"https://www.thezao.com/about" },
    { icon:"🏗️",who:"Builders & Founders",
      blurb:"You've got a vision and a challenge. Zaal maps the network, makes the introductions, and gets in the trenches to ship what matters.",
      detail:"Tell me about your challenge. I'll connect you with the right people.",
      cta:"Get Connected →",href:"#contact" },
    { icon:"🌐",who:"Communities & DAOs",
      blurb:"Governance, open tooling, fractal coordination — building the spaces where serious people do serious work together.",
      detail:"Open-source infrastructure built for the long game.",
      cta:"Let's Build →",href:"#contact" },
  ];
  return (
    <section id="serve" style={{ background:T.navy,position:"relative",overflow:"hidden" }}>
      <Net alpha={.45} />
      <div style={{ maxWidth:T.mw,margin:"0 auto",padding:`88px ${T.px}`,position:"relative",zIndex:2 }}>
        <div className="rv" style={{ textAlign:"center",marginBottom:56 }}>
          <Label text="Who I Work With" />
          <h2 style={{ fontFamily:"'Cormorant Garamond',serif",
            fontSize:"clamp(28px,4vw,48px)",fontWeight:700,
            color:T.white,lineHeight:1.15,letterSpacing:"-.02em",marginBottom:14 }}>
            Are you a creator, a builder, or a community?
          </h2>
          <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:16,
            color:"rgba(255,255,255,.45)",maxWidth:480,margin:"0 auto" }}>
            Zaal connects the dots across the entire creator-builder-community triangle.
          </p>
        </div>
        <div className="mob-col" style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20 }}>
          {cards.map((c,i)=>{
            const [h,setH]=useState(false);
            return (
              <div key={i} className="rv"
                onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
                style={{ background:h?T.navyH:T.navyC,
                  border:`1px solid ${h?T.gold+"55":T.lineD}`,
                  borderRadius:18,padding:"36px 28px",
                  transition:"all .25s ease",
                  transform:h?"translateY(-6px)":"none",
                  boxShadow:h?`0 24px 60px rgba(0,0,0,.3)`:"none",
                  display:"flex",flexDirection:"column",gap:14,
                  position:"relative",overflow:"hidden" }}>
                <div style={{ position:"absolute",top:0,left:0,right:0,height:2,
                  background:h?`linear-gradient(90deg,transparent,${T.gold},transparent)`:"transparent",
                  transition:"all .25s" }} />
                <div style={{fontSize:38}}>{c.icon}</div>
                <h3 style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,
                  fontSize:19,color:T.white }}>{c.who}</h3>
                <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:14,
                  color:"rgba(255,255,255,.5)",lineHeight:1.75 }}>{c.blurb}</p>
                <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:13,
                  color:T.gold,fontStyle:"italic",lineHeight:1.6 }}>{c.detail}</p>
                <Btn href={c.href} v="ghost" sz="sm" style={{alignSelf:"flex-start",marginTop:"auto"}}>{c.cta}</Btn>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   STATS
═══════════════════════════════════════════════ */
function Stats() {
  const data = [
    {val:"1000",suf:"+",pre:"",label:"Participants",note:"artists, builders & communities",icon:"🤝"},
    {val:"400",suf:"+",pre:"",label:"Newsletters",note:"build-in-public documentation",icon:"📬"},
    {val:"90",suf:"+",pre:"",label:"Governance Meetings",note:"fractal coordination in action",icon:"🏛️"},
    {val:"50000",suf:"+",pre:"$",label:"On-chain Volume",note:"WaveWarZ music prediction market",icon:"⛓️"},
    {val:"65",suf:"+",pre:"",label:"Open Repos",note:"MIT licensed, freely shared",icon:"💻"},
    {val:"2",suf:"",pre:"",label:"Festivals Produced",note:"ZAO-Palooza & ZAO-Chella",icon:"🎪"},
  ];
  return (
    <section style={{ background:T.goldPale,padding:`88px ${T.px}` }}>
      <div style={{ maxWidth:T.mw,margin:"0 auto" }}>
        <div className="rv" style={{ textAlign:"center",marginBottom:52 }}>
          <Label text="Real Impact" />
          <h2 style={{ fontFamily:"'Cormorant Garamond',serif",
            fontSize:"clamp(28px,4vw,46px)",fontWeight:700,
            color:T.navy,letterSpacing:"-.02em" }}>
            The numbers speak for themselves.
          </h2>
        </div>
        <div className="mob-col3" style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16 }}>
          {data.map((s,i)=>{
            const [h,setH]=useState(false);
            return (
              <div key={i} className="rv"
                onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
                style={{ background:h?T.navy:T.white,
                  border:`1px solid ${h?T.gold+"44":T.line}`,
                  borderRadius:16,padding:"28px 22px",
                  transition:"all .25s ease",
                  transform:h?"translateY(-4px)":"none",
                  boxShadow:h?`0 16px 48px rgba(11,22,34,.12)`:`0 2px 8px rgba(11,22,34,.04)`,
                  position:"relative",overflow:"hidden" }}>
                <div style={{ position:"absolute",top:0,left:0,right:0,height:2,
                  background:h?`linear-gradient(90deg,transparent,${T.gold},transparent)`:"transparent",
                  transition:"all .25s" }} />
                <div style={{fontSize:22,marginBottom:10}}>{s.icon}</div>
                <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif",
                  fontSize:"clamp(30px,4vw,42px)",fontWeight:800,
                  color:h?T.gold:T.navy,lineHeight:1,marginBottom:6 }}>
                  <Count to={s.val} pre={s.pre} suf={s.suf} />
                </div>
                <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:15,fontWeight:700,
                  color:h?T.white:T.navy,marginBottom:4 }}>{s.label}</div>
                <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,
                  color:h?"rgba(255,255,255,.45)":T.mist,lineHeight:1.5 }}>{s.note}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   MARQUEE 2 — between stats and work
═══════════════════════════════════════════════ */
const M2 = ["The ZAO","WaveWarZ","ZAO OS","ZAO Festivals","Let's Talk About Ethereum","Daily Newsletter","Fractal Governance","Creator Infrastructure","On-chain Music","IRL Events","Open Source","Build in Public"];

/* ═══════════════════════════════════════════════
   WORK — horizontal scroll on mobile
═══════════════════════════════════════════════ */
function Work() {
  const projects = [
    { emoji:"🌐",name:"The ZAO",
      tags:["DAO","Creator Economy","MIT Licensed"],
      desc:"Impact organization bringing ownership back to independent artists. Community infrastructure, fractal governance, creator tools — all open source.",
      stats:["1,000+ participants","90+ governance meetings","MIT licensed"],
      url:"https://www.thezao.com/",domain:"thezao.com" },
    { emoji:"🎵",name:"WaveWarZ",
      tags:["Solana","Prediction Market","Music"],
      desc:"Onchain music prediction market on Solana. Artists battle, fans trade. The future of music discovery is on-chain.",
      stats:["$50K+ on-chain volume"],
      url:"https://www.wavewarz.com/",domain:"wavewarz.com" },
    { emoji:"📱",name:"ZAO OS",
      tags:["Farcaster","Social Client","Music"],
      desc:"Farcaster social client for music communities. Encrypted messaging, 9-platform music player, and governance tools in one place.",
      stats:[],
      url:"https://zaoos.com",domain:"zaoos.com" },
    { emoji:"🎪",name:"ZAO Festivals",
      tags:["IRL","Events","NYC · Miami"],
      desc:"Real-world events at crypto conferences. ZAO-Palooza in NYC and ZAO-Chella in Miami — 22 artists, live on-chain music battles.",
      stats:["2 festivals · 22 artists"],
      url:"https://zaofestivals.com/",domain:"zaofestivals.com" },
    { emoji:"🎙️",name:"Let's Talk About Ethereum",
      tags:["Podcast","Ethereum","Weekly"],
      desc:"Weekly podcast on the Ethereum ecosystem. Deep dives with the builders and thinkers shaping the next chapter of web3.",
      stats:[],
      url:"https://pods.media/lets-talk-about-web3/",domain:"pods.media" },
    { emoji:"📰",name:"Daily Newsletter",
      tags:["Newsletter","Build in Public"],
      desc:"400+ editions of transparent, day-by-day documentation. What it actually looks like to build a creator ecosystem from the ground up.",
      stats:["400+ editions"],
      url:"https://paragraph.com/@thezao",domain:"paragraph.com" },
  ];

  const scrollRef = useRef(null);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(true);
  const check = () => {
    const el = scrollRef.current; if(!el) return;
    setCanL(el.scrollLeft > 10);
    setCanR(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };
  const scroll = (dir) => {
    const el = scrollRef.current; if(!el) return;
    el.scrollBy({ left: dir * 340, behavior:"smooth" });
  };

  return (
    <section id="work" style={{ background:T.cream,overflow:"hidden" }}>
      <div style={{ maxWidth:T.mw,margin:"0 auto",padding:`88px ${T.px} 40px` }}>
        <div className="rv" style={{ display:"flex",alignItems:"flex-end",
          justifyContent:"space-between",marginBottom:48,flexWrap:"wrap",gap:16 }}>
          <div>
            <Label text="Portfolio" />
            <h2 style={{ fontFamily:"'Cormorant Garamond',serif",
              fontSize:"clamp(28px,4vw,46px)",fontWeight:700,
              color:T.navy,letterSpacing:"-.02em",lineHeight:1.15,marginBottom:10 }}>
              The Work
            </h2>
            <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:15,color:T.slate,maxWidth:380 }}>
              Every project is live and shipping — not a concept or a deck.
            </p>
          </div>
          <div style={{ display:"flex",gap:10 }}>
            <button onClick={()=>scroll(-1)} disabled={!canL}
              style={{ width:40,height:40,borderRadius:"50%",border:`1.5px solid ${canL?T.gold:T.line}`,
                color:canL?T.gold:T.mist,fontSize:18,display:"flex",alignItems:"center",
                justifyContent:"center",transition:"all .2s",
                background:canL?`${T.gold}10`:"transparent",cursor:canL?"pointer":"default" }}>←</button>
            <button onClick={()=>scroll(1)} disabled={!canR}
              style={{ width:40,height:40,borderRadius:"50%",border:`1.5px solid ${canR?T.gold:T.line}`,
                color:canR?T.gold:T.mist,fontSize:18,display:"flex",alignItems:"center",
                justifyContent:"center",transition:"all .2s",
                background:canR?`${T.gold}10`:"transparent",cursor:canR?"pointer":"default" }}>→</button>
          </div>
        </div>
      </div>

      {/* Horizontal scroll track */}
      <div ref={scrollRef} onScroll={check}
        style={{ display:"flex",gap:20,overflowX:"auto",
          padding:`0 ${T.px} 60px`,scrollSnapType:"x mandatory",
          scrollbarWidth:"none",msOverflowStyle:"none" }}>
        <style>{`.no-sb::-webkit-scrollbar{display:none}`}</style>
        {projects.map((p,i)=>{
          const [h,setH]=useState(false);
          return (
            <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
              style={{ textDecoration:"none",flexShrink:0,
                width:"clamp(280px,38vw,340px)",scrollSnapAlign:"start" }}>
              <div className="proj-card"
                onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
                style={{ background:h?T.navy:T.white,
                  border:`1px solid ${h?T.gold+"44":T.line}`,
                  borderRadius:18,padding:"28px 24px",height:"100%",
                  display:"flex",flexDirection:"column",gap:14,
                  boxShadow:h?`0 20px 56px rgba(11,22,34,.15)`:`0 2px 10px rgba(11,22,34,.05)`,
                  position:"relative",overflow:"hidden" }}>
                <div style={{ position:"absolute",top:0,left:0,right:0,height:2,
                  background:h?`linear-gradient(90deg,transparent,${T.gold},transparent)`:"transparent",
                  transition:"all .3s" }} />
                <div style={{fontSize:30}}>{p.emoji}</div>
                <div style={{flex:1}}>
                  <h3 style={{ fontFamily:"'Syne',sans-serif",fontSize:17,fontWeight:800,
                    color:h?T.white:T.navy,marginBottom:8,lineHeight:1.2 }}>{p.name}</h3>
                  <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:13,
                    color:h?"rgba(255,255,255,.55)":T.slate,lineHeight:1.72 }}>{p.desc}</p>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {p.tags.map(t=><Pill key={t} label={t} />)}
                </div>
                {p.stats.length>0&&(
                  <div style={{ display:"flex",gap:10,flexWrap:"wrap",
                    borderTop:`1px solid ${h?T.gold+"22":T.line}`,paddingTop:12 }}>
                    {p.stats.map(s=><span key={s} style={{ fontFamily:"'Outfit',sans-serif",
                      fontSize:11,fontWeight:700,color:T.gold }}>{s}</span>)}
                  </div>
                )}
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",
                  borderTop:`1px solid ${h?T.gold+"22":T.line}`,paddingTop:12 }}>
                  <span style={{ fontFamily:"'Outfit',sans-serif",fontSize:11,
                    fontWeight:600,color:T.mist }}>{p.domain}</span>
                  <span style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,
                    fontWeight:700,color:T.gold }}>View →</span>
                </div>
              </div>
            </a>
          );
        })}
        <div style={{flexShrink:0,width:40}} /> {/* end spacer */}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   JOURNEY TIMELINE
═══════════════════════════════════════════════ */
function Journey() {
  const events = [
    {year:"2022",icon:"🎓",title:"BS Electrical Engineering, RIT",
      detail:"Led a $1.5M robotics project — achieved 7× throughput improvement. Started seeing the systems that hold creators back."},
    {year:"2022",icon:"🌊",title:"Entered Web3 in the Bear Market",
      detail:'"The people still building were serious." Bear markets reveal who is building for real — Zaal stayed.'},
    {year:"2023",icon:"🌱",title:"Founded The ZAO",
      detail:"Creator infrastructure for independent artists — open source from day one. Community first, always."},
    {year:"2024",icon:"🎪",title:"ZAO-Palooza & ZAO-Chella",
      detail:"Produced 2 live festivals: NYC and Miami. 22 artists. On-chain music battles, IRL energy, no middlemen."},
    {year:"2025",icon:"📈",title:"300+ Newsletters · WaveWarZ $50K+",
      detail:"90+ fractal governance meetings. WaveWarZ hits $50K+ in verified on-chain volume. The ecosystem grows itself."},
    {year:"2026",icon:"🚀",title:"ZAO OS + ZAO Stock · Festival Ahead",
      detail:"ZAO OS ships. ZAO Stock launches. A full festival planned for Ellsworth, Maine. Infrastructure becomes movement."},
  ];
  return (
    <section id="journey" style={{ background:T.navy,position:"relative",overflow:"hidden" }}>
      <Net alpha={.38} />
      <div style={{ maxWidth:T.mw,margin:"0 auto",padding:`88px ${T.px}`,position:"relative",zIndex:2 }}>
        <div className="rv" style={{textAlign:"center",marginBottom:64}}>
          <Label text="The Journey" />
          <h2 style={{ fontFamily:"'Cormorant Garamond',serif",
            fontSize:"clamp(28px,4vw,46px)",fontWeight:700,
            color:T.white,letterSpacing:"-.02em",marginBottom:14 }}>
            Building in public since day one.
          </h2>
          <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:15,
            color:"rgba(255,255,255,.4)",maxWidth:420,margin:"0 auto" }}>
            Every milestone shipped, documented, and shared with the community.
          </p>
        </div>

        <div style={{ maxWidth:680,margin:"0 auto",position:"relative" }}>
          {/* Centre line */}
          <div style={{ position:"absolute",left:"50%",top:0,bottom:0,width:1,
            background:`linear-gradient(to bottom,transparent,${T.gold}66,${T.gold}44,transparent)`,
            transform:"translateX(-50%)" }} />

          {events.map((e,i)=>{
            const isL = i%2===0;
            return (
              <div key={i} className={`rv tl-alt`}
                style={{ display:"grid",gridTemplateColumns:"1fr 36px 1fr",
                  alignItems:"start",marginBottom:24 }}>
                {isL ? (
                  <>
                    <div className="tl-empty" style={{ background:T.navyC,border:`1px solid ${T.lineD}`,borderRadius:14,padding:"18px 20px",textAlign:"right" }}>
                      <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:T.gold,marginBottom:5,letterSpacing:".1em" }}>{e.year}</div>
                      <div style={{ fontFamily:"'Syne',sans-serif",fontSize:13,fontWeight:800,color:T.white,marginBottom:6 }}>{e.title}</div>
                      <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.42)",lineHeight:1.68 }}>{e.detail}</div>
                    </div>
                    <div style={{display:"flex",justifyContent:"center",paddingTop:16}}>
                      <div style={{ width:30,height:30,borderRadius:"50%",background:T.navyD,
                        border:`2px solid ${T.gold}`,display:"flex",alignItems:"center",
                        justifyContent:"center",fontSize:13,boxShadow:`0 0 14px ${T.gold}33` }}>{e.icon}</div>
                    </div>
                    <div />
                  </>
                ):(
                  <>
                    <div />
                    <div style={{display:"flex",justifyContent:"center",paddingTop:16}}>
                      <div style={{ width:30,height:30,borderRadius:"50%",background:T.navyD,
                        border:`2px solid ${T.gold}`,display:"flex",alignItems:"center",
                        justifyContent:"center",fontSize:13,boxShadow:`0 0 14px ${T.gold}33` }}>{e.icon}</div>
                    </div>
                    <div style={{ background:T.navyC,border:`1px solid ${T.lineD}`,borderRadius:14,padding:"18px 20px" }}>
                      <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:T.gold,marginBottom:5,letterSpacing:".1em" }}>{e.year}</div>
                      <div style={{ fontFamily:"'Syne',sans-serif",fontSize:13,fontWeight:800,color:T.white,marginBottom:6 }}>{e.title}</div>
                      <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.42)",lineHeight:1.68 }}>{e.detail}</div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   MARQUEE 3 — between journey and testimonials
═══════════════════════════════════════════════ */
const M3 = ["Zaal helped build and scale WaveWarZ","$60K+ in volume","1.2K followers in months","This is your GUY","Creating spaces for communication","Positive weekly bridges","Connecting since 2022"];

/* ═══════════════════════════════════════════════
   TESTIMONIALS
═══════════════════════════════════════════════ */
function Testimonials() {
  const items = [
    { quote:"Zaal helped build and scale WaveWarZ to over $60k+ in volume with a completely new music model, over 1.2k followers on X in a few months, and organized and hosted our first in real life WaveWarZ battle. Without Zaal WaveWarZ would not be dominating Web3 Music the way it is now. This is your GUY.",
      name:"Hurric4n3Ike",handle:"@hurric4n3ike",platform:"𝕏",href:"https://x.com/hurric4n3ike" },
    { quote:"I have been connecting with Zaal since 2022 and he has been creating spaces for communications where to coordinate which has helped me to share my journey at the same time I learn from others, which has created positive weekly bridges where to align and give and receive information and opportunities.",
      name:"Jose Cabrera",handle:"@joseacabrerav",platform:"𝕏",href:"https://x.com/joseacabrerav" },
  ];
  return (
    <section id="testimonials" style={{ background:T.cream,overflow:"hidden" }}>
      <div style={{ maxWidth:T.mw,margin:"0 auto",padding:`88px ${T.px}` }}>
        <div className="rv" style={{textAlign:"center",marginBottom:52}}>
          <Label text="Testimonials" />
          <h2 style={{ fontFamily:"'Cormorant Garamond',serif",
            fontSize:"clamp(28px,4vw,46px)",fontWeight:700,
            color:T.navy,letterSpacing:"-.02em" }}>
            Real words from real people.
          </h2>
        </div>
        <div className="mob-col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
          {items.map((t,i)=>(
            <div key={i} className="rv"
              style={{ background:T.white,border:`1px solid ${T.line}`,
                borderRadius:18,padding:"36px 30px",
                boxShadow:"0 4px 22px rgba(11,22,34,.06)",position:"relative" }}>
              <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:80,
                color:T.gold,opacity:.14,position:"absolute",top:8,left:22,
                lineHeight:1,fontWeight:700,pointerEvents:"none" }}>"</div>
              <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:15,
                color:T.slate,lineHeight:1.82,marginBottom:28,position:"relative",zIndex:1 }}>{t.quote}</p>
              <a href={t.href} target="_blank" rel="noopener noreferrer"
                style={{ display:"flex",alignItems:"center",gap:14,textDecoration:"none" }}>
                <div style={{ width:42,height:42,borderRadius:"50%",flexShrink:0,
                  background:`linear-gradient(135deg,${T.gold}44,${T.gold}18)`,
                  border:`2px solid ${T.gold}44`,display:"flex",alignItems:"center",
                  justifyContent:"center",fontFamily:"'Syne',sans-serif",
                  fontSize:18,fontWeight:800,color:T.gold }}>{t.name[0]}</div>
                <div>
                  <div style={{ fontFamily:"'Syne',sans-serif",fontSize:14,fontWeight:800,color:T.navy }}>{t.name}</div>
                  <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,color:T.mist,marginTop:2 }}>{t.platform} · {t.handle}</div>
                </div>
              </a>
            </div>
          ))}
        </div>

        {/* CTA card */}
        <div className="rv" style={{ background:T.white,border:`1.5px dashed ${T.line}`,
          borderRadius:16,padding:"28px 30px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          flexWrap:"wrap",gap:16 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,color:T.navy,marginBottom:4 }}>Worked with Zaal?</div>
            <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:13,color:T.mist }}>Leave a testimonial — submissions are reviewed before going live.</div>
          </div>
          <Btn href="mailto:zaalp99@gmail.com?subject=Testimonial" v="outline">Submit a Testimonial →</Btn>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   CONTACT
═══════════════════════════════════════════════ */
function Contact() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({name:"",idea:"",contact:""});
  const set = k => e => setForm(p=>({...p,[k]:e.target.value}));

  return (
    <section id="contact" style={{ background:T.navy,position:"relative",overflow:"hidden" }}>
      <Net alpha={.38} />
      <div style={{ maxWidth:T.mw,margin:"0 auto",padding:`88px ${T.px} 96px`,position:"relative",zIndex:2 }}>
        <div className="mob-col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:72,alignItems:"start"}}>

          {/* Left */}
          <div className="rv-l">
            <Label text="Let's Build" />
            <h2 style={{ fontFamily:"'Cormorant Garamond',serif",
              fontSize:"clamp(32px,5vw,56px)",fontWeight:700,
              color:T.white,lineHeight:1.1,letterSpacing:"-.02em",marginBottom:14 }}>
              Got a problem?<br/>
              <span style={{color:T.gold}}>BetterCallZaal.</span>
            </h2>
            <p style={{ fontFamily:"'Outfit',sans-serif",fontSize:15,
              color:"rgba(255,255,255,.45)",lineHeight:1.8,marginBottom:32 }}>
              Or reach out directly at{" "}
              <a href="mailto:zaalp99@gmail.com"
                style={{color:T.gold,fontWeight:600}}>zaalp99@gmail.com</a>
            </p>

            {/* Quick links */}
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:32}}>
              {[
                {icon:"📅",label:"Book a 30-min call",sub:"Calendly",href:"https://calendly.com/zaalp99/30minmeeting"},
                {icon:"🐦",label:"Follow on X / Twitter",sub:"@bettercallzaal",href:"https://twitter.com/bettercallzaal"},
                {icon:"💬",label:"Find on Farcaster",sub:"Warpcast",href:"https://warpcast.com/"},
                {icon:"🌐",label:"The ZAO Ecosystem",sub:"thezao.com",href:"https://www.thezao.com/"},
                {icon:"🔗",label:"Share on LinkedIn",sub:"linkedin.com",href:"https://www.linkedin.com/sharing/share-offsite/?url=https://bettercallzaal.com"},
              ].map((l,i)=>(
                <a key={i} href={l.href} target="_blank" rel="noopener noreferrer"
                  style={{ display:"flex",alignItems:"center",gap:14,padding:"12px 14px",
                    borderRadius:11,border:`1px solid ${T.lineD}`,
                    transition:"all .2s",textDecoration:"none" }}
                  onMouseEnter={e=>{ e.currentTarget.style.background=T.navyC; e.currentTarget.style.borderColor=`${T.gold}44`; }}
                  onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor=T.lineD; }}>
                  <span style={{fontSize:18,flexShrink:0}}>{l.icon}</span>
                  <div>
                    <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:14,fontWeight:600,color:T.white }}>{l.label}</div>
                    <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:11,color:T.mist }}>{l.sub}</div>
                  </div>
                  <span style={{marginLeft:"auto",color:T.gold,opacity:.5,fontSize:13}}>→</span>
                </a>
              ))}
            </div>
            <Btn href="https://calendly.com/zaalp99/30minmeeting" sz="lg">📅 Book a Call</Btn>
          </div>

          {/* Right — form */}
          <div className="rv-r">
            {!sent ? (
              <div style={{ background:T.navyC,border:`1px solid ${T.lineD}`,borderRadius:20,padding:"36px 30px" }}>
                <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,
                  color:T.white,marginBottom:28 }}>Send a message</div>
                {[
                  {k:"name",label:"Your Name",ph:"Who are you?"},
                  {k:"idea",label:"What do you want to build?",ph:"Tell me your vision..."},
                  {k:"contact",label:"Best way to reach you",ph:"email, X handle, Farcaster, Telegram..."},
                ].map(f=>(
                  <div key={f.k} style={{marginBottom:20}}>
                    <label style={{ fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,
                      letterSpacing:".09em",textTransform:"uppercase",color:T.mist,
                      display:"block",marginBottom:8 }}>{f.label}</label>
                    <input value={form[f.k]} onChange={set(f.k)} placeholder={f.ph}
                      style={{ width:"100%",padding:"13px 16px",
                        background:T.navy,border:`1.5px solid ${T.lineD}`,
                        borderRadius:10,color:T.white,
                        fontFamily:"'Outfit',sans-serif",fontSize:14,
                        outline:"none",transition:"border-color .2s" }}
                      onFocus={e=>e.target.style.borderColor=T.gold}
                      onBlur={e=>e.target.style.borderColor=T.lineD} />
                  </div>
                ))}
                <Btn onClick={()=>setSent(true)} full sz="lg" style={{marginTop:8}}>Send It →</Btn>
              </div>
            ) : (
              <div style={{ background:T.navyC,border:`1.5px solid ${T.gold}44`,
                borderRadius:20,padding:"64px 30px",textAlign:"center" }}>
                <div style={{fontSize:52,marginBottom:20}}>🚀</div>
                <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:34,
                  fontWeight:700,color:T.white,marginBottom:10 }}>Got it.</div>
                <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:15,
                  color:"rgba(255,255,255,.45)" }}>I'll be in touch soon.</div>
              </div>
            )}

            {/* Share row */}
            <div style={{ display:"flex",gap:20,justifyContent:"center",
              marginTop:20,flexWrap:"wrap" }}>
              {[
                {label:"Share on Farcaster",href:`https://warpcast.com/~/compose?text=Got+a+problem%3F+BetterCallZaal.+The+Connector.&embeds[]=https://bettercallzaal.com`},
                {label:"Share on X",href:"https://twitter.com/intent/tweet?text=Got+a+problem%3F+BetterCallZaal.&url=https://bettercallzaal.com&via=bettercallzaal"},
              ].map(s=>(
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:500,
                    color:T.mist,transition:"color .2s" }}
                  onMouseEnter={e=>e.currentTarget.style.color=T.gold}
                  onMouseLeave={e=>e.currentTarget.style.color=T.mist}>{s.label}</a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   FOOTER
═══════════════════════════════════════════════ */
function Footer() {
  return (
    <footer style={{ background:T.navyD,borderTop:`1px solid ${T.lineD}`,
      padding:`36px ${T.px}` }}>
      <div style={{ maxWidth:T.mw,margin:"0 auto",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        flexWrap:"wrap",gap:20 }}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{ width:32,height:32,borderRadius:"50%",
            background:`linear-gradient(135deg,${T.gold},${T.goldL})`,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:T.navy,flexShrink:0 }}>Z</div>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:T.white }}>
              Better<span style={{color:T.gold}}>Call</span>Zaal
            </div>
            <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:11,color:T.mist,marginTop:2 }}>
              © 2026 · The Connector · Part of The ZAO Ecosystem
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
          {[
            {l:"Farcaster",h:"https://warpcast.com/"},
            {l:"X / Twitter",h:"https://twitter.com/bettercallzaal"},
            {l:"Email",h:"mailto:zaalp99@gmail.com"},
            {l:"The ZAO",h:"https://www.thezao.com/"},
            {l:"ZAO Devs",h:"https://zao-dev.lovable.app/"},
            {l:"WaveWarZ",h:"https://www.wavewarz.com/"},
          ].map(x=>(
            <a key={x.l} href={x.h} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily:"'Outfit',sans-serif",fontSize:12,color:T.mist,transition:"color .2s" }}
              onMouseEnter={e=>e.currentTarget.style.color=T.gold}
              onMouseLeave={e=>e.currentTarget.style.color=T.mist}>{x.l}</a>
          ))}
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════ */
export default function BetterCallZaal() {
  useScrollFeatures();
  return (
    <>
      <GlobalCSS />
      <Nav />
      <Hero />
      <Marquee items={M1} />
      <About />
      <Serve />
      <Stats />
      <Marquee items={M2} reverse bg={T.cream} />
      <Work />
      <Journey />
      <Marquee items={M3} bg={T.goldPale} />
      <Testimonials />
      <Contact />
      <Footer />
      <ScrollTop />
    </>
  );
}
