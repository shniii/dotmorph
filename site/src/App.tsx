import { useState } from 'react';
import { Showcase } from './showcase/Showcase';
import { Playground } from './playground/Playground';
import { HowItWorks } from './landing/HowItWorks';
import { CodeBlock } from './components/CodeBlock';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Segmented } from './components/Controls';
import { GitHubIcon, LogoMark, NpmIcon, XIcon } from './components/Icons';
import avatar from './assets/shnyar.webp';

const GITHUB = 'https://github.com/shniii/dotmorph';
const NPM = 'https://www.npmjs.com/package/dotmorph';
const AUTHOR_X = 'https://x.com/shinnoo22';
const AUTHOR_GITHUB = 'https://github.com/shniii';

const REACT_USAGE = `import { DotMorph } from 'dotmorph/react';
import { PALETTES } from 'dotmorph';

<div style={{ height: 420, background: PALETTES.aurora.background }}>
  <DotMorph shape="globe" palette="aurora" />
</div>`;

const VANILLA_USAGE = `import { DotMorphEngine } from 'dotmorph';

const engine = new DotMorphEngine(canvas, { shape: 'burst', palette: 'ocean' });
engine.start();

button.onclick = () => engine.morphTo('wave');`;

const USAGE_TABS = [
  { value: 'react', label: 'React' },
  { value: 'vanilla', label: 'Vanilla' },
] as const;

export default function App() {
  const [usage, setUsage] = useState<'react' | 'vanilla'>('react');

  return (
    <div className="page">
      <header className="hero">
        <nav className="hero__links" aria-label="Links">
          <a className="icon-button" href={GITHUB} aria-label="GitHub repository" target="_blank" rel="noreferrer">
            <GitHubIcon />
          </a>
          <a className="icon-button" href={NPM} aria-label="npm package" target="_blank" rel="noreferrer">
            <NpmIcon />
          </a>
          <a className="icon-button" href={AUTHOR_X} aria-label="Shnyar on X" target="_blank" rel="noreferrer">
            <XIcon />
          </a>
        </nav>
        <div className="hero__mark">
          <LogoMark size={34} />
        </div>
        <h1>dotmorph</h1>
        <p className="hero__tagline">Dots that morph between shapes through a swirling cloud. Open source, built on three.js, with a React component.</p>
      </header>

      <div className="card card--demo">
        <ErrorBoundary>
          <Showcase />
        </ErrorBoundary>
      </div>

      <section className="section">
        <h2>Installation</h2>
        <CodeBlock code="npm install dotmorph three" language="bash" />
      </section>

      <section className="section">
        <h2>Usage</h2>
        <div className="tabs">
          <Segmented options={USAGE_TABS} value={usage} onChange={setUsage} ariaLabel="Usage example" />
        </div>
        <CodeBlock code={usage === 'react' ? REACT_USAGE : VANILLA_USAGE} language={usage === 'react' ? 'tsx' : 'ts'} />
      </section>

      <section className="section">
        <h2>Playground</h2>
        <p className="section__sub">Pick a shape and a palette, shape the morph and the cloud, or open every parameter of the four shapes.</p>
        <ErrorBoundary>
          <Playground />
        </ErrorBoundary>
      </section>

      <section className="section">
        <h2>How it works</h2>
        <p className="section__sub">Every dot knows two places: its spot in the shape and its slot in the cloud.</p>
        <HowItWorks />
      </section>

      <footer className="footer">
        <a className="footer__author" href={AUTHOR_X} target="_blank" rel="noreferrer">
          <img className="footer__avatar" src={avatar} alt="" width={28} height={28} loading="lazy" decoding="async" />
          <span>
            Made by <strong>Shnyar</strong>
          </span>
        </a>
        <div className="footer__links">
          <a href={GITHUB} target="_blank" rel="noreferrer">
            Source
          </a>
          <span aria-hidden="true">·</span>
          <a href={NPM} target="_blank" rel="noreferrer">
            npm
          </a>
          <span aria-hidden="true">·</span>
          <a href={AUTHOR_GITHUB} target="_blank" rel="noreferrer">
            @shniii
          </a>
          <span aria-hidden="true">·</span>
          <span>MIT license</span>
        </div>
      </footer>
    </div>
  );
}
