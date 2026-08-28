# CoachPoint — WebMCP Challenge 開發規劃書

> 工作代號 CoachPoint(by Crosspoint),可自行更名。
> 目標:2026/9/3 13:00 PDT(台灣 9/4 04:00)前提交 The WebMCP Challenge。
> 本文件為完整實作規格,交付 coding agent 依此開發。

---

## 0. 一句話定位

開源的 agent-native 居家運動處方(HEP)平台:治療師與 AI agent 協作開處方,病患在家由「網頁反射層 + agent 認知層」雙層教練帶著做,依從性自動回報。

**核心論點(寫給評審看的)**:即時姿勢數據只存在 client-side,後端 MCP 拿不到;WebMCP 讓 agent 第一次能參與「毫秒級感測 + 秒級認知」的分層協作。這是「非 WebMCP 不可」的 use case。

---

## 1. 比賽交付物 Checklist

| 項目      | 要求                                                                | 本專案對應     |
| --------- | ------------------------------------------------------------------- | -------------- |
| Live URL  | ChatGPT 內建瀏覽器 / Chrome(開 `#enable-webmcp-testing` flag)可操作 | 部署 Vercel    |
| 文字說明  | 為何適合 WebMCP、UX 如何更好、人+agent 一起能做什麼、實作方式       | 見 §10         |
| Demo 影片 | <3 分鐘、公開 YouTube、有旁白                                       | 見 §9 分鏡     |
| 開源 repo | GitHub,含全部運作所需程式碼與素材,License 檔需在 About 區可見       | 見 §8 授權分層 |

---

## 2. 技術棧

- **框架**:Next.js 14+ (App Router) + TypeScript + Tailwind
- **姿勢偵測**:MediaPipe Tasks Vision — `PoseLandmarker`(瀏覽器端,GPU delegate,fallback CPU)
- **語音**:Web Speech API `speechSynthesis`(英文,失敗時退回畫面字幕)
- **狀態儲存**:Vercel KV(或 Upstash Redis free tier)。只存三種資料:動作處方(program)、訓練紀錄(session)、病患代碼對應。無會員系統。
- **WebMCP**:原生 `document.modelContext`(⚠️ 不是 `navigator.modelContext`,舊名 Chrome 150 已棄用;網路教學多為舊寫法,勿照抄)。開發期可加 `@mcp-b/global` polyfill 便於在未開 flag 的環境測試,但正式提交以原生 API 為準。
- **部署**:Vercel(比賽贊助商,submission 可提及)

### WebMCP 實作鐵則

1. 一律 feature detect:`if ('modelContext' in document)`,不支援時顯示引導頁(如何開 flag / 用 ChatGPT 瀏覽器)。
2. SPA 路由切換時必須 unregister(用 `AbortController` signal),避免 ghost tools。治療師頁和病患頁註冊的工具集不同。
3. inputSchema 必須逐欄位寫 `description`,禁止空泛的 `{ type: "object" }`。
4. `execute` 一律 try/catch,錯誤以結構化文字回傳(agent 會轉述給使用者),不可 silent fail。
5. 工具回傳格式:`{ content: [{ type: "text", text: JSON.stringify(payload) }] }`。

---

## 3. 系統架構:反射層 / 認知層

```
┌────────────────────────────── 瀏覽器 ──────────────────────────────┐
│  反射層(毫秒級,純網頁)          認知層(秒級,agent 經 WebMCP)     │
│  ├ MediaPipe 姿勢串流              ├ 讀處方、排順序                  │
│  ├ 關節角度計算 + 狀態機計次        ├ 讀整組結果 → 個人化回饋          │
│  ├ 即時提示(TTS + 畫面)           ├ 動態調整(減量/跳過/加組)        │
│  └ 品質標記(代償/幅度不足)        └ 產出 session 報告                │
└────────────────────────────────────────────────────────────────────┘
```

**同步機制:long-running execute。** agent 呼叫 `run_exercise_set` 後 promise 掛起,反射層接管帶完一整組,resolve 時把統計數據回給 agent。工具調用本身就是節拍器,agent 不需輪詢。

**Timeout 保險**:未知 ChatGPT 瀏覽器的工具調用 timeout 上限。實作要求:

