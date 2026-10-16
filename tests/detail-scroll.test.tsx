import './dom-setup';
import React from 'react';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, cleanup, render, fireEvent } from '@testing-library/react';
import { useDetailScroll } from '../src/hooks/useDetailScroll';

afterEach(cleanup);
function setup() {
  const calls: number[] = [];
  let controls: ReturnType<typeof useDetailScroll>;
  let comments: { id: string }[] = [];
  let ownerKey = 0;
  function Harness({ comments, ownerKey }: { comments: { id: string }[]; ownerKey: number }) {
    controls = useDetailScroll(comments);
    return <div key={ownerKey} ref={controls.contentRef} onScroll={controls.onScroll} />;
  }
  const ui = render(<Harness comments={comments} ownerKey={ownerKey} />);
  let node: HTMLDivElement;
  function bindNode() {
    node = ui.container.firstChild as HTMLDivElement;
    Object.defineProperties(node, { scrollHeight: { value: 2000 }, clientHeight: { value: 500 } });
    node.scrollTo = options => { calls.push((options as ScrollToOptions).top!); };
  }
  bindNode();
  return {
    calls,
    update(ids: string[]) { comments = ids.map(id => ({ id })); ui.rerender(<Harness comments={comments} ownerKey={ownerKey} />); },
    swapOwner() { ownerKey++; ui.rerender(<Harness comments={comments} ownerKey={ownerKey} />); bindNode(); },
    position(top: number) { node.scrollTop = top; fireEvent.scroll(node); },
    jump() { act(() => controls!.jumpToLatest()); },
    sent() { controls!.followOwnSend.current = true; },
  };
}

test('initial nonempty timeline stays at the description', () => {
  const h = setup(); h.update(['a', 'b']); assert.deepEqual(h.calls, []);
});
test('incoming append follows only after the reader scrolls near the bottom', () => {
  const h = setup(); h.update(['a']); h.position(200); h.update(['a', 'b']);
  assert.deepEqual(h.calls, []);
  h.position(1450); h.update(['a', 'b', 'c']); assert.deepEqual(h.calls, [2000]);
});
test('same IDs (edits, dedup and reload) never follow, even at bottom', () => {
  const h = setup(); h.update(['a']); h.position(1500); h.update(['a']); h.update(['a']);
  assert.deepEqual(h.calls, []);
});
test('explicit jump scrolls only the referenced owner', () => {
  const h = setup(); h.jump(); assert.deepEqual(h.calls, [2000]);
});
test('successful own send follows even while reading, and consumes intent once', () => {
  const h = setup(); h.update(['a']); h.position(0); h.sent(); h.update(['a', 'mine']);
  assert.deepEqual(h.calls, [2000]); h.update(['a', 'mine']); assert.deepEqual(h.calls, [2000]);
});

for (const direction of ['desktop to mobile', 'mobile to desktop']) {
  test(direction + ': fresh new-owner bottom intent survives the next append', () => {
    const h = setup(); h.update(['a']); h.position(1500); h.swapOwner();
    h.position(1500); h.update(['a', 'b']); assert.deepEqual(h.calls, [2000]);
  });
  test(direction + ': replacement owner does not inherit the old bottom intent', () => {
    const h = setup(); h.update(['a']); h.position(1500); h.swapOwner();
    h.update(['a', 'b']); assert.deepEqual(h.calls, []);
  });
}
