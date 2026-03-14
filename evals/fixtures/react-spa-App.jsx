/**
 * Minimal tab-nav App.jsx for the react-spa eval fixture.
 *
 * Three views, home, counter, and about, match the VIEWS keys in
 * react-spa-capture-views.mjs so capture.mjs --views-file can navigate them.
 */
import { useState } from 'react';

function Home() { return <main><h1>Home</h1><p>Welcome.</p></main>; }
function Counter() {
  const [n, setN] = useState(0);
  return <main><h1>Counter</h1><button onClick={() => setN(n + 1)}>count: {n}</button></main>;
}
function About() { return <main><h1>About</h1><p>About this app.</p></main>; }

const VIEWS = { home: Home, counter: Counter, about: About };

export default function App() {
  const [view, setView] = useState('home');
  const View = VIEWS[view];
  return (
    <div>
      <nav style={{ display: 'flex', gap: 8, padding: 12 }}>
        {Object.keys(VIEWS).map((v) => (
          <button key={v} onClick={() => setView(v)}>{v}</button>
        ))}
      </nav>
      <View />
    </div>
  );
}