- 單組目標控制在 60 秒內可完成(reps × 每下秒數估算,超過就自動拆組)。
- 同時實作 fallback 工具組 `start_exercise_set` + `get_set_result`(fire-and-forget + 事後取結果)。開發第一天先實測 long-running 模式在 ChatGPT 瀏覽器是否穩定,不穩定就以 fallback 為主線。

---

## 4. WebMCP 工具清單

### 4a. 治療師頁 `/therapist` 註冊(5 個)

```
search_exercises
  desc: 依部位、關鍵字、難度搜尋動作庫
  input: { query?: string, body_part?: enum[neck|shoulder|back|hip|knee|ankle|balance],
           difficulty?: 1|2|3 }
  return: 動作摘要陣列(id, 名稱, 部位, 預設劑量, 是否支援鏡頭指導)

get_exercise_details
  input: { exercise_id: string }
  return: 完整資料(說明、禁忌提醒、判定規則摘要)

draft_program
  desc: 依治療目標草擬一份處方(寫入 UI 草稿區,不直接生效)
  input: { patient_label: string, goal: string,
           items: [{ exercise_id, sets, reps_or_seconds, frequency_per_day }] }
  return: draft_id + 草稿摘要
  ⚠️ 設計重點:agent 只能「草擬」。畫面上出現草稿卡片,治療師可拖拉調整,
     按下「確認開立」按鈕才生效並產生病患代碼——確認權在人,這是
     human-in-the-loop 的展示點,submission 文案要強調。

update_draft_item
  input: { draft_id, item_index, sets?, reps_or_seconds?, frequency_per_day?, remove?: bool }
  return: 更新後草稿

get_adherence_summary
  desc: 讀取某病患的依從性紀錄(打卡率、疼痛趨勢、各動作品質標記)
  input: { patient_code: string }
  return: 統計 JSON(供 agent 產出回診摘要)
```

### 4b. 病患頁 `/patient/[code]` 註冊(5 個)

```
get_todays_program
  input: {}(code 從 URL 取)
  return: 今日動作清單(名稱、劑量、完成狀態、是否鏡頭指導)

run_exercise_set        ← 主線,long-running
  desc: 啟動一組動作。頁面即時教練接管(鏡頭+語音),整組完成後回傳表現數據
  input: { exercise_id: string, target_reps?: number, target_seconds?: number }
  return(resolve 時): { completed_reps, duration_s, avg_range_deg, range_decline_deg,
           quality_flags: string[](如 "後段幅度衰退" "左右不對稱"), patient_rpe?: number }

start_exercise_set / get_set_result   ← fallback 工具組(同上拆兩段)

skip_exercise
  input: { exercise_id, reason: string }
  return: 確認 + 記錄原因(進依從性資料)

log_pain
  input: { level: 0-10, location?: string }
  return: 確認

submit_session_report
  desc: 結束今日訓練,寫入依從性紀錄
  input: { session_summary: string }(agent 自己寫的總結)
  return: 儲存確認 + 今日完成率
```

### 4c. 給 agent 的引導(provideContext / 頁面 meta)

病患頁載入時透過 `provideContext`(若可用)或工具 description 告知 agent 角色設定:「你是復健教練,語氣鼓勵、簡短。流程:讀今日處方 → 逐一帶組 → 每組結束依數據給一句個人化回饋 → 全部完成後 submit_session_report。回饋依據 quality_flags 與 range_decline,發現疼痛回報 ≥5 建議停止並回報治療師。」

---

## 5. 動作資料集

`/data/exercises.json`,**15 個動作**,schema:

```jsonc
{
  "id": "half-squat",
  "name_zh": "半蹲",
  "name_en": "Half Squat",
  "body_part": "knee",
  "difficulty": 1,
  "default_dosage": { "sets": 3, "reps": 10, "frequency_per_day": 1 },
  "instructions_zh": "...",
  "contraindication_note": "膝關節急性發炎期避免",
  "coaching_mode": "camera", // camera | timer
  "detection": {
    // coaching_mode=camera 才有
    "primary_angle": { "joints": ["hip", "knee", "ankle"], "side": "both" },
    "rep_state_machine": {
      "down_threshold_deg": 120, // 膝角 < 120 視為蹲下
      "up_threshold_deg": 160,
      "min_hold_ms": 300,
    },
    "quality_rules": [
      { "flag": "幅度不足", "rule": "min_angle > 130" },
      { "flag": "左右不對稱", "rule": "abs(left-right) > 12" },
    ],
    "realtime_cues": [
      { "when": "min_angle > 130", "say": "再蹲低一點" },
      { "when": "rep_done", "say": "{count}" },
    ],
  },
}
```

