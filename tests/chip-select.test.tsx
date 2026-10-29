import './dom-setup';
import React from 'react';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { cleanup, render, fireEvent } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { ChipSelect, STATUS_OPTIONS } from '../src/components/task/ChipSelect';
afterEach(cleanup);
const props = { label: 'Todo', color: '#3189FF', options: STATUS_OPTIONS };
test('closed SSR does not create a portal', () => {
  assert.match(renderToString(<ChipSelect {...props} onChange={() => {}} />), /Todo/);
  assert.equal(document.querySelector('[data-chip-popover]'), null);
});
test('portal is outside clipping container and keyboard uses latest callback', () => {
  const first: string[] = [], latest: string[] = [];
  const ui = render(<div style={{ overflow: 'auto' }}><ChipSelect {...props} onChange={v => first.push(v)} /></div>);
  const trigger = ui.getByRole('button'); trigger.focus(); fireEvent.click(trigger);
  const panel = document.querySelector('[data-chip-popover]')!;
  assert.equal(panel.parentElement, document.body);
  ui.rerender(<div style={{ overflow: 'auto' }}><ChipSelect {...props} onChange={v => latest.push(v)} /></div>);
  fireEvent.keyDown(trigger, { key: 'End' }); fireEvent.keyDown(trigger, { key: 'Enter' });
  assert.deepEqual(first, []); assert.deepEqual(latest, ['archived']);
  assert.equal(document.querySelector('[data-chip-popover]'), null);
  assert.equal(document.activeElement, trigger);
});
test('resize dismisses, reopen works, unmount removes portal and listeners', () => {
  const ui = render(<ChipSelect {...props} onChange={() => {}} />);
  const trigger = ui.getByRole('button');
  fireEvent.click(trigger); fireEvent(window, new window.Event('resize'));
  assert.equal(document.querySelector('[data-chip-popover]'), null);
  fireEvent.click(trigger); assert.ok(document.querySelector('[data-chip-popover]'));
  ui.unmount(); assert.equal(document.querySelector('[data-chip-popover]'), null);
  fireEvent(window, new window.Event('resize'));
});
