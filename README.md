# Gym Weight Tracker V1.0

簡潔、繁體中文、手機優先的離線健身重量紀錄 PWA。每個動作只記一個 kg 重量。

## 功能

- Push / Pull / Legs 清單快速切換，獨立排序、加入及移除動作。
- 102 個中英對照預設動作，涵蓋胸、背、肩、手臂、腿及核心。
- 機械式、啞鈴、槓鈴、滑輪、徒手分類，支援中英文搜尋及肌群篩選。
- 自訂動作新增、編輯、刪除及加入多個 PPL 清單。
- 直接輸入重量及大尺寸 ± 按鈕，步幅可調至 0.01–100 kg。
- 每次有效輸入即時保存。相同裝置分頁內、相隔不超過 2 秒的同一動作調整合併成一筆歷史，保留初始及最終重量，返回原值則不留多餘紀錄。
- IndexedDB 本機儲存、JSON 匯出及原子匯入。匯入前驗證完整結構，並顯示取代確認。
- 深色介面、iPhone safe area、主畫面圖示、Service Worker 離線快取。

沒有組數、次數、開始／結束、完成按鈕、休息計時器或 AI 功能。

## 開發與驗證

使用 Node.js 22.12+ 或 24，以及 npm。

```sh
npm ci
npm run dev
# http://localhost:5173/gym-tracker/
npm test
npm run build
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

`npm run check` 依次執行單元測試、型別檢查／正式 Build 及瀏覽器測試。
Playwright 使用正式 Build 的 Vite preview，在 Chromium Android 尺寸及 WebKit iPhone 尺寸執行完整操作及離線重載測試。這不等同實體 iPhone 的主畫面安裝測試。

## GitHub Pages

目標網址：<https://bugu-robot.github.io/gym-tracker/>

1. Repository 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。首次建立 Pages 網站需要 repository 管理員設定。
2. Review 並合併本 PR 至 `main`，`Deploy GitHub Pages` workflow 會自動執行測試、Build、兩種瀏覽器 E2E，再部署 `dist`。也可在 `main` 手動觸發。
3. PR 及開發分支只執行 CI，不部署網站。PR 未合併前，以上網址不會提供這個版本。

Vite `base`、manifest `scope`／`start_url`、Service Worker navigation fallback 均設定為 `/gym-tracker/`。如更改 repo 名稱，需要同步修改 `vite.config.ts` 及 Playwright 的 `baseURL`。
部署權限只給 deploy job，PR 的 CI 只有 contents read。Pages build artifact 保存 1 天。

## iPhone 使用

以 Safari 開啟已部署網址，等待頁尾顯示「已可離線使用」，再點「分享 → 加入主畫面」。首次需要連線下載 App，其後可離線記錄。新版本可用時顯示更新提示，不會在輸入途中強制重新整理。

重量上限 2000 kg，最多兩位小數。啞鈴按單邊重量；徒手輸入 0 或額外負重；槓鈴及機械按一致的總重量／器材讀數記錄。每個動作只有一個共用重量，即使加入不同 PPL 清單亦相同。

資料只儲存於當前瀏覽器的 IndexedDB，沒有帳號及跨裝置同步。不同瀏覽器或主畫面安裝的儲存可能獨立，轉移請使用 JSON 備份。清除網站資料或瀏覽器移除儲存會遺失本機資料，請定期匯出。

## 資料結構與版本

- `exercises`：穩定 id、中英文名、器材、肌群、是否自訂、PPL memberships、各清單排序、目前重量（null 表示尚未記錄）。
- `history`：動作 id、舊／新重量、開始及最後變更的 UTC epoch milliseconds、分頁 session id。畫面依裝置時區顯示。
- `settings`：單一 preferences record，儲存重量步幅。
- Dexie schema v1 → v2 migration 補上歷史 startedAt，並建立 `[exerciseId+at]` 複合索引；升級測試以真正 v1 schema 驗證資料保留。
- 備份格式 `app: gym-weight-tracker`、`version: 1`，與資料庫 schema 版本分開。檔案上限 10 MB、5000 個動作、50000 筆歷史；拒絕未知版本、重複 id、孤立歷史及無效值。
- 重量及歷史於同一 read/write transaction 寫入。匯入一次性取代三個 tables，任一步失敗會整體 rollback。

## 技術

React、TypeScript、Vite、Tailwind CSS、Dexie、vite-plugin-pwa／Workbox、Vitest／fake-indexeddb、Playwright。所有執行所需資產均隨 App 快取，不依賴外部字型或 API。
