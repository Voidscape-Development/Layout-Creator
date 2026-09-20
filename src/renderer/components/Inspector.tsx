/**
 * The property inspector.
 *
 * Sections appear based on what the selected node actually is, so a text node
 * never shows character-asset settings. Plain-language labels by default; the
 * Advanced switch reveals CSS property names and the raw-CSS escape hatch.
 */

import type { LayoutNode } from '@shared/model/nodes';
import { isContainer, parentOf } from '@shared/model/nodes';
import type { LayoutMode, StackAlign, StackDirection, StackJustify } from '@shared/model/style';
import { componentDef } from '@shared/model/components';
import { FIELDS, findField } from '@shared/model/bindings';
import { useEditor } from '../store/editor';
import {
  ColorInput,
  Field,
  LengthInput,
  NumberInput,
  Section,
  Select,
  TextInput,
  Toggle,
} from './controls';

const DIRECTIONS: readonly { value: StackDirection; label: string }[] = [
  { value: 'row', label: 'Left to right' },
  { value: 'row-reverse', label: 'Right to left' },
  { value: 'column', label: 'Top to bottom' },
  { value: 'column-reverse', label: 'Bottom to top' },
];

const ALIGNS: readonly { value: StackAlign; label: string }[] = [
  { value: 'center', label: 'Centre' },
  { value: 'start', label: 'Start' },
  { value: 'end', label: 'End' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'baseline', label: 'Baseline' },
];

const JUSTIFIES: readonly { value: StackJustify; label: string }[] = [
  { value: 'start', label: 'Packed at start' },
  { value: 'center', label: 'Centred' },
  { value: 'end', label: 'Packed at end' },
  { value: 'space-between', label: 'Spread apart' },
  { value: 'space-around', label: 'Even spacing around' },
  { value: 'space-evenly', label: 'Even spacing between' },
];

