async (page) => {
  await page.goto('http://127.0.0.1:5175/');
  await page.getByRole('button', { name: '查看 同频，在现场', exact: true }).click();
  await page.getByRole('button', { name: '放大 同频，在现场 图片 1', exact: true }).click();
  await page.goBack();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  if (await page.evaluate(() => document.body.style.overflow === 'hidden')) {
    throw new Error('Closing nested dialogs via browser Back left the page scroll-locked.');
  }
  await page.getByRole('searchbox', { name: '搜索作品' }).fill('城市');
  await page.getByRole('button', { name: '打开 城市的留白', exact: true }).click();
  await page.getByRole('button', { name: '关闭作品', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  if (await page.getByRole('searchbox', { name: '搜索作品' }).inputValue() !== '城市') {
    throw new Error('Returning from a project lost the search query.');
  }
  await page.getByRole('searchbox', { name: '搜索作品' }).fill('');
  await page.getByRole('checkbox', { name: '包含演示内容' }).uncheck();
  if (await page.locator('.is-demo, .story-band, .film-section').count()) {
    throw new Error('Demo content remained visible after opting out.');
  }
  await page.getByRole('checkbox', { name: '包含演示内容' }).check();
  return { nestedDialogBack: 'pass', searchRestoration: 'pass', demoToggle: 'pass' };
}