**範圍控制(重要)**:只有 **5 個動作**做完整 camera 偵測,其餘 10 個用 `timer` 模式(倒數計時 + 手動確認 + 自評 RPE)。camera 5 動作挑「正面鏡頭、單一主角度、站姿」的:

1. 半蹲(膝角)
2. 肩前舉/棍棒輔助肩前舉(肩屈曲角)
3. 髖外展抬腿(髖外展角)
4. 提踵(踝角 + 肩髖垂直位移)
5. 單腳站(髖中點水平位移 → 穩定度,計秒不計次)

timer 模式 10 個從常見 HEP 挑(下巴內收、橋式、貓牛式、足底滾球、半跪髖屈肌伸展、肌腱滑動、靠牆天使、鳥狗式、死蟲式、坐姿膝伸直),資料自行撰寫,劑量用教科書常規值即可(demo 用途,頁面保留衛教免責聲明)。

**判定引擎要寫成通用 DSL 解譯器**(讀 detection JSON 執行),不要 hardcode 每個動作——這是未來健身版的擴充點。

---

## 6. 頁面規格

### `/`(Landing)

一屏說明 + 兩顆按鈕(治療師 demo / 病患 demo)+ WebMCP 支援偵測提示 + 「開 flag 教學」摺疊區。標注 open source by Crosspoint,連 GitHub 與 pt-lib。

### `/therapist`

- 左:動作庫瀏覽(可手動操作——記住「人也要能用」,這不是 agent-only 介面)
- 右:處方草稿區。agent `draft_program` 後草稿卡片出現,人可拖拉排序、改劑量
- 「確認開立」→ 產生 6 碼病患代碼 + 病患頁連結(demo 免登入,以代碼為 key)
- 下方:依從性儀表板(打卡日曆、疼痛趨勢折線、品質標記列表)。預先 seed 一位假病患「陳先生」兩週的資料供 demo 與影片使用。

### `/patient/[code]`

- 今日清單(完成打勾)
- 訓練畫面:鏡頭 preview + 骨架 overlay(MediaPipe drawing utils)+ 大字計次 + 即時提示字幕;TTS 同步發聲
- camera 權限被拒 → 自動降級 timer 模式
- 訓練結束畫面:本次統計摘要(agent 會另外用自己的話講,兩者互補)

### 引導文案

每頁固定一個「怎麼跟 agent 一起用」提示框,附建議 prompt(例:「請當我的復健教練,帶我做今天的處方」)。評審是第一次用的人,降低他們的啟動成本等於直接加 Execution 分。

---

## 7. 開發時程(4 天)

| 天  | 內容                                                                                                                                                 | 驗收                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| D1  | 專案腳手架、exercises.json 15 筆、反射層核心(MediaPipe 串流、角度計算、狀態機計次、TTS)、**當天實測 long-running execute 在 ChatGPT 瀏覽器是否可行** | 半蹲能正確計次並語音提示;long-running 可行性結論                     |
| D2  | 病患頁全流程 + 4b 工具組 + KV 儲存                                                                                                                   | ChatGPT 瀏覽器內 agent 能完整帶完一次訓練                            |
| D3  | 治療師頁 + 4a 工具組 + 依從性儀表板 + seed 資料 + 部署 Vercel + 雙瀏覽器實測(ChatGPT 內建 / Chrome flag)                                             | 兩端全流程通;Chrome DevTools → Application → WebMCP 面板可見全部工具 |
| D4  | 文案、README、License、錄影、剪輯、提交                                                                                                              | 提交完成                                                             |

D4 之後留至少一天 buffer 到截止日。

---

## 8. 授權與 IP 邊界

