# ipc-conversion — Claude 導航手冊

## 專案概覽

- **網址**：https://ronjuan83.github.io/ipc-conversion/
- **GitHub**：https://github.com/ronjuan83/ipc-conversion
- **技術棧**：React 19 + Vite 8，部署於 GitHub Pages（gh-pages 分支）
- **功能**：IPC 分類代碼歷史查詢（跨版本異動，涵蓋 IPC v6 → 2026.01 共 24 版本）

---

## 檔案結構

```
src/
  App.jsx                  主元件：搜尋框、自動完成、SubclassCard、PrefixList
  App.css                  所有樣式
  index.css                最小 reset CSS
  main.jsx                 React 入口
  components/
    DstCell.jsx            可點擊的 IPC 代碼連結（含 title hint）
    StatusBadge.jsx        代碼狀態標籤（現行/新增/廢棄/已遷移）
    TechClassifier.jsx     技術關鍵詞反查 IPC（Fuse.js + WIPO IPCCAT）
  context/
    IpcNamesContext.jsx    中英文名稱查詢 Context
  utils/
    ipcParser.js           IPC 代碼解析、範圍展開
    groupIndex.js          組號 → 關聯記錄索引
    flowGraph.js           有向圖、跨版本流變追蹤

public/
  ipc_data.json            主資料（273 KB）— introduced_in / deprecated_to / subclass_index
  ipc_names.json           Subclass 中文名稱
  ipc_group_titles.json    Group 中英文名稱
  ipc_groups.json          所有 Group 碼列表
  tech_keywords.json       技術關鍵詞（TechClassifier 用）
  reclassify.html          批次重分類（五階）
  reclassify-class.html    重分類二階（Class，三碼）
  reclassify-subclass.html 重分類三階（Subclass，四碼）
  IPC_CONCORDANCE_MAP.md   IPC 版本異動詳細文件

.github/workflows/deploy.yml   push main → 自動 build → peaceiris 推送 gh-pages
vite.config.js                 base: '/ipc-conversion/'
```

---

## 資料格式（ipc_data.json）

```json
{
  "introduced_in": { "C40B": "2000.01", ... },
  "deprecated_to": { "G06C": "G06N", ... },
  "subclass_index": {
    "H01L": {
      "donated": [{ "version": "1995.01→2000.01", "src_group": "H01L 21/00", "dst": "B81C 1/00" }],
      "received": [{ "version": "2000.01→2006.01", "from": "B65G 49/07", "dst": "H01L 21/677", "src_sub": "B65G" }]
    }
  }
}
```

---

## 常用指令

```bash
npm run dev        # 本地預覽 http://localhost:5174/ipc-conversion/
npm run build      # 產出 dist/
git add src/ public/ && git commit -m "說明" && git push  # 部署（Actions 自動處理）
```

## 部署流程

Push `main` → GitHub Actions 執行 `npm run build` → `peaceiris/actions-gh-pages@v4` 推送 `dist/` 到 `gh-pages` 分支 → GitHub Pages 自動更新

---

## 更新資料

`public/ipc_data.json` 由 `patent-query` 的 pipeline 產生。更新步驟：

```bash
# 在 patent-query 目錄執行
python3 -c "
import json, sys
sys.path.insert(0, '.')
from pipeline.ipc_concordance import INTRODUCED_IN, DEPRECATED_TO
from docs import ipc_subclass_index  # 見 docs/ipc_subclass_index.json

with open('docs/ipc_subclass_index.json') as f:
    idx = json.load(f)

data = {'introduced_in': INTRODUCED_IN, 'deprecated_to': DEPRECATED_TO, 'subclass_index': idx}
with open('../ipc-conversion/public/ipc_data.json', 'w') as f:
    json.dump(data, f, ensure_ascii=False)
"
```

或直接複製：
```bash
cp ~/Downloads/patent-query/docs/ipc_subclass_index.json ~/Downloads/ipc-conversion/public/
# 然後重新執行 generate_ipc_data.py 或手動更新 ipc_data.json
```
