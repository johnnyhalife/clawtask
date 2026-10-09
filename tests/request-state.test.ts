import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { RequestState } from '../src/components/ui/RequestState';

test('request failures show an alert and retry instead of an empty state', () => {
  const html = renderToStaticMarkup(RequestState({ loading: false, error: 'Failed to fetch', onRetry() {} }));
  assert.match(html, /role="alert"/);
  assert.match(html, /Could not load issues/);
  assert.match(html, /Retry/);
});
test('pending requests show status; successful requests need no notice', () => {
  assert.match(renderToStaticMarkup(RequestState({ loading: true, error: null, label: 'issue navigation', onRetry() {} })), /Loading issue navigation/);
  assert.equal(RequestState({ loading: false, error: null, onRetry() {} }), null);
});
