/**
 * Animation authoring.
 *
 * Presets and parameters up top, a timeline strip below. The strip is for
 * ordering and offsets — dragging a bar changes its start time, which is the
 * thing that's genuinely awkward to set with a number box.
 */

import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PresetId, Tween } from '@shared/model/animation';
import {
  animationDuration,
  defaultTween,
  EASES,
  PRESETS,
  presetDef,
} from '@shared/model/animation';
import { newId } from '@shared/model/pack';
import { walk } from '@shared/model/nodes';
import { componentDef } from '@shared/model/components';
import { useEditor } from '../store/editor';
import { Field, NumberInput, Select, TextInput, Toggle } from './controls';

export function AnimationPanel(): JSX.Element | null {
  const layout = useEditor((s) => s.layout());
  const addTween = useEditor((s) => s.addTween);
  const selectedNodeIds = useEditor((s) => s.selectedNodeIds);
  const [openId, setOpenId] = useState<string | undefined>();

  if (!layout) return null;

  const spec = layout.animation;
  const total = Math.max(1, animationDuration(spec));

  return (
    <div className="timeline">
      <div className="row" style={{ marginBottom: 8 }}>
        <strong>Intro animation</strong>
        <div className="toolbar__spacer" />
        <span className="hint">{total.toFixed(2)}s</span>
        <button
          className="btn btn--sm"
          onClick={() =>
            addTween(
              defaultTween({
                id: newId(),
                name: selectedNodeIds.length ? 'Selected elements' : 'New tween',
                targetIds: [...selectedNodeIds],
              }),
            )
          }
        >
          + Tween
        </button>
      </div>

      {spec.tweens.length === 0 ? (
        <div className="hint">
          No animation yet. Select elements on the canvas, then add a tween — it
          starts out targeting whatever you had selected.
        </div>
      ) : null}

      {spec.tweens.map((tween) => (
        <TweenRow
          key={tween.id}
          tween={tween}
          total={total}
          open={openId === tween.id}
          onToggle={() => setOpenId(openId === tween.id ? undefined : tween.id)}
        />
      ))}

      {spec.tweens.length ? <TimelineFooter /> : null}
    </div>
  );
}

