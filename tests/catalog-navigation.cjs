// npm run build && npx electron tests/catalog-navigation.cjs
// Uses an isolated profile and fixture catalog. External links are intercepted.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'silvergrain-catalog-test-')));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, description) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await sleep(50); }
  throw new Error(`Timed out: ${description}`);
}
app.whenReady().then(async () => {
  let window;
  try {
    const fixtureFolder = path.join(root, 'film-library/brands/富士/在产');
    const pdfBytes = fs.readFileSync(path.join(fixtureFolder, fs.readdirSync(fixtureFolder).find(name => /\.pdf$/i.test(name))));
    const file = fileName => ({ fileName, fileSize: pdfBytes.length });
    const openedLinks = [];
    ipcMain.handle('documents:list', () => [
      { id: 'other', title: 'sensor-reference', category: '其他', kind: 'PDF', fileName: 'sensor.pdf', addedAt: '2026-11-09', tags: [], notes: '', text: '', status: '已索引', relatedIds: [] },
      { id: 'technical', title: 'technical-import', category: '技术文档', kind: 'PDF', fileName: 'technical-import.pdf', addedAt: '2026-11-09', tags: [], notes: '', text: '', status: '已索引', relatedIds: [] },
      { id: 'link', title: 'reference-link', category: '其他', kind: 'LINK', url: 'https://example.com/reference', addedAt: '2026-11-09', tags: [], notes: '', text: '', status: '链接', relatedIds: [] },
    ]);
    ipcMain.handle('brands:list', () => [{ name: '富士', count: 2,
      staticFilms: [{ ...file('fujichrome_provia_100f_rdp3.pdf'), status: '在产', collection: '静态摄影胶片' }],
      movieFilms: [{ ...file('motion-film.pdf'), status: '已停产', collection: '电影卷' }],
    }]);
    ipcMain.handle('equipment:list-brands', () => [{ name: '尼康', count: 2, categories: {
      '相机资料': [file('camera-manual.pdf')], '镜头资料': [file('lens-manual.pdf')], '维修手册': [], '滤镜': [], '其他配件': [],
    } }]);
    ipcMain.handle('industry:list-groups', () => [
      { name: '行业标准与规范', files: [file('technical-standard.pdf')] },
      { name: 'C41', path: '冲洗工艺/C41', files: [file('C41-process.pdf')] },
      { name: 'B&W', path: '冲洗工艺/B&W', files: [file('HC110.pdf')] },
    ]);
    for (const channel of ['brands:read-pdf', 'equipment:read-pdf', 'industry:read-pdf', 'documents:read-pdf']) ipcMain.handle(channel, () => pdfBytes);
    ipcMain.handle('documents:open-link', (_event, url) => { openedLinks.push(url); });
    window = new BrowserWindow({ show: false, width: 1440, height: 920, webPreferences: {
      preload: path.join(root, 'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false,
    } });
    const run = code => window.webContents.executeJavaScript(code);
    const select = async label => {
      await run(`[...document.querySelectorAll('.category-nav button')].find(button => button.textContent === ${JSON.stringify(label)}).click()`);
      await waitFor(() => run(`document.querySelector('.category-nav .active').textContent === ${JSON.stringify(label)}`), label);
    };
    await window.loadFile(path.join(root, 'dist/index.html'));
    await waitFor(() => run("document.querySelectorAll('.all-materials-library .document-row').length === 10"), 'all sources included');
    const snapshot = async () => run(`({
      title: document.querySelector('h1').textContent,
      breadcrumb: document.querySelector('.breadcrumbs [aria-current="page"]').textContent,
      active: document.querySelector('.category-nav .active').textContent,
      categories: [...document.querySelectorAll('.all-materials-category')].map(card => ({ name: card.querySelector('strong').textContent, count: card.querySelector('small').textContent })),
      rows: [...document.querySelectorAll('.all-materials-library .document-row')].map(row => row.querySelector('.category-cell').textContent)
    })`);
    const initial = await snapshot();
    assert.equal(initial.title, '全部资料');
    assert.equal(initial.breadcrumb, '全部资料');
    assert.equal(initial.active, '全部资料');
    assert.equal(initial.categories.length, 5);
    assert.ok(initial.categories.every(card => card.count === '2 份资料'));
    assert.equal(new Set(initial.rows).size, 5);
    // Each homepage category entry leads to its own route and content.
    for (const label of ['技术文档', '冲洗工艺', '感光材料', '相机资料', '其他']) {
      await run(`[...document.querySelectorAll('.all-materials-category')].find(card => card.querySelector('strong').textContent === ${JSON.stringify(label)}).click()`);
      await waitFor(() => run(`document.querySelector('h1').textContent === ${JSON.stringify(label)}`), `category route: ${label}`);
      if (label === '冲洗工艺') {
        const expectedOrder = ['B&W', 'C41', 'E6', 'ECN-2', '放大彩扩', '其他'];
        assert.deepEqual(await run("[...document.querySelectorAll('.industry-group-heading strong')].map(heading => heading.textContent)"), expectedOrder);
        await run("document.querySelector('.catalog-trigger').click()");
        await run("[...document.querySelectorAll('.catalog-row.depth-1')].find(row => row.querySelector('span').textContent === '冲洗工艺').click()");
        assert.deepEqual(await run("[...document.querySelectorAll('.catalog-row.depth-2 span')].map(span => span.textContent)"), expectedOrder);
        await run("document.querySelector('.catalog-trigger').click()");
        assert.ok(await run("[...document.querySelectorAll('.industry-group-heading')].every(button => button.getAttribute('aria-expanded') === 'false')"));
        await run("document.querySelector('.industry-group-heading').click()");
        await waitFor(() => run("document.querySelector('.industry-group-heading').getAttribute('aria-expanded') === 'true'"), 'processing category expand');
        await run("document.querySelector('.industry-group-heading').click()");
        await waitFor(() => run("document.querySelector('.industry-group-heading').getAttribute('aria-expanded') === 'false'"), 'processing category collapse');
      }
      if (label === '感光材料' || label === '相机资料') {
        await run("document.querySelector('.brand-preview-heading button').click()");
        await waitFor(() => run("!!document.querySelector('.brand-detail')"), 'brand route');
      }
      // The library breadcrumb must reset brand selection and return to all sources.
      await run("document.querySelector('.breadcrumbs button').click()");
      await waitFor(() => run("document.querySelectorAll('.all-materials-library .document-row').length === 10"), 'return to all materials');
      assert.equal((await snapshot()).title, '全部资料');
    }
    await select('感光材料');
    await select('全部资料');
    assert.equal((await snapshot()).rows.length, 10);
    const search = async text => {
      await run(`(() => { const input = document.querySelector('.global-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(75);
    };
    await search('HC110');
    assert.equal(await run("document.querySelectorAll('.search-results-section .document-row').length"), 1);
    assert.equal(await run("document.querySelector('.search-results-section .category-cell').textContent"), '冲洗工艺');
    await search('');
    await waitFor(() => run("!!document.querySelector('.all-materials-library')"), 'clear search');
    // Confirm exact label, destination, ordering, and native external-link bridge.
    const links = await run("[...document.querySelectorAll('.sidebar-link')].map(link => ({ text: link.textContent, href: link.href }))");
    assert.deepEqual(links, [
      { text: '拾忆菲林官方店铺', href: 'https://shop124489225.taobao.com/' },
      { text: 'elevanfilm.com', href: 'https://elevanfilm.com/' },
    ]);
    await run("document.querySelector('.sidebar-link').click()");
    await waitFor(() => openedLinks.length === 1, 'external link IPC');
    assert.equal(openedLinks[0], 'https://shop124489225.taobao.com/');
    await run("[...document.querySelectorAll('.all-materials-library .document-row')].find(row => row.textContent.includes('reference-link')).click()");
    await waitFor(() => openedLinks.length === 2, 'imported link open');
    assert.equal(openedLinks[1], 'https://example.com/reference');
    await run("document.querySelector('.language-toggle').click()");
    await waitFor(() => run("document.querySelector('h1').textContent === 'All materials'"), 'English homepage');
    const english = await snapshot();
    assert.equal(english.breadcrumb, 'All materials');
    assert.equal(english.active, 'All materials');
    assert.equal(english.rows.length, 10);
    assert.equal(await run("document.querySelector('.sidebar-link').textContent"), 'ELEVANFILM Official Store');
    // Capture a desktop-sized view without launching external websites.
    window.show();
    await sleep(250); // Allow the compositor to present the first visible frame.
    fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'results/catalog-navigation.png'), (await window.capturePage()).toPNG());
    console.log(JSON.stringify({ allSources: initial.rows.length, categories: initial.categories, categoryAndBrandNavigation: true, allCategorySearch: true, storeLink: links[0], englishMode: true }, null, 2));
    window.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    if (window && !window.isDestroyed()) window.destroy();
    app.exit(1);
  }
});
