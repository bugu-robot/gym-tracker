import { expect, test } from "@playwright/test";
import { startOfflineServer } from "./offline-server";
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("status").filter({ hasText: "已自動保存" }),
  ).toBeVisible();
});
test("quick weight entry, burst history, navigation, persistence", async ({
  page,
}) => {
  const card = page.getByTestId("weight-card").filter({ hasText: "機械胸推" });
  await card
    .getByRole("button", { name: "機械胸推增加2.5公斤" })
    .click({ clickCount: 3 });
  await expect(
    card.getByRole("textbox", { name: "機械胸推重量", exact: true }),
  ).toHaveValue("7.5");
  await card.getByRole("button", { name: "機械胸推重量歷史" }).click();
  await expect(page.locator(".history-list li")).toHaveCount(1);
  await expect(page.locator(".history-list")).toContainText("7.5 kg");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.reload();
  await expect(
    card.getByRole("textbox", { name: "機械胸推重量", exact: true }),
  ).toHaveValue("7.5");
  await card
    .getByRole("textbox", { name: "機械胸推重量", exact: true })
    .fill("22.25");
  await page.getByRole("heading", { name: "每次進步，簡單記下。" }).click();
  await page.getByRole("button", { name: "Pull 拉力日" }).click();
  await expect(
    page.getByRole("heading", { name: "高位下拉機", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Push 推力日" }).click();
  await expect(
    card.getByRole("textbox", { name: "機械胸推重量", exact: true }),
  ).toHaveValue("22.25");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("library filters, bilingual search, membership and reordering", async ({
  page,
}) => {
  await page.getByRole("button", { name: "動作庫", exact: true }).click();
  await page.getByRole("button", { name: "器材與肌群篩選" }).click();
  await page.getByLabel("篩選器材").selectOption("Barbell");
  await page.getByLabel("搜尋動作").fill("Bench Press");
  await expect(page.locator(".library-card")).toHaveCount(4);
  await page
    .getByRole("button", { name: "加入槓鈴臥推Push", exact: true })
    .click();
  await page.getByRole("button", { name: "我的清單" }).click();
  await expect(
    page.getByRole("heading", { name: "槓鈴臥推", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "編排清單" }).click();
  await page.getByRole("button", { name: "槓鈴臥推上移", exact: true }).click();
  await expect(page.getByTestId("weight-card").nth(3)).toContainText(
    "槓鈴臥推",
  );
  await page.getByRole("button", { name: "移除槓鈴臥推", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "槓鈴臥推", exact: true }),
  ).toHaveCount(0);
});
test("custom movement create, edit, delete and PPL assignment", async ({
  page,
}) => {
  await page.getByRole("button", { name: "動作庫", exact: true }).click();
  await page.getByRole("button", { name: "自訂動作" }).click();
  await page.getByLabel("中文名稱").fill("測試胸推");
  await page.getByLabel("英文名稱").fill("Test Press");
  await page.getByLabel("Pull", { exact: true }).check();
  await page.getByRole("button", { name: "儲存動作" }).click();
  await page.getByLabel("搜尋動作").fill("Test Press");
  const row = page.locator(".library-card").filter({ hasText: "Test Press" });
  await row.getByRole("button", { name: "編輯" }).click();
  await page.getByLabel("中文名稱").fill("改名胸推");
  await page.getByRole("button", { name: "儲存動作" }).click();
  await expect(row).toContainText("改名胸推");
  await page.getByRole("button", { name: "我的清單" }).click();
  await page.getByRole("button", { name: "Pull 拉力日" }).click();
  await expect(page.getByRole("heading", { name: "改名胸推" })).toBeVisible();
  await page.getByRole("button", { name: "動作庫", exact: true }).click();
  await page.getByLabel("搜尋動作").fill("Test Press");
  await page.getByRole("button", { name: "刪除改名胸推" }).click();
  await page.getByRole("button", { name: "確認刪除" }).click();
  await expect(page.getByRole("heading", { name: "改名胸推" })).toHaveCount(0);
});
test("backup download, preview, restore and malformed import protection", async ({
  page,
}) => {
  await page
    .getByRole("textbox", { name: "機械胸推重量", exact: true })
    .fill("30");
  await page.getByRole("button", { name: "設定與備份" }).click();
  await page.getByRole("button", { name: "0.5 kg", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "匯出 JSON 備份" }).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  await page.getByLabel("選擇備份檔案").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "原有資料未變更",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "關閉錯誤" })
    .click();
  await page.getByLabel("選擇備份檔案").setInputFiles(file!);
  await expect(page.getByRole("dialog")).toContainText("102 個動作");
  await page.getByRole("button", { name: "確認取代並匯入" }).click();
  await expect(
    page.getByRole("textbox", { name: "機械胸推重量", exact: true }),
  ).toHaveValue("30");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "機械胸推增加0.5公斤" }),
  ).toBeVisible();
});
test("installed service worker reloads app with the origin server stopped", async ({
  page,
}) => {
  const origin = await startOfflineServer();
  try {
    await page.goto(origin.url);
    const input = page.getByRole("textbox", {
      name: "機械胸推重量",
      exact: true,
    });
    await input.fill("42.5");
    await expect(
      page.getByRole("status").filter({ hasText: "已自動保存" }),
    ).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await origin.stop();
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(input).toHaveValue("42.5");
    await page.getByRole("button", { name: "機械胸推增加2.5公斤" }).click();
    await expect(input).toHaveValue("45");
    await page.reload();
    await expect(input).toHaveValue("45");
  } finally {
    await origin.stop();
  }
});

test("weight boundaries and invalid drafts keep the last saved value", async ({
  page,
}) => {
  const input = page.getByRole("textbox", {
    name: "機械胸推重量",
    exact: true,
  });
  await input.fill("2000");
  await expect(
    page.getByRole("button", { name: "機械胸推增加2.5公斤" }),
  ).toBeDisabled();
  await input.fill("2000.01");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("heading", { name: "每次進步，簡單記下。" }).click();
  await expect(input).toHaveValue("2000");
  await input.fill("0");
  await page.getByRole("heading", { name: "每次進步，簡單記下。" }).click();
  await expect(
    page.getByRole("button", { name: "機械胸推減少2.5公斤" }),
  ).toBeDisabled();
  await page.reload();
  await expect(input).toHaveValue("0");
});