function TweenRow({
  tween,
  total,
  open,
  onToggle,
}: {
  tween: Tween;
  total: number;
  open: boolean;
  onToggle: () => void;
}): JSX.Element {
  const updateTween = useEditor((s) => s.updateTween);
  const removeTween = useEditor((s) => s.removeTween);
  const layout = useEditor((s) => s.layout());
  const selectedNodeIds = useEditor((s) => s.selectedNodeIds);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startPos: number } | undefined>(undefined);

  const def = presetDef(tween.preset);
  const staggerTail = tween.stagger
    ? tween.stagger.each * Math.max(0, tween.targetIds.length - 1)
    : 0;
  const width = ((tween.duration + staggerTail) / total) * 100;
  const left = (tween.position / total) * 100;

  function onPointerDown(event: ReactPointerEvent): void {
    dragRef.current = { startX: event.clientX, startPos: tween.position };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent): void {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !track) return;
    const seconds =
      ((event.clientX - drag.startX) / track.clientWidth) * total + drag.startPos;
    updateTween(tween.id, (t) => {
      // Snap to 20ms; sub-frame precision is noise at 60fps.
      t.position = Math.max(0, Math.round(seconds * 50) / 50);
    });
  }

  const targetNames = layout
    ? tween.targetIds
        .map((id) => {
          for (const node of walk(layout.root)) if (node.id === id) return node.name;
          return undefined;
        })
        .filter(Boolean)
    : [];

  return (
    <div>
      <div className="row">
        <Toggle
          checked={tween.enabled}
          onChange={(v) => updateTween(tween.id, (t) => void (t.enabled = v))}
          label=""
        />
        <button
          className="btn btn--sm"
          style={{ flex: 1, textAlign: 'left' }}
          onClick={onToggle}
        >
          {tween.name} — {def.label}
          <span className="hint" style={{ marginLeft: 6 }}>
            {targetNames.length
              ? `${targetNames.length} element${targetNames.length === 1 ? '' : 's'}`
              : tween.targetSelector
                ? tween.targetSelector
                : 'no targets'}
          </span>
        </button>
        <button
          className="btn btn--sm btn--danger"
          onClick={() => removeTween(tween.id)}
        >
          ×
        </button>
      </div>

      <div className="timeline__track" ref={trackRef}>
        <div
          className="timeline__bar"
          style={{ left: `${left}%`, width: `${Math.max(2, width)}%` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (dragRef.current = undefined)}
          title={`Starts at ${tween.position.toFixed(2)}s — drag to move`}
        >
          {tween.position.toFixed(2)}s
        </div>
      </div>

      {open ? (
        <div className="section__body">
          <Field label="Name">
            <TextInput
              value={tween.name}
              onChange={(v) => updateTween(tween.id, (t) => void (t.name = v))}
            />
          </Field>

          <Field label="Effect" help={def.description}>
            <Select<PresetId>
              value={tween.preset}
              options={PRESETS.map((p) => ({ value: p.id, label: p.label }))}
              onChange={(v) => updateTween(tween.id, (t) => void (t.preset = v))}
            />
          </Field>

          <Field label="Targets">
            <button
              className="btn btn--sm"
              disabled={!selectedNodeIds.length}
              onClick={() =>
                updateTween(tween.id, (t) => void (t.targetIds = [...selectedNodeIds]))
              }
            >
              Use current selection ({selectedNodeIds.length})
            </button>
          </Field>

          <Field
            label="Also match"
            advancedLabel="selector"
            help="A CSS selector, for rows generated by a component."
          >
            <TextInput
              value={tween.targetSelector}
              onChange={(v) =>
                updateTween(tween.id, (t) => void (t.targetSelector = v || undefined))
              }
              mono
            />
          </Field>

          <Field label="Duration" help="Seconds.">
            <NumberInput
              value={tween.duration}
              min={0}
              max={10}
              step={0.05}
              onChange={(v) => updateTween(tween.id, (t) => void (t.duration = v ?? 0.2))}
            />
          </Field>

          <Field label="Starts at" help="Seconds from the beginning of the intro.">
            <NumberInput
              value={tween.position}
              min={0}
              step={0.05}
              onChange={(v) => updateTween(tween.id, (t) => void (t.position = v ?? 0))}
            />
          </Field>

          <Field label="Motion curve" advancedLabel="ease">
            <Select
              value={tween.ease}
              options={EASES}
              onChange={(v) => updateTween(tween.id, (t) => void (t.ease = v))}
            />
          </Field>

          {def.usesDistance ? (
            <Field label="Travel distance" help="Pixels.">
              <NumberInput
                value={tween.distance}
                min={0}
                onChange={(v) => updateTween(tween.id, (t) => void (t.distance = v ?? 20))}
              />
            </Field>
          ) : null}

          {def.usesScale ? (
            <Field label="Starting scale" help="1 is final size.">
              <NumberInput
                value={tween.scaleFrom}
                min={0}
                step={0.02}
                onChange={(v) =>
                  updateTween(tween.id, (t) => void (t.scaleFrom = v ?? 1))
                }
              />
            </Field>
          ) : null}

          <Toggle
            checked={Boolean(tween.stagger)}
            onChange={(v) =>
              updateTween(tween.id, (t) => {
                t.stagger = v ? { each: 0.05, from: 'start' } : undefined;
              })
            }
            label="Stagger targets one after another"
          />

          {tween.stagger ? (
            <>
              <Field label="Gap between" help="Seconds between each target starting.">
                <NumberInput
                  value={tween.stagger.each}
                  min={0}
                  step={0.01}
                  onChange={(v) =>
                    updateTween(tween.id, (t) => {
                      if (t.stagger) t.stagger.each = v ?? 0.05;
                    })
                  }
                />
              </Field>
              <Field label="Starting from">
                <Select
                  value={tween.stagger.from}
                  options={[
                    { value: 'start', label: 'First target' },
                    { value: 'end', label: 'Last target' },
                    { value: 'center', label: 'Middle outwards' },
                    { value: 'edges', label: 'Edges inwards' },
                    { value: 'random', label: 'Random order' },
                  ]}
                  onChange={(v) =>
                    updateTween(tween.id, (t) => {
                      if (t.stagger) t.stagger.from = v;
                    })
                  }
                />
              </Field>
            </>
          ) : null}

          <Toggle
            checked={tween.skipEmpty}
            onChange={(v) => updateTween(tween.id, (t) => void (t.skipEmpty = v))}
            label="Skip elements with no data"
          />

          {tween.preset === 'custom' ? (
            <Field label="GSAP vars" stacked>
              <textarea
                className="textarea"
                value={tween.customVars ?? ''}
                placeholder={'autoAlpha: 0,\nrotation: -8,\nease: "back.out(2)"'}
                onChange={(e) =>
                  updateTween(tween.id, (t) => void (t.customVars = e.target.value))
                }
              />
            </Field>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TimelineFooter(): JSX.Element {
  const layout = useEditor((s) => s.layout());
  const updateLayout = useEditor((s) => s.updateLayout);
  if (!layout) return <></>;

  return (
    <div className="row" style={{ marginTop: 10 }}>
      <span className="field__label">Overall speed</span>
      <NumberInput
        value={layout.animation.timeScale}
        min={0.1}
        max={4}
        step={0.1}
        onChange={(v) =>
          updateLayout(layout.id, (l) => void (l.animation.timeScale = v ?? 1))
        }
      />
      <Toggle
        checked={layout.animation.replayOnShow}
        onChange={(v) =>
          updateLayout(layout.id, (l) => void (l.animation.replayOnShow = v))
        }
        label="Replay when the OBS source is shown"
      />
    </div>
  );
}

/** Components whose generated rows are worth suggesting as animation targets. */
export function componentItemSelector(kind: string): string | undefined {
  const def = componentDef(kind as never);
  return def ? `.${def.itemClass}` : undefined;
}
