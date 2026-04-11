# 產品定位與 Roadmap

## 建議定位

`ipc-conversion` 最適合被定位為 **IPC Concordance Explorer 與 Reclassification Assistant**。

換句話說，這個產品最合理的理解方式是：

- 一個用來查 IPC 版本異動的參考工具
- 一個協助專利分析人員與檢索人員做重分類判斷的工作流工具
- 一個可被其他專利搜尋系統重用的 taxonomy / crosswalk 底層

它不應該成為語意搜尋或端到端專利檢索式生成的主產品。

## 為什麼這個定位合理

這個 repo 已經具備的優勢，正好都落在這個方向上：

- 結構化的 IPC 異動資料：[ipc_data.json](/Users/juanhsiencheng_1/Downloads/ipc-conversion/public/ipc_data.json)
- subclass 與 group 名稱資料：[ipc_names.json](/Users/juanhsiencheng_1/Downloads/ipc-conversion/public/ipc_names.json) 與 [ipc_group_titles.json](/Users/juanhsiencheng_1/Downloads/ipc-conversion/public/ipc_group_titles.json)
- 分類流變追蹤邏輯：[flowGraph.js](/Users/juanhsiencheng_1/Downloads/ipc-conversion/src/utils/flowGraph.js)
- group 解析與 range 展開能力：[ipcParser.js](/Users/juanhsiencheng_1/Downloads/ipc-conversion/src/utils/ipcParser.js)
- 批次重分類頁面：[reclassify.html](/Users/juanhsiencheng_1/Downloads/ipc-conversion/public/reclassify.html)、[reclassify-class.html](/Users/juanhsiencheng_1/Downloads/ipc-conversion/public/reclassify-class.html)、[reclassify-subclass.html](/Users/juanhsiencheng_1/Downloads/ipc-conversion/public/reclassify-subclass.html)

目前的技術詞反查功能是有用的，但比較適合作為輔助入口，而不是整個產品的主軸。

## 主要使用者

最適合的核心使用者：

- 需要理解 IPC 版本異動的專利檢索人員
- 需要做 concordance 與重分類判斷的分類分析人員
- 處理歷史專利資料的 IP 研究者
- 需要 IPC crosswalk 邏輯的內部工具專案

次要使用者：

- 想用 IPC 探索技術領域的發明人或研發團隊
- 需要 taxonomy grounding 的語意搜尋系統

## 核心待完成工作

1. 給定一個 IPC 代碼，快速看出它在不同版本之間如何變動
2. 給定一個舊 IPC，找出其可能對應的現行分類去向
3. 給定一個 group 或 range，展開並檢視其異動歷史
4. 給定一批舊 IPC，協助分析人員批次審查重分類建議
5. 對外提供可被其他系統重用的 IPC crosswalk 輸出

## 非目標

以下能力不應成為這個 repo 的主要產品目標：

- 專利全文說明書解析
- 長文本語意概念抽取
- 向量搜尋與 embedding retrieval
- 用 LLM 直接生成 Boolean 檢索式
- 專利語料檢索排序

這些更適合放在 `patent-semantic-search` 或其他專門的搜尋專案裡。

## 產品一句話說明

如果要用一句話描述這個產品：

`ipc-conversion` 是最快理解 IPC 分類如何流變、代碼去了哪裡、以及如何更有把握地做重分類判斷的工具。

## Roadmap

### Phase 1：把產品主軸講清楚

目標：

- 讓網站明確呈現為 IPC concordance 與 reclassification 工具

建議工作：

- 移除預設模板式 README，改成產品導向文件
- 調整 UI 文案，讓主敘事從 generic search 回到 concordance
- 把 `TechClassifier` 明確定位為輔助面板，而不是主承諾
- 在首頁更明顯地呈現版本比較與異動分析用例

成果：

- 使用者一進來就知道這個工具真正要解決什麼問題

### Phase 2：加強 Concordance 工作流

目標：

- 讓 subclass 與 group 異動分析更貼近分析人員實際工作

建議工作：

- 加入明確的兩版本比較模式
- 增加 `新增`、`廢棄`、`拆分`、`合併`、`移轉` 等狀態標記
- 加入方向篩選：移出、移入、未變動
- 讓目前查詢結果可下載 crosswalk 表格
- 強化版本轉換與去向歧義的說明文案

成果：

- 這個 app 會更像日常可用的 concordance explorer

### Phase 3：升級批次重分類流程

目標：

- 把目前偏靜態的輔助頁面升級成更完整的人工審查工作流

建議工作：

- 將重分類頁整合在同一個 workflow shell 裡
- 支援 CSV 匯入、貼上清單、匯出審查結果
- 對一對多或高歧義 mapping 加上風險標記
- 為每個建議顯示 concordance 證據或來源說明
- 支援簡單的人工決策狀態保存

成果：

- 這個工具會更能支撐真實的重分類作業

### Phase 4：成為 Taxonomy Service Layer

目標：

- 讓 `ipc-conversion` 可以被其他產品直接重用，尤其是 `patent-semantic-search`

建議工作：

- 定義可對外輸出的 JSON 格式，例如：
  - subclass labels
  - group titles
  - deprecated-to mappings
  - version crosswalk edges
  - subtree/group expansion 結果
- 補上面向下游工具的 build/export 流程文件
- 後續視需要再加上簡單的 static 或 serverless API

成果：

- 這個 repo 會成為你工具生態中的 IPC 知識底座

### Phase 5：資料品質與治理

目標：

- 讓資料可信到足以作為其他工具的共享依賴

建議工作：

- 為 `ipc_data.json` 與 `tech_keywords.json` 增加 validation script
- 為資料產出補 provenance 說明
- 為 parsing、flow tracing、crosswalk 代表案例加 regression tests
- 文件化資料更新頻率與來源刷新流程

成果：

- 未來其他專案可以更放心依賴這個 repo

## 建議優先順序

如果近期只能做少數幾件事，我會建議：

1. 先完成 Phase 1 的文件與產品敘事整理
2. 接著做 Phase 2 的版本比較與 crosswalk 強化
3. 再做 Phase 3 的批次審查流程升級
4. 最後做 Phase 4 的 taxonomy 輸出與對外介面

## 與 Patent Semantic Search 的分工

最理想的分工是：

- `ipc-conversion` 負責回答：
  - 這個 IPC 代表什麼
  - 它後來移去哪裡
  - 它的 successor 或相關分類是什麼

- `patent-semantic-search` 負責回答：
  - 這份專利文字裡有哪些概念
  - 這些概念應該展開成哪些檢索詞
  - 分析人員應該審查什麼檢索式

這樣的切分會讓兩個產品都更清楚、更穩定。

## 成功指標

`ipc-conversion` 適合追蹤的成功指標包括：

- 回答版本異動問題所需時間
- 分析人員在批次重分類工作流中的完成率與準確性
- 歧義 mapping 被清楚標示的比例
- taxonomy 輸出被下游工具重用的程度
- 分析人員在工具外手動查 IPC crosswalk 的次數是否下降