export function Inspector(): JSX.Element {
  const nodes = useEditor((s) => s.selectedNodes());
  const layout = useEditor((s) => s.layout());
  const advanced = useEditor((s) => s.advanced);
  const tokens = useEditor((s) => s.tokens());
  const update = useEditor((s) => s.updateNode);

  if (!layout) {
    return <div className="empty">No layout selected.</div>;
  }

  if (nodes.length === 0) {
    return (
      <div className="empty">
        Select an element on the canvas
        <br />
        or in the layer list.
      </div>
    );
  }

  if (nodes.length > 1) {
    return (
      <div className="empty">
        {nodes.length} elements selected.
        <br />
        Editing multiple elements at once is not supported yet.
      </div>
    );
  }

  const node = nodes[0]!;
  const parent = parentOf(layout.root, node.id);
  const inStack = parent?.layoutMode === 'stack';

  /** Typed helper so each section can mutate its own node shape safely. */
  function edit<T extends LayoutNode>(recipe: (node: T) => void): void {
    update(node.id, (n) => recipe(n as T));
  }

  return (
    <div className="pane__scroll">
      <Section title="Element">
        <Field label="Name" help="Shown in the layer list and emitted as a comment.">
          <TextInput
            value={node.name}
            onChange={(v) => edit((n) => void (n.name = v))}
          />
        </Field>
        <Field
          label="Extra classes"
          advancedLabel="class"
          help="Space-separated. Useful for hooking your own CSS onto this element."
        >
          <TextInput
            value={node.classes.join(' ')}
            onChange={(v) =>
              edit((n) => void (n.classes = v.split(/\s+/).filter(Boolean)))
            }
            mono
          />
        </Field>
        <Field
          label="Belongs to"
          help="Fills {team} and {player} in this element's data paths, and adds a .p1/.p2 class."
        >
          <div className="row">
            <Select
              value={String(node.scope?.team ?? '')}
              options={[
                { value: '', label: 'Neither' },
                { value: '1', label: 'Player 1' },
                { value: '2', label: 'Player 2' },
              ]}
              onChange={(v) =>
                edit((n) => {
                  n.scope = {
                    ...n.scope,
                    team: v === '' ? undefined : (Number(v) as 1 | 2),
                  };
                })
              }
            />
            <NumberInput
              value={node.scope?.player}
              min={1}
              max={8}
              placeholder="slot"
              onChange={(v) =>
                edit((n) => void (n.scope = { ...n.scope, player: v }))
              }
            />
          </div>
        </Field>
        <div className="row">
          <Toggle
            checked={Boolean(node.hidden)}
            onChange={(v) => edit((n) => void (n.hidden = v))}
            label="Hidden"
          />
          <Toggle
            checked={Boolean(node.locked)}
            onChange={(v) => edit((n) => void (n.locked = v))}
            label="Locked"
          />
        </div>
      </Section>

      {isContainer(node) ? (
        <Section title="Arrangement">
          <Field
            label="Mode"
            advancedLabel="display"
            help={
              node.layoutMode === 'stack'
                ? 'Children flow in a row or column. Empty data collapses without leaving a gap.'
                : 'Children sit at fixed coordinates. Nothing reflows when data is missing.'
            }
          >
            <Select<LayoutMode>
              value={node.layoutMode}
              options={[
                { value: 'stack', label: 'Stack (flows)' },
                { value: 'free', label: 'Free (fixed positions)' },
              ]}
              onChange={(v) => edit((n) => void ((n as typeof node).layoutMode = v))}
            />
          </Field>

          {node.layoutMode === 'stack' ? (
            <>
              <Field label="Direction" advancedLabel="flex-direction">
                <Select
                  value={node.stack.direction}
                  options={DIRECTIONS}
                  onChange={(v) =>
                    edit((n) => void ((n as typeof node).stack.direction = v))
                  }
                />
              </Field>
              <Field label="Spacing" advancedLabel="gap">
                <NumberInput
                  value={node.stack.gap}
                  min={0}
                  onChange={(v) =>
                    edit((n) => void ((n as typeof node).stack.gap = v ?? 0))
                  }
                />
              </Field>
              <Field label="Align" advancedLabel="align-items">
                <Select
                  value={node.stack.align}
                  options={ALIGNS}
                  onChange={(v) =>
                    edit((n) => void ((n as typeof node).stack.align = v))
                  }
                />
              </Field>
              <Field label="Distribute" advancedLabel="justify-content">
                <Select
                  value={node.stack.justify}
                  options={JUSTIFIES}
                  onChange={(v) =>
                    edit((n) => void ((n as typeof node).stack.justify = v))
                  }
                />
              </Field>
              <Toggle
                checked={node.stack.wrap}
                onChange={(v) => edit((n) => void ((n as typeof node).stack.wrap = v))}
                label="Wrap onto more lines"
              />
              <Toggle
                checked={node.stack.collapseEmpty}
                onChange={(v) =>
                  edit((n) => void ((n as typeof node).stack.collapseEmpty = v))
                }
                label="Remove empty children"
              />
              <div className="hint">
                With this on, a child whose TSH data is blank is taken out of the
                flow entirely, so no gap is left behind. Turn it off only if you
                want blank slots to hold their space.
              </div>
            </>
          ) : null}
        </Section>
      ) : null}

      <Section title="Position and size">
        {inStack ? (
          <>
            <div className="hint">
              This element sits inside a Stack, so its position comes from the
              flow. Drag on the canvas to reorder it among its siblings.
            </div>
            <Field label="Grow to fill" advancedLabel="flex-grow">
              <NumberInput
                value={node.style.stackItem.grow}
                min={0}
                onChange={(v) =>
                  edit((n) => void (n.style.stackItem.grow = v ?? 0))
                }
              />
            </Field>
            <Field label="Allow shrinking" advancedLabel="flex-shrink">
              <NumberInput
                value={node.style.stackItem.shrink}
                min={0}
                onChange={(v) =>
                  edit((n) => void (n.style.stackItem.shrink = v ?? 1))
                }
              />
            </Field>
            {advanced ? (
              <Field label="Base size" advancedLabel="flex-basis">
                <LengthInput
                  value={node.style.stackItem.basis}
                  onChange={(v) =>
                    edit((n) => void (n.style.stackItem.basis = v ?? 'auto'))
                  }
                />
              </Field>
            ) : null}
          </>
        ) : (
          <>
            <Field label="Left" advancedLabel="left">
              <NumberInput
                value={node.style.free.x}
                onChange={(v) => edit((n) => void (n.style.free.x = v ?? 0))}
              />
            </Field>
            <Field label="Top" advancedLabel="top">
              <NumberInput
                value={node.style.free.y}
                onChange={(v) => edit((n) => void (n.style.free.y = v ?? 0))}
              />
            </Field>
          </>
        )}
        <Field label="Width" advancedLabel="width">
          <LengthInput
            value={node.style.box.width}
            onChange={(v) => edit((n) => void (n.style.box.width = v))}
          />
        </Field>
        <Field label="Height" advancedLabel="height">
          <LengthInput
            value={node.style.box.height}
            onChange={(v) => edit((n) => void (n.style.box.height = v))}
          />
        </Field>
        <Field label="Inner padding" advancedLabel="padding">
          <div className="row">
            {(['top', 'right', 'bottom', 'left'] as const).map((side, i) => (
              <NumberInput
                key={side}
                value={node.style.box.padding?.[i] ?? 0}
                placeholder={side}
                onChange={(v) =>
                  edit((n) => {
                    const pad = [...(n.style.box.padding ?? [0, 0, 0, 0])] as [
                      number,
                      number,
                      number,
                      number,
                    ];
                    pad[i] = v ?? 0;
                    n.style.box.padding = pad;
                  })
                }
              />
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Appearance">
        <Field label="Background" advancedLabel="background">
          <ColorInput
            value={node.style.box.background}
            tokens={tokens}
            onChange={(v) => edit((n) => void (n.style.box.background = v))}
          />
        </Field>
        <Field label="Rounded corners" advancedLabel="border-radius">
          <LengthInput
            value={node.style.box.borderRadius}
            onChange={(v) => edit((n) => void (n.style.box.borderRadius = v))}
          />
        </Field>
        <Field label="Opacity" advancedLabel="opacity">
          <NumberInput
            value={node.style.box.opacity}
            min={0}
            max={1}
            step={0.05}
            placeholder="1"
            onChange={(v) => edit((n) => void (n.style.box.opacity = v))}
          />
        </Field>
        <Field label="Clip contents" advancedLabel="overflow">
          <Select
            value={node.style.box.overflow ?? 'visible'}
            options={[
              { value: 'visible', label: 'Let contents spill out' },
              { value: 'hidden', label: 'Clip to this box' },
            ]}
            onChange={(v) =>
              edit((n) => void (n.style.box.overflow = v as 'visible' | 'hidden'))
            }
          />
        </Field>
        <Toggle
          checked={Boolean(node.style.box.shadow?.length)}
          onChange={(v) =>
            edit((n) => {
              n.style.box.shadow = v
                ? [{ kind: 'drop', x: 0, y: 2, blur: 3, color: 'rgba(0,0,0,0.55)' }]
                : [];
            })
          }
          label="Drop shadow"
        />
        {node.style.box.shadow?.length ? (
          <ShadowEditor nodeId={node.id} />
        ) : null}
      </Section>

      {node.type === 'text' ? (
        <>
          <Section title="Text">
            <Field label="Size" advancedLabel="font-size">
              <LengthInput
                value={node.style.text.fontSize}
                onChange={(v) => edit((n) => void (n.style.text.fontSize = v))}
              />
            </Field>
            <Field label="Weight" advancedLabel="font-weight">
              <Select
                value={String(node.style.text.fontWeight ?? 700)}
                options={[
                  { value: '400', label: 'Regular' },
                  { value: '600', label: 'Semi-bold' },
                  { value: '700', label: 'Bold' },
                  { value: '900', label: 'Black' },
                ]}
                onChange={(v) =>
                  edit((n) => void (n.style.text.fontWeight = Number(v)))
                }
              />
            </Field>
            <Field label="Colour" advancedLabel="color">
              <ColorInput
                value={node.style.text.color}
                tokens={tokens}
                onChange={(v) => edit((n) => void (n.style.text.color = v))}
              />
            </Field>
            <Field label="Alignment" advancedLabel="text-align">
              <Select
                value={node.style.text.align ?? 'left'}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Centre' },
                  { value: 'right', label: 'Right' },
                ]}
                onChange={(v) =>
                  edit((n) => void (n.style.text.align = v as 'left' | 'center' | 'right'))
                }
              />
            </Field>
            <Field label="Capitalisation" advancedLabel="text-transform">
              <Select
                value={node.style.text.transform ?? 'none'}
                options={[
                  { value: 'none', label: 'As typed' },
                  { value: 'uppercase', label: 'ALL CAPS' },
                  { value: 'lowercase', label: 'lower case' },
                  { value: 'capitalize', label: 'Title Case' },
                ]}
                onChange={(v) =>
                  edit(
                    (n) =>
                      void (n.style.text.transform = v as 'none' | 'uppercase'),
                  )
                }
              />
            </Field>
            <Field
              label="If too long"
              help="Player tags vary wildly in length; this decides what happens when one overflows its box."
            >
              <Select
                value={node.style.text.fit ?? 'scale-x'}
                options={[
                  { value: 'scale-x', label: 'Squeeze horizontally' },
                  { value: 'shrink-font', label: 'Reduce font size' },
                  { value: 'none', label: 'Wrap onto more lines' },
                ]}
                onChange={(v) =>
                  edit(
                    (n) =>
                      void (n.style.text.fit = v as 'scale-x' | 'shrink-font' | 'none'),
                  )
                }
              />
            </Field>
          </Section>

          <Section title="Content">
            <BindingEditor nodeId={node.id} />
            {!node.binding ? (
              <Field label="Static text" stacked>
                <TextInput
                  value={node.content}
                  onChange={(v) => edit((n) => void ((n as typeof node).content = v))}
                />
              </Field>
            ) : null}
            <Toggle
              checked={node.animateChanges}
              onChange={(v) =>
                edit((n) => void ((n as typeof node).animateChanges = v))
              }
              label="Crossfade when the value changes"
            />
            {node.animateChanges ? (
              <Field label="Fade time" help="Seconds.">
                <NumberInput
                  value={node.fadeTime}
                  min={0}
                  max={3}
                  step={0.1}
                  onChange={(v) =>
                    edit((n) => void ((n as typeof node).fadeTime = v ?? 0.5))
                  }
                />
              </Field>
            ) : null}
          </Section>
        </>
      ) : null}

      {node.type === 'image' ? (
        <Section title="Image">
          <BindingEditor nodeId={node.id} />
          <Field label="Fallback file" advancedLabel="src" help="Relative to the layout folder.">
            <TextInput
              value={node.src}
              onChange={(v) => edit((n) => void ((n as typeof node).src = v))}
              mono
            />
          </Field>
          <Field label="Fitting" advancedLabel="object-fit">
            <Select
              value={node.fit}
              options={[
                { value: 'cover', label: 'Fill the box, crop overflow' },
                { value: 'contain', label: 'Fit inside, show all' },
                { value: 'fill', label: 'Stretch to fit' },
                { value: 'none', label: 'Original size' },
              ]}
              onChange={(v) => edit((n) => void ((n as typeof node).fit = v))}
            />
          </Field>
        </Section>
      ) : null}

      {node.type === 'character' ? (
        <Section title="Character art">
          <Field
            label="Asset pack"
            advancedLabel="asset_key"
            help="Leave blank to use the largest pack the player's character has."
          >
            <TextInput
              value={node.assetKey}
              onChange={(v) => edit((n) => void ((n as typeof node).assetKey = v))}
              mono
            />
          </Field>
          <Field label="Data source" advancedLabel="source">
            <TextInput
              value={node.source}
              onChange={(v) => edit((n) => void ((n as typeof node).source = v))}
              mono
            />
          </Field>
          <Field label="Zoom" advancedLabel="custom_zoom">
            <NumberInput
              value={node.customZoom}
              min={0.1}
              max={5}
              step={0.05}
              onChange={(v) => edit((n) => void ((n as typeof node).customZoom = v ?? 1))}
            />
          </Field>
          <Field
            label="Focal point"
            advancedLabel="custom_center"
            help="0 to 1, horizontal then vertical. Where the character's eyeline sits in the box."
          >
            <div className="row">
              {[0, 1].map((axis) => (
                <NumberInput
                  key={axis}
                  value={node.customCenter[axis]}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) =>
                    edit((n) => {
                      const center = [...(n as typeof node).customCenter] as [
                        number,
                        number,
                      ];
                      center[axis] = v ?? 0.5;
                      (n as typeof node).customCenter = center;
                    })
                  }
                />
              ))}
            </div>
          </Field>
          <Toggle
            checked={node.scaleFillX}
            onChange={(v) => edit((n) => void ((n as typeof node).scaleFillX = v))}
            label="Fill horizontally"
          />
          <Toggle
            checked={node.scaleFillY}
            onChange={(v) => edit((n) => void ((n as typeof node).scaleFillY = v))}
            label="Fill vertically"
          />
          <Toggle
            checked={node.useDividers}
            onChange={(v) => edit((n) => void ((n as typeof node).useDividers = v))}
            label="Divide the box between characters"
          />
        </Section>
      ) : null}

      {node.type === 'component' ? <ComponentOptions nodeId={node.id} /> : null}

      {advanced ? (
        <Section title="Custom CSS" defaultOpen={false}>
          <div className="hint">
            Written into this element's rule, after everything above, so it wins.
            One declaration per line.
          </div>
          <textarea
            className="textarea"
            value={node.style.rawCss ?? ''}
            placeholder={'filter: blur(2px);\nmix-blend-mode: screen;'}
            onChange={(e) =>
              edit((n) => void (n.style.rawCss = e.target.value || undefined))
            }
          />
        </Section>
      ) : null}
    </div>
  );
}

