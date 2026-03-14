/**
 * capture-views.mjs — eval fixture for bringing-codex-to-figma
 */

export const VIEWS = {
  home: null,

  counter: async (page) => {
    await page.click('button:has-text("counter")');
    await page.waitForTimeout(300);
  },

  about: async (page) => {
    await page.click('button:has-text("about")');
    await page.waitForTimeout(300);
  },
};
