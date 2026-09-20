/**
 * App shell.
 *
 * Three panes: layouts and layers on the left, canvas and animation timeline
 * in the middle, inspector/theme/code on the right.
 */

import { useEffect, useState } from 'react';
import { emptyPack } from '@shared/model/pack';
import { createLayoutFromTemplate } from '@shared/model/factory';
import { useEditor } from './store/editor';
import { Toolbar } from './components/Toolbar';
import { LeftPane } from './components/LeftPane';
import { Canvas } from './components/Canvas';
import { AnimationPanel } from './components/AnimationPanel';
import { Inspector } from './components/Inspector';
import { ThemePanel } from './components/ThemePanel';
import { CodePanel } from './components/CodePanel';

type RightTab = 'inspector' | 'theme' | 'code';

export function App(): JSX.Element {
  const pack = useEditor((s) => s.pack);
  const setPack = useEditor((s) => s.setPack);
  const [rightTab, setRightTab] = useState<RightTab>('inspector');

  // A brand-new session starts with something on the canvas rather than an
  // empty document — there is nothing to learn from a blank 1920x1080 box.
  useEffect(() => {
    if (pack.layouts.length > 0) return;
    const starter = emptyPack('My overlay pack');
    starter.layouts.push(
      createLayoutFromTemplate('scoreboard', 'Scoreboard', 'my_scoreboard'),
    );
    setPack(starter);
  }, [pack.layouts.length, setPack]);

  return (
    <div className="app">
      <Toolbar />
      <div className="workspace">
        <LeftPane />

        <div className="canvas-wrap">
          <Canvas />
          <AnimationPanel />
        </div>

        <div className="pane pane--right">
          <div className="row" style={{ padding: '8px 12px', gap: 4 }}>
            {(['inspector', 'theme', 'code'] as const).map((tab) => (
              <button
                key={tab}
                className={`btn btn--sm${rightTab === tab ? ' btn--primary' : ''}`}
                onClick={() => setRightTab(tab)}
              >
                {tab === 'inspector'
                  ? 'Element'
                  : tab === 'theme'
                    ? 'Theme'
                    : 'Code'}
              </button>
            ))}
          </div>
          {rightTab === 'inspector' ? <Inspector /> : null}
          {rightTab === 'theme' ? <ThemePanel /> : null}
          {rightTab === 'code' ? <CodePanel /> : null}
        </div>
      </div>
    </div>
  );
}