/* ── Sub-editors ────────────────────────────────────────────────────────── */

function ShadowEditor({ nodeId }: { nodeId: string }): JSX.Element | null {
  const layout = useEditor((s) => s.layout());
  const update = useEditor((s) => s.updateNode);
  const node = layout ? findNodeById(layout.root, nodeId) : undefined;
  const shadow = node?.style.box.shadow?.[0];
  if (!node || !shadow) return null;

  const set = (recipe: (s: NonNullable<typeof shadow>) => void): void =>
    update(nodeId, (n) => {
      const target = n.style.box.shadow?.[0];
      if (target) recipe(target);
    });

  return (
    <>
      <Field label="Offset" help="Horizontal, then vertical.">
        <div className="row">
          <NumberInput value={shadow.x} onChange={(v) => set((s) => void (s.x = v ?? 0))} />
          <NumberInput value={shadow.y} onChange={(v) => set((s) => void (s.y = v ?? 0))} />
        </div>
      </Field>
      <Field label="Blur">
        <NumberInput
          value={shadow.blur}
          min={0}
          onChange={(v) => set((s) => void (s.blur = v ?? 0))}
        />
      </Field>
      <Field label="Colour">
        <TextInput
          value={shadow.color}
          onChange={(v) => set((s) => void (s.color = v))}
          mono
        />
      </Field>
      <Field
        label="Applies to"
        help="Shape follows the element's box, or the pixels it actually draws (better for logos and text)."
      >
        <Select
          value={shadow.kind}
          options={[
            { value: 'drop', label: 'Drawn pixels' },
            { value: 'box', label: 'Element box' },
          ]}
          onChange={(v) => set((s) => void (s.kind = v as 'box' | 'drop'))}
        />
      </Field>
    </>
  );
}

