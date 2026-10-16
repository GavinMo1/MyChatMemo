import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '@/sidepanel/App';

describe('SidePanel App', () => {
  it('does not render any classifier-related UI after the feature was removed', () => {
    const html = renderToStaticMarkup(React.createElement(App));

    expect(html).not.toContain('classifier.');
    expect(html).not.toContain('智能分类');
  });
});