- 程式碼:**MIT**,LICENSE 置於 repo 根目錄,GitHub About 區設定 license 使其可見(比賽硬性要求)。
- 動作示意圖:預設方案——挑 15 張 pt-lib 圖,`/public/assets/exercises/` 附獨立 `LICENSE-ASSETS.md`,授權 **CC BY 4.0(署名 Crosspoint)**;README 明確說明雙授權分層。若最終決定不放圖,以骨架示意 SVG 取代,功能不受影響。
- **禁止事項**:不得複製 pt-lib 任何程式碼;不得放入 World Gym 相關評估邏輯、臨床劑量資料;quality_rules 只寫本文件列出的簡化版。
- README 結構:專案介紹 → 架構圖(反射層/認知層)→ 快速開始 → WebMCP 工具一覽表 → 「by Crosspoint」段落(連 pt-lib、crosspoint 官網)→ 未來規劃(fitness vertical 一句帶過,埋鉤子)。

---

## 9. Demo 影片分鏡(2:50)

| 時間      | 畫面                                                                                       | 旁白要點                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | pt 診所情境圖卡 → 問題陳述                                                                 | 「處方開完,病人回家才是復健的開始——但沒人知道他做了沒、做對沒」                                                               |
| 0:20–1:00 | ChatGPT 瀏覽器開治療師頁,對 agent 說目標,agent 搜尋動作庫、草擬處方,治療師拖拉調整、按確認 | 「agent 做組合的苦工,臨床判斷與最終確認留在治療師手上」                                                                       |
| 1:00–2:00 | 病患頁:鏡頭開、骨架 overlay,網頁即時數數與提示;整組結束 agent 開口給個人化回饋、調整下一組 | 「毫秒級的即時指導由網頁反射層負責,秒級的理解與調整由 agent 負責——這是 WebMCP 才可能的分工,因為姿勢數據只存在瀏覽器裡」       |
| 2:00–2:25 | 回治療師儀表板:依從率、疼痛趨勢、品質標記;agent 用 get_adherence_summary 產出回診摘要      | 「回診前,agent 一句話講完兩週狀況」                                                                                           |
| 2:25–2:50 | Chrome DevTools WebMCP 面板展示註冊的 10 個工具 → GitHub repo → logo                       | 「全部開源,MIT。By Crosspoint——我們的動作評估技術在 World Gym 全台 70+ 分店運行、累積 5 萬筆資料,這是它的 agent-native 未來」 |

錄影備註:病患端輸入用打字即可(語音模式不押注);先彩排一次完整流程再錄;agent 回覆有隨機性,多錄幾 take 挑最順的。

---

## 10. Submission 文字說明大綱

依比賽要求四點逐一回答,並對映評分標準:

1. **為何適合 WebMCP**(→ WebMCP Leverage):即時姿勢串流只存在 client-side,任何後端 MCP/API 都拿不到;10 個工具覆蓋雙角色完整工作流;long-running execute 作為人機同步節拍器的設計。
2. **更好的體驗**(→ Execution):治療師 2 分鐘開處方(agent 組稿+人確認);病患獲得過去只有一對一才有的即時指導;完整產品迴圈(開立→執行→回報→回診)而非單點 demo。
3. **人+agent 一起做到以前做不到的事**(→ Impact):引 WHO/常見文獻級論述「居家運動依從性長期偏低」,說明無監督是主因;本方案讓「有人看著我做」規模化。實績背書:技術團隊的動作評估已在台灣最大健身連鎖 70+ 分店運行、5 萬筆資料(此段為敘事,不涉開源內容)。
4. **實作方式**(→ Leverage/Creativity):反射層/認知層架構圖 + 工具清單 + `document.modelContext` 遷移、AbortController 生命週期管理、feature detection 等工程細節,展示對規格的熟度。

---

## 11. 給 coding agent 的補充指示

- 全站英文為主(demo 為國際評審)。
- 行動裝置不是重點,桌機 1280+ 優先(評審用桌面瀏覽器)。
- 不做:登入系統、金流、多語系、PWA、測試覆蓋率。demo 品質 > 工程完備。
- 頁面 footer 固定衛教免責聲明(參考 pt-lib 現有文案自行改寫,不逐字複製)。
- 命名保持領域中性(`run_exercise_set` 而非 `run_rehab_set`),教練 persona 文案獨立成 config——為健身版擴充預留。
