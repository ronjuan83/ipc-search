# ipc-conversion

`ipc-conversion` 是一個以 IPC 版本異動查詢、分類流變探索與重分類輔助為核心的工具專案。

## 產品定位

`ipc-conversion` 應被定位為 **IPC 知識工具**，而不是完整的語意專利搜尋引擎。

它最有價值的角色是：

- 查詢 IPC subclass 與 group 在不同版本之間的異動
- 協助分析人員理解分類移轉去向
- 支援重分類與 concordance 工作流程
- 作為其他專利工具可重用的 taxonomy / crosswalk 底層

更完整的定位與 roadmap 請見 [product-positioning-roadmap.md](/Users/juanhsiencheng_1/Downloads/ipc-conversion/docs/product-positioning-roadmap.md)。

## 目前範圍

目前這個專案已經具備：

- subclass 歷史異動查詢
- group 層級的解析與 range 展開
- 來源與去向之間的 flow tracing
- 批次重分類輔助頁面
- 輕量的技術詞反查 IPC 功能

核心資料資產：

- [ipc_data.json](/Users/juanhsiencheng_1/Downloads/ipc-conversion/public/ipc_data.json)
- [ipc_names.json](/Users/juanhsiencheng_1/Downloads/ipc-conversion/public/ipc_names.json)
- [ipc_group_titles.json](/Users/juanhsiencheng_1/Downloads/ipc-conversion/public/ipc_group_titles.json)
- [ipc_groups.json](/Users/juanhsiencheng_1/Downloads/ipc-conversion/public/ipc_groups.json)
- [tech_keywords.json](/Users/juanhsiencheng_1/Downloads/ipc-conversion/public/tech_keywords.json)

## 這個 Repo 不應該變成什麼

這個 repo 不適合成為以下功能的主戰場：

- 完整的專利語意搜尋
- 全文說明書概念抽取
- 由 LLM 直接生成檢索式
- embedding pipeline 或向量檢索服務

這些能力更適合放在像 `patent-semantic-search` 這種獨立專案中。

## 在整體工具鏈中的角色

比較乾淨的分工方式是：

- `ipc-conversion`：提供可信的 IPC concordance、版本異動與重分類工作流
- `patent-semantic-search`：負責概念抽取、術語展開與檢索式生成

在這種分工下，`ipc-conversion` 可以成為其他工具所依賴的 taxonomy 與 crosswalk 知識層。

## 本機開發

```bash
npm run dev
npm run build
```

預設本機預覽網址：

- `http://localhost:5174/ipc-conversion/`

## 資料更新

`public/ipc_data.json` 來自 `patent-query` pipeline 產出的資料。更新方式可參考 [AGENTS.md](/Users/juanhsiencheng_1/Downloads/ipc-conversion/AGENTS.md)。

## 近期優先方向

1. 把產品敘事明確收斂為 IPC concordance 工具
2. 補強版本比較與 crosswalk 工作流
3. 提升批次重分類與人工審查體驗
4. 定義可供下游工具重用的 taxonomy 輸出格式
