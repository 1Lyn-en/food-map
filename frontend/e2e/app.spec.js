import { test, expect } from '@playwright/test';

const SIDEBAR_SELECTOR = '.sidebar';

async function onboard(page, nickname = '测试食客') {
  const welcome = page.locator('.modal').filter({ hasText: '欢迎使用美食地图' });
  await welcome.waitFor({ state: 'visible', timeout: 15000 });
  await welcome.locator('input[placeholder="你的昵称"]').fill(nickname);
  await welcome.locator('.primary-btn').click();
  await expect(welcome).toBeHidden({ timeout: 15000 });
}

async function openShare(page) {
  await page.locator('.sidebar-header-actions').getByRole('button', { name: '共享', exact: true }).click();
  await expect(page.locator('.share-modal')).toBeVisible();
}

async function expectOverlayInsideSidebar(page, overlay) {
  const ob = await overlay.boundingBox();
  const sb = await page.locator(SIDEBAR_SELECTOR).boundingBox();
  expect(ob, 'overlay should be rendered').not.toBeNull();
  expect(sb, 'sidebar should be rendered').not.toBeNull();

  // The overlay must cover the sidebar (inset:0) rather than spill out or expand it.
  expect(ob.x).toBeGreaterThanOrEqual(sb.x - 1);
  expect(ob.y).toBeGreaterThanOrEqual(sb.y - 1);
  expect(ob.x + ob.width).toBeLessThanOrEqual(sb.x + sb.width + 1);
  expect(ob.y + ob.height).toBeLessThanOrEqual(sb.y + sb.height + 1);

  // The modal body must be horizontally centered within the sidebar.
  const mb = await overlay.locator('.modal').boundingBox();
  expect(mb, 'modal should be rendered').not.toBeNull();
  const overlayCenterX = ob.x + ob.width / 2;
  const modalCenterX = mb.x + mb.width / 2;
  expect(Math.abs(modalCenterX - overlayCenterX)).toBeLessThanOrEqual(2);
}

test.describe('food-map UI smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('应用加载，sidebar 与首次引导可见', async ({ page }) => {
    await expect(page.locator(SIDEBAR_SELECTOR)).toBeVisible();
    await expect(page.locator('.modal').filter({ hasText: '欢迎使用美食地图' })).toBeVisible();
  });

  test('首次使用可完成身份设置', async ({ page }) => {
    await onboard(page, '小明');
    await expect(page.locator('.user-nickname')).toHaveText('小明');
  });

  test('新增记录表单可打开，无坐标时提示先选点', async ({ page }) => {
    await onboard(page);
    await page.locator('.add-btn').click();
    const form = page.locator('.modal').filter({ hasText: '新增记录' });
    await expect(form).toBeVisible();
    await form.locator('input[placeholder="例如：北京烤鸭"]').fill('测试烤鸭');
    await form.locator('input[placeholder="例如：全聚德（王府井店）"]').fill('测试烤鸭店');
    await form.getByRole('button', { name: '保存' }).click();
    await expect(page.locator('.toast')).toContainText('请先在地图上选点', { timeout: 5000 });
  });

  test('通过 API 创建记录后显示在 sidebar 列表', async ({ page, request }) => {
    await onboard(page, '测试食客');
    const userId = await page.evaluate(() => localStorage.getItem('foodmap_userId'));
    expect(userId).toBeTruthy();

    const res = await request.post('/api/entries', {
      multipart: {
        dish_name: 'E2E水煮鱼',
        restaurant_name: 'E2E川菜馆',
        longitude: '116.4001',
        latitude: '39.9001',
        user_id: userId,
        visibility: 'private'
      }
    });
    expect(res.status()).toBe(201);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.entry-item').filter({ hasText: 'E2E水煮鱼' })).toBeVisible();
  });
});

test.describe('sidebar 内弹窗回归测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await onboard(page);
  });

  test('回收站弹窗覆盖在 sidebar 内部并居中', async ({ page }) => {
    await page.locator('.trash-btn').click();
    await expect(page.locator('.modal-trash')).toBeVisible();
    await expectOverlayInsideSidebar(page, page.locator('.modal-overlay'));
    await page.locator('.modal-trash .close-btn').click();
    await expect(page.locator('.modal-trash')).toBeHidden();
  });

  test('共享弹窗覆盖在 sidebar 内部并居中', async ({ page }) => {
    await openShare(page);
    await expectOverlayInsideSidebar(page, page.locator('.modal-overlay'));
    await page.locator('.share-modal .close-btn').click();
    await expect(page.locator('.share-modal')).toBeHidden();
  });

  test('个人信息弹窗覆盖在 sidebar 内部并居中', async ({ page }) => {
    await page.locator('.user-badge-btn').click();
    await expect(page.locator('.user-modal')).toBeVisible();
    await expectOverlayInsideSidebar(page, page.locator('.modal-overlay'));
    await page.locator('.user-modal .close-btn').click();
    await expect(page.locator('.user-modal')).toBeHidden();
  });

  test('房间码与复制/分享按钮不重合', async ({ page, request }) => {
    await openShare(page);

    const userId = await page.evaluate(() => localStorage.getItem('foodmap_userId'));
    const created = await request.post('/api/groups', {
      data: { name: 'E2E测试房间', creator_id: userId }
    });
    expect(created.status()).toBe(201);
    const code = (await created.json()).group.id;

    // Reopen the panel so the fresh room shows up in "已加入的房间".
    await page.locator('.share-modal .close-btn').click();
    await openShare(page);

    const room = page.locator('.share-room').filter({ hasText: 'E2E测试房间' });
    await room.locator('.share-room-actions .icon-btn').first().click();
    await expect(page.locator('.room-detail-code')).toHaveText(code);

    const codeBox = await page.locator('.room-detail-code').boundingBox();
    expect(codeBox).not.toBeNull();
    const buttonBoxes = await page.locator('.room-detail-code-row .ghost-btn').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, width: r.width };
      })
    );
    expect(buttonBoxes.length).toBeGreaterThan(0);
    for (const b of buttonBoxes) {
      const noHorizontalOverlap =
        codeBox.x + codeBox.width <= b.x + 1 || b.x + b.width <= codeBox.x + 1;
      expect(noHorizontalOverlap, 'room code box must not overlap the buttons').toBe(true);
    }
  });
});
