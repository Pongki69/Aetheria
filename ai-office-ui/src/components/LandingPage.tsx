import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Bot, Box, Check, Coins, Compass, Cuboid, ExternalLink, Heart, House, Move3D, Sprout, Users, Volume2, VolumeX, Wrench } from 'lucide-react';
import './landing.css';

interface Props { onSignIn: () => void; }

const features = [
  { icon: House, title: 'Give your AI team a home', text: 'Build a 3D workspace where your agents have roles, desks, and room to grow.' },
  { icon: Cuboid, title: 'Bring your own models', text: 'Import custom 3D agents, avatars, and office decor to make the workspace yours.' },
  { icon: Bot, title: 'Organize agents around work', text: 'Create specialists for research, writing, planning, and the tasks you need done.' },
  { icon: Move3D, title: 'See work take shape', text: 'Keep agent activity visible in the same space where you build and manage your team.' },
  { icon: Users, title: 'Join other planes', text: 'Visit other players’ worlds, meet their AI teams, and explore together in multiplayer.' },
  { icon: Coins, title: 'Turn progress into growth', text: 'The planned economy will reward completed work with resources to unlock agents, expand your office, and grow your world.' }
];

function SoundtrackControl() {
  const [playing, setPlaying] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);

  useEffect(() => () => {
    oscillatorsRef.current.forEach((oscillator) => { try { oscillator.stop(); } catch { /* already stopped */ } });
    void contextRef.current?.close();
  }, []);

  const toggle = async () => {
    if (playing) {
      const context = contextRef.current;
      const master = masterRef.current;
      if (context && master) {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(0, context.currentTime, 0.18);
        window.setTimeout(() => { void context.close(); }, 900);
      }
      contextRef.current = null;
      masterRef.current = null;
      oscillatorsRef.current = [];
      setPlaying(false);
      return;
    }

    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    await context.resume();
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 560;
    master.gain.value = 0;
    master.connect(filter);
    filter.connect(context.destination);
    master.gain.setTargetAtTime(0.035, context.currentTime, 1.2);

    const oscillators = [110, 164.81, 220, 329.63].map((frequency, index) => {
      const oscillator = context.createOscillator();
      const voice = context.createGain();
      oscillator.type = index === 3 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index % 2 ? 4 : -3;
      voice.gain.value = index === 3 ? 0.08 : 0.22;
      oscillator.connect(voice);
      voice.connect(master);
      oscillator.start();
      return oscillator;
    });
    contextRef.current = context;
    masterRef.current = master;
    oscillatorsRef.current = oscillators;
    setPlaying(true);
  };

  return <button className="landing-soundtrack" onClick={() => void toggle()} aria-label={playing ? 'Turn soundtrack off' : 'Turn soundtrack on'} aria-pressed={playing} title={playing ? 'Soundtrack on' : 'Soundtrack off'}>{playing ? <Volume2 size={15} /> : <VolumeX size={15} />}<span>{playing ? 'Sound on' : 'Soundtrack'}</span></button>;
}

