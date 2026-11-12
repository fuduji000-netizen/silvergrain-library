// Real renderer, isolated profile, and enough catalog entries to exercise actual scrolling.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'silvergrain-page-memory-')));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  let window;
  try {
    const folder = path.join(root, 'film-library/brands/富士/在产');
    const bytes = fs.readFileSync(path.join(folder, fs.readdirSync(folder).find(name => /\.pdf$/i.test(name))));
    const files = prefix => Array.from({ length: 24 }, (_, i) => ({ fileName: `${prefix}-${i}.pdf`, fileSize: bytes.length }));
    const brands = Array.from({ length: 10 }, (_, i) => ({ name: `Brand${i}`, count: 24,
      staticFilms: files(`film${i}`).map(file => ({ ...file, status: '在产', collection: '静态摄影胶片' })), movieFilms: [] }));
    ipcMain.handle('documents:list', () => []);
    ipcMain.handle('brands:list', () => brands);
    ipcMain.handle('equipment:list-brands', () => [{ name: '尼康', count: 48, categories: {
      '相机资料': files('camera'), '镜头资料': files('lens'), '维修手册': [], '滤镜': [], '其他配件': [] } }]);
    ipcMain.handle('industry:list-groups', () => [
      { name: '行业标准与规范', files: files('standard') },
      { name: '其他技术资料', files: files('technical') },
      ...['B&W', 'C41', 'E6'].map(name => ({ name, path: `冲洗工艺/${name}`, files: files(name) })),
    ]);
    for (const channel of ['brands:read-pdf', 'equipment:read-pdf', 'industry:read-pdf', 'documents:read-pdf']) ipcMain.handle(channel, () => bytes);
    window = new BrowserWindow({ show: false, width: 1440, height: 920, webPreferences: {
      preload: path.join(root, 'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false } });
    const run = code => window.webContents.executeJavaScript(code);
    async function waitFor(code, label) {
      for (let i = 0; i < 100; i++) { if (await run(code)) return; await sleep(40); }
      throw Error(`Timed out: ${label}`);
    }
    async function click(code) { await run(`${code}.click()`); await sleep(60); }
    const select = label => click(`[...document.querySelectorAll('.category-nav button')].find(el => el.textContent === ${JSON.stringify(label)})`);
    const top = () => run("document.querySelector('.content-area').scrollTop");
    async function at(expected, label) { assert.ok(Math.abs(await top() - expected) <= 1, `${label}: expected ${expected}, got ${await top()}`); }
    async function scroll(value) {
      await run(`document.querySelector('.content-area').scrollTop = ${value}`);
      await sleep(60);
      await at(value, 'scrollable catalog');
    }
    const closed = selector => run(`[...document.querySelectorAll(${JSON.stringify(selector)})].every(el => el.getAttribute('aria-expanded') === 'false')`);
    const opened = selector => run(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-expanded') === 'true'`);
    async function search(value) {
      await run(`(() => { const input = document.querySelector('.global-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(60);
    }
    await window.loadFile(path.join(root, 'dist/index.html'));
    await waitFor("document.querySelectorAll('.all-materials-library .document-row').length === 408", 'loaded fixture');
    await at(0, 'fresh all materials');
    assert.equal(await run("document.querySelector('.catalog-trigger').getAttribute('aria-expanded')"), 'false');
    assert.ok(Number(await run("getComputedStyle(document.querySelector('.brand-lockup span')).fontWeight")) >= 700);
    const fixedBefore = await run("[...document.querySelectorAll('.sidebar,.topbar')].map(el => el.getBoundingClientRect().top)");
    await scroll(510);
    assert.deepEqual(await run("[...document.querySelectorAll('.sidebar,.topbar')].map(el => el.getBoundingClientRect().top)"), fixedBefore);

    await select('技术文档');
    await at(0, 'fresh technical');
    assert.ok(await closed('.industry-group-heading'));
    await click("document.querySelector('.industry-group-heading')");
    await scroll(430);
    await select('感光材料');
    await at(0, 'fresh film');
    await scroll(720);
    await select('技术文档');
    await at(430, 'technical restored');
    assert.ok(await opened('.industry-group-heading'));
    // Empty page clamps scrollTop to zero; returning must preserve the long page.
    await select('其他');
    await at(0, 'fresh short page');
    await select('技术文档');
    await at(430, 'restored after short page');

    await select('冲洗工艺');
    await at(0, 'fresh processing');
    assert.ok(await closed('.industry-group-heading'));
    await click("[...document.querySelectorAll('.industry-group-heading')].find(el => el.querySelector('strong').textContent === 'C41')");
    await scroll(470);
    await select('技术文档');
    await at(430, 'technical independent from processing');
    await select('冲洗工艺');
    await at(470, 'processing restored');
    assert.equal(await run("document.querySelectorAll('.industry-group-heading[aria-expanded=true]').length"), 1);

    await select('感光材料');
    await at(720, 'brand index restored');
    await click("document.querySelector('.brand-preview-heading button')");
    await at(0, 'fresh film brand');
    assert.ok(await closed('.film-collection-heading'));
    await click("document.querySelector('.film-collection-heading')");
    assert.ok(await closed('.film-status-heading'));
    await click("document.querySelector('.film-status-heading')");
    await scroll(530);
    await select('技术文档');
    await select('感光材料');
    assert.equal(await run("document.querySelector('h1').textContent"), 'Brand0');
    await at(530, 'category returns to brand location');
    await click("document.querySelectorAll('.breadcrumbs button')[1]");
    await at(720, 'breadcrumb restores brand index');
    await click("document.querySelectorAll('.brand-preview-heading button')[1]");
    await at(0, 'another brand starts at top');
    assert.ok(await closed('.film-collection-heading'));
    await click("document.querySelectorAll('.breadcrumbs button')[1]");
    await click("document.querySelector('.brand-preview-heading button')");
    await at(530, 'brand position restored');
    assert.ok(await opened('.film-status-heading'));

    await select('相机资料');
    await at(0, 'fresh equipment');
    await click("document.querySelector('.brand-preview-heading button')");
    assert.ok(await closed('.film-collection-heading'));
    await click("document.querySelector('.film-collection-heading')");
    await scroll(610);
    await select('冲洗工艺');
    await select('相机资料');
    await at(610, 'equipment restored');
    assert.ok(await opened('.film-collection-heading'));

    // The catalog uses the same scroll memory as the sidebar and breadcrumbs.
    await click("document.querySelector('.catalog-trigger')");
    await click("[...document.querySelectorAll('.catalog-row.depth-1')].find(el => el.querySelector('span').textContent === '技术文档')");
    await click("document.querySelector('.catalog-jump')");
    await at(430, 'catalog jump restores technical');
    await click("document.querySelector('.catalog-trigger')");
    await search('standard');
    await at(0, 'fresh search');
    await scroll(380);
    await search('');
    await at(430, 'clearing search restores page');
    await search('standard');
    await at(380, 'search position restored');
    await search('');
    await click("document.querySelector('.language-toggle')");
    await at(430, 'language keeps position');
    assert.ok(await opened('.industry-group-heading'));
    await click("document.querySelector('.language-toggle')");
    await click("document.querySelector('.breadcrumbs button')");
    await at(510, 'all materials restored');

    // Same on-disk profile, fresh renderer: navigation state must not survive restart.
    await window.loadFile(path.join(root, 'dist/index.html'));
    await waitFor("document.querySelectorAll('.all-materials-library .document-row').length === 408", 'reloaded fixture');
    await at(0, 'restart all materials');
    for (const category of ['技术文档', '冲洗工艺']) {
      await select(category);
      await at(0, `restart ${category}`);
      assert.ok(await closed('.industry-group-heading'));
    }
    await select('感光材料');
    await at(0, 'restart brand index');
    await click("document.querySelector('.brand-preview-heading button')");
    await at(0, 'restart brand');
    assert.ok(await closed('.film-collection-heading'));
    await click("document.querySelector('.film-collection-heading')");
    assert.ok(await closed('.film-status-heading'));
    await select('相机资料');
    await click("document.querySelector('.brand-preview-heading button')");
    assert.ok(await closed('.film-collection-heading'));
    const result = { initialTopAndCollapsed: true, independentPagePositions: true, shortPageRoundTrip: true,
      processingDisclosureMemory: true, brandAndEquipmentMemory: true, sidebarBreadcrumbCatalogNavigation: true,
      searchAndLanguageMemory: true, restartResetsAll: true, boldDesignCredit: true };
    fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'results/page-memory.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    window.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    if (window && !window.isDestroyed()) window.destroy();
    app.exit(1);
  }
});
