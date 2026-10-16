import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Popup from '@/popup/Popup';

describe('Popup', () => {
  it('does not render the old open workbench button', () => {
    const html = renderToStaticMarkup(React.createElement(Popup));

    expect(html).not.toContain('打开记忆工作台');
  });
});