function BindingEditor({ nodeId }: { nodeId: string }): JSX.Element | null {
  const layout = useEditor((s) => s.layout());
  const update = useEditor((s) => s.updateNode);
  const advanced = useEditor((s) => s.advanced);
  const node = layout ? findNodeById(layout.root, nodeId) : undefined;
  if (!node || (node.type !== 'text' && node.type !== 'image')) return null;

  const current = node.binding;
  const field = current ? findField(current.path) : undefined;

  return (
    <>
      <Field
        label="Live data"
        help="What TournamentStreamHelper fills this element with."
      >
        <Select
          value={current?.path ?? ''}
          options={[
            { value: '', label: 'Nothing — static content' },
            ...FIELDS.map((f) => ({
              value: f.path,
              label: `${f.group}: ${f.label}`,
            })),
          ]}
          onChange={(path) =>
            update(nodeId, (n) => {
              if (n.type !== 'text' && n.type !== 'image') return;
              if (!path) {
                n.binding = undefined;
                return;
              }
              const def = findField(path);
              n.binding = {
                path,
                transforms: [...(def?.defaultTransforms ?? [])],
              };
            })
          }
        />
      </Field>

      {field?.help ? <div className="hint">{field.help}</div> : null}

      {current ? (
        <>
          <Field
            label="Wrap value"
            help="Optional. Use {value} where the data should go, e.g. 'Seed {value}'."
          >
            <TextInput
              value={current.template}
              onChange={(v) =>
                update(nodeId, (n) => {
                  if (n.type !== 'text' && n.type !== 'image') return;
                  if (n.binding) n.binding.template = v || undefined;
                })
              }
            />
          </Field>
          <Field label="If blank, show">
            <TextInput
              value={current.fallback}
              onChange={(v) =>
                update(nodeId, (n) => {
                  if (n.type !== 'text' && n.type !== 'image') return;
                  if (n.binding) n.binding.fallback = v || undefined;
                })
              }
            />
          </Field>
          {advanced ? (
            <Field label="Path" advancedLabel="path">
              <TextInput
                value={current.path}
                onChange={(v) =>
                  update(nodeId, (n) => {
                    if (n.type !== 'text' && n.type !== 'image') return;
                    if (n.binding) n.binding.path = v;
                  })
                }
                mono
              />
            </Field>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function ComponentOptions({ nodeId }: { nodeId: string }): JSX.Element | null {
  const layout = useEditor((s) => s.layout());
  const update = useEditor((s) => s.updateNode);
  const node = layout ? findNodeById(layout.root, nodeId) : undefined;
  if (!node || node.type !== 'component') return null;

  const def = componentDef(node.kind);
  if (!def) return null;

  const setOption = (key: string, value: string | number | boolean): void =>
    update(nodeId, (n) => {
      if (n.type === 'component') n.options[key] = value;
    });

  return (
    <Section title={def.label}>
      <div className="hint">{def.description}</div>
      {def.options.map((opt) => {
        const value = node.options[opt.key] ?? opt.default;
        switch (opt.kind) {
          case 'boolean':
            return (
              <Toggle
                key={opt.key}
                checked={Boolean(value)}
                onChange={(v) => setOption(opt.key, v)}
                label={opt.label}
              />
            );
          case 'number':
            return (
              <Field key={opt.key} label={opt.label} help={opt.help}>
                <NumberInput
                  value={Number(value)}
                  min={opt.min}
                  max={opt.max}
                  step={opt.step}
                  onChange={(v) => setOption(opt.key, v ?? 0)}
                />
              </Field>
            );
          case 'select':
            return (
              <Field key={opt.key} label={opt.label} help={opt.help}>
                <Select
                  value={String(value)}
                  options={opt.choices ?? []}
                  onChange={(v) => setOption(opt.key, v)}
                />
              </Field>
            );
          case 'text':
            return (
              <Field key={opt.key} label={opt.label} help={opt.help}>
                <TextInput
                  value={String(value)}
                  onChange={(v) => setOption(opt.key, v)}
                />
              </Field>
            );
        }
      })}
      <div className="hint">
        Generated rows carry the class <span className="mono">.{def.itemClass}</span>,
        which you can target from an animation or custom CSS.
      </div>
    </Section>
  );
}

function findNodeById(root: LayoutNode, id: string): LayoutNode | undefined {
  if (root.id === id) return root;
  if (!isContainer(root)) return undefined;
  for (const child of root.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return undefined;
}