export function LandingPage({ onSignIn }: Props) {
  return <main className="landing-page">
    <div className="landing-glow landing-glow-one" /><div className="landing-glow landing-glow-two" />
    <header className="landing-nav"><a className="landing-brand" href="#home" aria-label="Aetheria home"><span className="landing-brand-mark"><img src="/images/aetheria-logo.png" alt="" /></span><span>AETHERIA</span></a><nav className="landing-nav-links" aria-label="Main navigation"><a href="#features">Features</a><a href="#planes">Work &amp; play</a><a href="#worlds">Your world</a><a href="#community">Community</a></nav><div className="landing-nav-actions"><SoundtrackControl /><button className="landing-signin" onClick={onSignIn}>Sign in <ArrowRight size={15} /></button></div></header>
    <section id="home" className="landing-hero">
      <div className="landing-hero-copy"><div className="landing-eyebrow"><span className="landing-live-dot" /> YOUR AI WORKFORCE, IN 3D</div><h1><span className="landing-title-name">Aetheria.</span><br />Your AI team,<br />at work.</h1><p>A spatial home for your AI team. Give agents real work, watch their progress in 3D, and grow the world around what they accomplish.</p><div className="landing-hero-actions"><button className="landing-primary" onClick={onSignIn}>Build your AI team <ArrowRight size={17} /></button><a className="landing-secondary" href="#planes">See how it works <ArrowDown size={15} /></a></div><div className="landing-proof"><div className="landing-proof-avatars"><i>✦</i><i>◈</i><i>✧</i></div><span>Think SimCity for your AI workforce</span></div></div>
      <div className="landing-world-art" aria-label="Illustration of a personal 3D world" role="img"><div className="world-art-orbit orbit-a" /><div className="world-art-orbit orbit-b" /><div className="world-art-grid" /><div className="world-art-platform"><div className="platform-top"><div className="platform-room"><div className="room-wall room-wall-left" /><div className="room-wall room-wall-right" /><div className="room-window" /><div className="room-sofa"><i /><i /><i /></div><div className="room-plant"><i /><i /><i /></div><div className="room-person"><i /><b /><span /></div></div></div></div><div className="art-3d-props" aria-hidden="true"><div className="prop-cube"><i className="cube-face cube-front" /><i className="cube-face cube-back" /><i className="cube-face cube-right" /><i className="cube-face cube-left" /><i className="cube-face cube-top" /><i className="cube-face cube-bottom" /></div><div className="prop-crystal"><i className="crystal-facet crystal-a" /><i className="crystal-facet crystal-b" /><i className="crystal-facet crystal-c" /><i className="crystal-facet crystal-d" /><i className="crystal-facet crystal-e" /><i className="crystal-facet crystal-f" /></div><div className="prop-orb"><i /></div></div><div className="art-label art-label-top"><span className="label-spark">✦</span> YOUR PLANE <small>01</small></div><div className="art-label art-label-bottom"><span className="label-status" /> WORLD ONLINE <small>LIVE</small></div><div className="art-floating-gem gem-one" /><div className="art-floating-gem gem-two" /></div>
      <div className="landing-scroll-cue"><span /> A WORLD OF YOUR OWN</div>
    </section>
    <section id="features" className="landing-features"><div className="landing-section-heading"><span className="landing-eyebrow">BUILD · DELEGATE · GROW</span><h2>Your AI team<br className="mobile-break" /> has a place here.</h2><p>Bring real work into a 3D world you can shape, observe, and expand.</p></div><div className="landing-feature-grid">{features.map(({ icon: Icon, title, text }, index) => <article className="landing-feature-card" key={title}><div className="landing-feature-top"><span className="landing-feature-icon"><Icon size={19} /></span><span className="landing-feature-index">0{index + 1}</span></div><h3>{title}</h3><p>{text}</p><span className="feature-card-glow" /></article>)}</div></section>
    <section id="planes" className="landing-planes"><div className="landing-section-heading"><span className="landing-eyebrow">ONE WORKFORCE · TWO CONNECTED PLANES</span><h2>Do the work.<br />Grow the world.</h2><p>Aetheria brings AI task management and world-building together. Work powers progress; progress gives you more room to build.</p></div><div className="plane-mode-grid">
      <article className="plane-mode-card plane-work"><div className="plane-mode-head"><span className="plane-mode-icon"><Bot size={23} /></span><span className="plane-mode-status status-work"><i /> AI WORKSPACE · PRODUCTIVITY</span></div><h3>Put your AI team to work.</h3><p className="plane-mode-intro">Create agents for useful tasks, organize them in a spatial office, and keep their activity visible as work moves forward.</p><ul><li><Check size={15} /> Create specialists for research, writing, and planning</li><li><Check size={15} /> Give each agent a role, instructions, and context</li><li><Check size={15} /> Coordinate work across agents and tasks</li><li><Check size={15} /> Customize the space with your own 3D models</li></ul><div className="plane-mode-visual work-visual"><div className="work-agent agent-a"><span className="agent-orb"><Bot size={19} /></span><b>Research agent</b><small>Ready for a task</small></div><div className="work-agent agent-b"><span className="agent-orb"><Cuboid size={18} /></span><b>Your model</b><small>Custom 3D asset</small></div><div className="work-connection" /><span className="work-prompt">“Prepare a project summary” <ArrowRight size={12} /></span></div></article>
      <article className="plane-mode-card plane-game"><div className="plane-mode-head"><span className="plane-mode-icon"><Sprout size={23} /></span><span className="plane-mode-status status-planned"><i /> AGENT ECONOMY · IN DEVELOPMENT</span></div><h3>Let completed work grow your world.</h3><p className="plane-mode-intro">The planned agent economy will reward useful work with resources to unlock more workers, expand your office, and build new spaces.</p><ul><li><Users size={15} /> Unlock slots for growing AI teams</li><li><Coins size={14} /> Earn resources from completed tasks</li><li><Sprout size={15} /> Build office modules and new spaces</li><li><Wrench size={15} /> Expand and upgrade your operation</li></ul><div className="plane-mode-visual game-visual"><div className="game-stat"><small>WORLD OPERATIONS</small><strong><i /> 4 active teams</strong></div><div className="management-row"><span>STORES</span><span>STUDIO</span><span>WORKSHOP</span><span>LOGISTICS</span></div><div className="game-worker"><span>✦</span><b>Model worker · Workshop</b><small>Building supplies · On task</small></div><div className="game-reward"><Coins size={14} /> +24 <small>credits</small></div></div></article>
    </div><p className="plane-mode-note">The Work Plane is an agentic AI workshop for creating agents and delegating practical work. The Game Plane is planned as a management sim about building organizations, leading teams, managing resources, and expanding your world.</p></section>
    <section id="worlds" className="landing-worlds"><div className="landing-section-heading"><span className="landing-eyebrow">YOUR AI OFFICE · YOUR WORLD</span><h2>Start with a team.<br />Build from there.</h2><p>See Aetheria as SimCity for your AI workforce: give agents a home, put them to work, and grow as you go.</p></div><div className="landing-steps"><article className="landing-step-card step-design"><div className="step-art step-art-house"><div className="mini-house"><span /><i /><b /></div><span className="step-art-spark">✦</span></div><div className="step-number">01 / CUSTOMIZE</div><h3>Design the workspace</h3><p>Import agents and decor, arrange the office, and make the environment your own.</p></article><article className="landing-step-card step-explore"><div className="step-art step-art-compass"><div className="compass-ring"><Compass size={42} /><span /></div><div className="compass-floor" /></div><div className="step-number">02 / DELEGATE</div><h3>Give agents useful work</h3><p>Set roles and instructions, then coordinate tasks across your AI workforce.</p></article><article id="community" className="landing-step-card step-connect"><div className="step-art step-art-community"><span className="community-orb orb-left">P</span><span className="community-orb orb-center">✦</span><span className="community-orb orb-right">A</span><i className="community-link link-one" /><i className="community-link link-two" /></div><div className="step-number">03 / CONNECT</div><h3>Visit other planes</h3><p>Join friends in multiplayer, explore their worlds, and see how they’ve built their AI workspace.</p></article></div></section>
    <section className="landing-invitation"><div className="invite-deco invite-deco-left"><Box size={25} /></div><div className="invite-deco invite-deco-right"><Heart size={22} /></div><span className="landing-eyebrow">YOUR AI WORKFORCE STARTS HERE</span><h2>Give your agents<br />a world to work in.</h2><p>Build a spatial workspace for the team you want to grow.</p><button className="landing-primary" onClick={onSignIn}>Build your AI team <ArrowRight size={17} /></button></section>
    <footer className="landing-footer"><div className="landing-footer-main"><div className="landing-footer-brand-column"><a className="landing-brand footer-brand" href="#home"><span className="landing-brand-mark"><img src="/images/aetheria-logo.png" alt="" /></span><span>AETHERIA</span></a><p className="footer-about">A spatial AI workspace where real work and world-building grow together.</p></div><section className="footer-about-me" aria-labelledby="about-creator-title"><span className="footer-overline">ABOUT THE CREATOR</span><h3 id="about-creator-title">Alfonso Panisales</h3><p>I’m the creator of Aetheria and Event Horizon, building creative tools and experiences that bring ideas to life.</p><a href="https://www.facebook.com/Pongki23/" target="_blank" rel="noreferrer">More about me <ExternalLink size={13} /></a></section><section className="footer-project" aria-labelledby="other-project-title"><span className="footer-overline">ANOTHER PROJECT</span><h3 id="other-project-title">Event Horizon</h3><p>A project I’ve been working on. Take a look at the live site.</p><a href="https://event-horizon-gray.vercel.app/" target="_blank" rel="noreferrer">Visit Event Horizon <ExternalLink size={13} /></a></section></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Aetheria. Made for curious minds.</span><div><a href="#features">Features</a><a href="#worlds">Explore</a><button onClick={onSignIn}>Sign in</button></div></div></footer>
  </main>;
}

