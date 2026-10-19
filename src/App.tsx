import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  Dumbbell,
  History as HistoryIcon,
  List,
  Minus,
  Plus,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Trash2,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import {
  changeWeight,
  db,
  deleteCustom,
  initialize,
  moveExercise,
  parseWeight,
  toggleGroup,
} from "./db";
import {
  exportBackup,
  importBackup,
  MAX_BACKUP_BYTES,
  validateBackup,
} from "./backup";
import {
  EQUIPMENT,
  GROUPS,
  MUSCLES,
  type Backup,
  type Equipment,
  type Exercise,
  type Group,
} from "./types";
const session = crypto.randomUUID();
const groupInfo = {
  Push: ["推力日", "胸・肩・三頭肌"],
  Pull: ["拉力日", "背・後肩・二頭肌"],
  Legs: ["腿部日", "腿・臀・核心"],
} as const;
const fmt = (n: number | null) => (n === null ? "未記錄" : String(n));
type Panel =
  | null
  | { type: "settings" }
  | { type: "history"; exercise: Exercise }
  | { type: "editor"; exercise?: Exercise }
  | { type: "import"; data: Backup }
  | { type: "delete"; exercise: Exercise };
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={close} className="sheet">
      <div className="sheet-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="關閉" onClick={close}>
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function WeightCard({
  exercise,
  step,
  run,
  history,
  manage,
  group,
  index,
  total,
}: {
  exercise: Exercise;
  step: number;
  run: (fn: () => Promise<unknown>) => void;
  history: () => void;
  manage: boolean;
  group: Group;
  index: number;
  total: number;
}) {
  const [draft, setDraft] = useState(
    exercise.weight === null ? "" : String(exercise.weight),
  );
  const [focused, setFocused] = useState(false),
    [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (!focused)
      setDraft(exercise.weight === null ? "" : String(exercise.weight));
  }, [exercise.weight, focused]);
  function input(raw: string) {
    setDraft(raw);
    const value = parseWeight(raw);
    setInvalid(value === null);
    if (value !== null)
      run(() => changeWeight(exercise.id, { value }, session));
  }
  return (
    <article className="weight-card" data-testid="weight-card">
      <div className="card-top">
        <span className="tag">{EQUIPMENT[exercise.equipment]}</span>
        <button
          className="history-link"
          onClick={history}
          aria-label={`${exercise.zh}重量歷史`}
        >
          <HistoryIcon size={15} />
          <span>歷史</span>
        </button>
      </div>
      <h3>{exercise.zh}</h3>
      <p className="english">{exercise.en}</p>
      {manage ? (
        <div className="reorder">
          <button
            disabled={index === 0}
            onClick={() => run(() => moveExercise(exercise.id, group, -1))}
            aria-label={`${exercise.zh}上移`}
          >
            <ArrowUp size={20} />
            上移
          </button>
          <button
            disabled={index === total - 1}
            onClick={() => run(() => moveExercise(exercise.id, group, 1))}
            aria-label={`${exercise.zh}下移`}
          >
            <ArrowDown size={20} />
            下移
          </button>
          <button
            onClick={() => run(() => toggleGroup(exercise.id, group))}
            aria-label={`移除${exercise.zh}`}
          >
            <X size={20} />
            移除
          </button>
        </div>
      ) : (
        <div className="weight-control">
          <button
            className="adjust"
            aria-label={`${exercise.zh}減少${step}公斤`}
            disabled={(exercise.weight ?? 0) < step}
            onClick={() =>
              run(() => changeWeight(exercise.id, { delta: -step }, session))
            }
          >
            <Minus size={24} />
          </button>
          <label className="weight-value">
            <span className="sr-only">{exercise.zh}重量</span>
            <input
              aria-label={`${exercise.zh}重量`}
              inputMode="decimal"
              type="text"
              value={draft}
              placeholder="—"
              aria-invalid={invalid}
              onFocus={() => setFocused(true)}
              onChange={(e) => input(e.target.value)}
              onBlur={() => {
                setFocused(false);
                setInvalid(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <span>kg</span>
          </label>
          <button
            className="adjust plus"
            aria-label={`${exercise.zh}增加${step}公斤`}
            disabled={(exercise.weight ?? 0) + step > 2000}
            onClick={() =>
              run(() => changeWeight(exercise.id, { delta: step }, session))
            }
          >
            <Plus size={24} />
          </button>
        </div>
      )}
      {invalid && (
        <p className="field-error">請輸入 0 至 2000，最多兩位小數。</p>
      )}
      {!manage && (
        <p className="card-note">
          {exercise.equipment === "Dumbbell"
            ? "啞鈴按單邊重量記錄"
            : exercise.equipment === "Bodyweight"
              ? "徒手記 0，負重則記額外重量"
              : "按器材顯示或總重量記錄"}
        </p>
      )}
    </article>
  );
}
function Editor({
  exercise,
  group,
  save,
}: {
  exercise?: Exercise;
  group: Group;
  save: (
    fields: Pick<Exercise, "zh" | "en" | "equipment" | "muscle" | "groups">,
  ) => void;
}) {
  const [groups, setGroups] = useState<Group[]>(exercise?.groups ?? [group]);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    save({
      zh: String(data.get("zh")).trim(),
      en: String(data.get("en")).trim(),
      equipment: data.get("equipment") as Equipment,
      muscle: data.get("muscle") as Exercise["muscle"],
      groups,
    });
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <label>
        中文名稱
        <input
          name="zh"
          required
          maxLength={80}
          defaultValue={exercise?.zh}
          placeholder="例如：單臂胸推"
          pattern=".*\S.*"
        />
      </label>
      <label>
        英文名稱
        <input
          name="en"
          required
          maxLength={120}
          defaultValue={exercise?.en}
          placeholder="Single-Arm Chest Press"
          pattern=".*\S.*"
        />
      </label>
      <div className="form-grid">
        <label>
          器材
          <select
            name="equipment"
            defaultValue={exercise?.equipment ?? "Machine"}
          >
            {Object.entries(EQUIPMENT).map(([key, label]) => (
              <option key={key} value={key}>
                {label} {key}
              </option>
            ))}
          </select>
        </label>
        <label>
          肌群
          <select name="muscle" defaultValue={exercise?.muscle ?? "胸"}>
            {MUSCLES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>加入清單</legend>
        <div className="chips">
          {GROUPS.map((g) => (
            <label className="check-chip" key={g}>
              <input
                type="checkbox"
                checked={groups.includes(g)}
                onChange={() =>
                  setGroups(
                    groups.includes(g)
                      ? groups.filter((x) => x !== g)
                      : [...groups, g],
                  )
                }
              />
              {g}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="primary wide">
        儲存動作
      </button>
    </form>
  );
}
function HistoryPanel({ exercise }: { exercise: Exercise }) {
  const records = useLiveQuery(
    () =>
      db.history.where("exerciseId").equals(exercise.id).reverse().sortBy("at"),
    [exercise.id],
  );
  return (
    <>
      <p className="muted mb-5">
        {exercise.zh} · {exercise.en}
      </p>
      {!records?.length ? (
        <div className="empty-small">未有重量變更紀錄</div>
      ) : (
        <ol className="history-list">
          {records.map((h) => (
            <li key={h.id}>
              <time>
                {new Date(h.at).toLocaleString("zh-HK", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
              <div>
                <span>{fmt(h.oldWeight)}</span>
                <ChevronRight size={16} />
                <strong>{h.newWeight} kg</strong>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="help">
        相隔 2 秒內的連續調整會合併；返回原重量不另留紀錄。
      </p>
    </>
  );
}
export default function App() {
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [group, setGroup] = useState<Group>("Push"),
    [view, setView] = useState<"list" | "library">("list"),
    [panel, setPanel] = useState<Panel>(null);
  const [search, setSearch] = useState(""),
    [equipment, setEquipment] = useState(""),
    [muscle, setMuscle] = useState(""),
    [manage, setManage] = useState(false),
    [filters, setFilters] = useState(false);
  const [online, setOnline] = useState(navigator.onLine),
    [busy, setBusy] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    initialize()
      .then(() => setReady(true))
      .catch(() =>
        setError("無法開啟本機資料庫，請確認瀏覽器容許儲存資料後重新整理。"),
      );
  }, []);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 3000);
    return () => clearTimeout(t);
  }, [message]);
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], []);
  const preferences = useLiveQuery(() => db.settings.get("preferences"));
  const step = preferences?.step ?? 2.5;
  async function perform(fn: () => Promise<unknown>) {
    setBusy((b) => b + 1);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗，請重試。");
    } finally {
      setBusy((b) => b - 1);
    }
  }
  const run = (fn: () => Promise<unknown>) => {
    void perform(fn);
  };
  const list = exercises
    .filter(
      (e) =>
        (view === "library" || e.groups.includes(group)) &&
        (!equipment || e.equipment === equipment) &&
        (!muscle || e.muscle === muscle) &&
        `${e.zh} ${e.en}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
    )
    .sort((a, b) =>
      view === "list"
        ? a.order[group] - b.order[group] || a.id.localeCompare(b.id)
        : a.zh.localeCompare(b.zh, "zh-Hant"),
    );
  const count = exercises.filter((e) => e.groups.includes(group)).length;
  function switchView(v: "list" | "library") {
    setView(v);
    setSearch("");
    setEquipment("");
    setMuscle("");
    setManage(false);
    window.scrollTo(0, 0);
  }
  async function download() {
    const data = await exportBackup();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `gym-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setMessage("備份已匯出");
  }
  async function readFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) throw new Error("備份上限為 10 MB。");
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      throw new Error("無法讀取 JSON 備份，原有資料未變更。");
    }
    const data = validateBackup(raw);
    setPanel({ type: "import", data });
  }
  const saveEditor = (
    fields: Pick<Exercise, "zh" | "en" | "equipment" | "muscle" | "groups">,
  ) =>
    run(async () => {
      if (!fields.zh || !fields.en) throw new Error("請填寫中英文名稱。");
      const editing = panel?.type === "editor" ? panel.exercise : undefined;
      if (editing) await db.exercises.update(editing.id, fields);
      else {
        const max = Math.max(
          0,
          ...exercises.flatMap((e) => Object.values(e.order)),
        );
        await db.exercises.add({
          ...fields,
          id: crypto.randomUUID(),
          custom: true,
          weight: null,
          order: { Push: max + 1, Pull: max + 1, Legs: max + 1 },
        });
      }
      setPanel(null);
      setMessage("動作已儲存");
    });
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">
            <Dumbbell size={23} />
          </span>
          <div>
            <p className="eyebrow">GYM / WEIGHT TRACKER</p>
            <h1>
              重量紀錄<span className="version">V1.0</span>
            </h1>
          </div>
        </div>
        <button
          className="icon-button"
          aria-label="設定與備份"
          onClick={() => setPanel({ type: "settings" })}
        >
          <SettingsIcon size={22} />
        </button>
      </header>
      <main>
        {error && (
          <div role="alert" className="error-banner">
            <span>{error}</span>
            <button aria-label="關閉錯誤" onClick={() => setError("")}>
              <X size={18} />
            </button>
          </div>
        )}
        {needRefresh && (
          <div className="update-banner">
            新版本已準備好
            <button
              disabled={busy > 0}
              onClick={() => void updateServiceWorker(true)}
            >
              更新 App
            </button>
          </div>
        )}
        <div className="intro">
          <div>
            <p className="eyebrow accent">
              {view === "list" ? "JUST YOUR WEIGHT." : "FIND YOUR MOVEMENT."}
            </p>
            <h2>{view === "list" ? "每次進步，簡單記下。" : "動作庫"}</h2>
          </div>
          <span className="save-state" role="status">
            {error ? (
              <span>請檢查錯誤提示</span>
            ) : !online ? (
              <>
                <WifiOff size={13} />
                離線
              </>
            ) : busy ? (
              <span>儲存中</span>
            ) : (
              <>
                <span className="status-dot" />
                {ready ? "已自動保存" : "載入中"}
              </>
            )}
          </span>
        </div>
        <div className="ppl-tabs" aria-label="PPL 分類">
          {GROUPS.map((g) => (
            <button
              aria-pressed={group === g}
              className={group === g ? "active" : ""}
              key={g}
              onClick={() => {
                setGroup(g);
                setManage(false);
              }}
            >
              <strong>{g}</strong>
              <span>{groupInfo[g][0]}</span>
            </button>
          ))}
        </div>
        <div className="search-row">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="搜尋動作"
              placeholder="搜尋中文或英文動作"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button aria-label="清除搜尋" onClick={() => setSearch("")}>
                <X size={16} />
              </button>
            )}
          </label>
          <button
            className={`filter-button ${filters || equipment || muscle ? "selected" : ""}`}
            aria-label="器材與肌群篩選"
            aria-expanded={filters}
            onClick={() => setFilters(!filters)}
          >
            <SlidersHorizontal size={20} />
          </button>
        </div>
        {filters && (
          <div className="filter-grid">
            <label>
              器材
              <select
                aria-label="篩選器材"
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
              >
                <option value="">所有器材</option>
                {Object.entries(EQUIPMENT).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label} · {key}
                  </option>
                ))}
              </select>
            </label>
            <label>
              肌群
              <select
                aria-label="篩選肌群"
                value={muscle}
                onChange={(e) => setMuscle(e.target.value)}
              >
                <option value="">所有肌群</option>
                {MUSCLES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="section-heading">
          <div>
            <h2>
              {view === "list"
                ? groupInfo[group][1]
                : `${exercises.length} 個動作`}
            </h2>
            <span>
              {view === "list"
                ? `${count} 個動作 · 步幅 ${step} kg`
                : `點選 + 加入 ${group}`}
            </span>
          </div>
          {view === "list" ? (
            <button
              className="text-button"
              onClick={() => {
                setManage(!manage);
                setSearch("");
                setEquipment("");
                setMuscle("");
              }}
            >
              {manage ? "返回重量" : "編排清單"}
            </button>
          ) : (
            <button
              className="text-button"
              onClick={() => setPanel({ type: "editor" })}
            >
              <Plus size={17} />
              自訂動作
            </button>
          )}
        </div>
        {ready && list.length === 0 && (
          <div className="empty">
            <Dumbbell size={36} />
            <h3>
              {search || equipment || muscle
                ? "找不到符合的動作"
                : "清單還未有動作"}
            </h3>
            <p>從動作庫挑選常用動作，隨時記下重量。</p>
            <button className="primary" onClick={() => switchView("library")}>
              瀏覽動作庫
            </button>
          </div>
        )}
        <div className={view === "list" ? "cards" : "library-list"}>
          {list.map((e, index) =>
            view === "list" ? (
              <WeightCard
                key={e.id}
                exercise={e}
                step={step}
                group={group}
                index={index}
                total={list.length}
                manage={manage}
                run={run}
                history={() => setPanel({ type: "history", exercise: e })}
              />
            ) : (
              <article className="library-card" key={e.id}>
                <div className="library-main">
                  <span className="tag">
                    {EQUIPMENT[e.equipment]} · {e.muscle}
                  </span>
                  <h3>{e.zh}</h3>
                  <p className="english">{e.en}</p>
                  {e.custom && (
                    <div className="custom-actions">
                      <button
                        onClick={() =>
                          setPanel({ type: "editor", exercise: e })
                        }
                      >
                        編輯
                      </button>
                      <button
                        aria-label={`刪除${e.zh}`}
                        onClick={() =>
                          setPanel({ type: "delete", exercise: e })
                        }
                      >
                        <Trash2 size={14} />
                        刪除
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className={`add-button ${e.groups.includes(group) ? "added" : ""}`}
                  aria-label={`${e.groups.includes(group) ? "移除" : "加入"}${e.zh}${group}`}
                  aria-pressed={e.groups.includes(group)}
                  onClick={() => run(() => toggleGroup(e.id, group))}
                >
                  {e.groups.includes(group) ? (
                    <Check size={22} />
                  ) : (
                    <Plus size={22} />
                  )}
                </button>
              </article>
            ),
          )}
        </div>
        {view === "list" && ready && list.length > 0 && (
          <button className="add-more" onClick={() => switchView("library")}>
            <Plus size={20} />
            加入動作至 {group}
          </button>
        )}
        <p className="footer-note">
          只記重量，專注眼前每一下。
          <br />
          <span>
            {offlineReady
              ? "已可離線使用 · 資料儲存於此裝置"
              : "資料儲存於此裝置 · 建議定期匯出備份"}
          </span>
        </p>
      </main>
      <nav className="bottom-nav" aria-label="主選單">
        <button
          className={view === "list" ? "active" : ""}
          onClick={() => switchView("list")}
        >
          <List size={23} />
          <span>我的清單</span>
        </button>
        <button
          className={view === "library" ? "active" : ""}
          onClick={() => switchView("library")}
        >
          <BookOpen size={23} />
          <span>動作庫</span>
        </button>
        <button
          className={panel?.type === "settings" ? "active" : ""}
          onClick={() => setPanel({ type: "settings" })}
        >
          <SettingsIcon size={23} />
          <span>設定</span>
        </button>
      </nav>
      {message && (
        <div className="toast" role="status">
          <Check size={16} />
          {message}
        </div>
      )}
      {panel && (
        <Modal
          title={
            {
              settings: "設定與備份",
              history: "重量歷史",
              editor:
                panel.type === "editor" && panel.exercise
                  ? "編輯動作"
                  : "新增自訂動作",
              import: "匯入備份",
              delete: "刪除自訂動作",
            }[panel.type]
          }
          close={() => setPanel(null)}
        >
          {error && (
            <div role="alert" className="error-banner">
              <span>{error}</span>
              <button aria-label="關閉錯誤" onClick={() => setError("")}>
                <X size={18} />
              </button>
            </div>
          )}
          {panel.type === "history" && (
            <HistoryPanel exercise={panel.exercise} />
          )}
          {panel.type === "editor" && (
            <Editor exercise={panel.exercise} group={group} save={saveEditor} />
          )}
          {panel.type === "settings" && (
            <div className="form-stack">
              <label>
                重量調整步幅（kg）
                <input
                  key={step}
                  aria-label="重量調整步幅"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="100"
                  step="0.01"
                  defaultValue={step}
                  onBlur={(e) => {
                    const value = parseWeight(e.target.value);
                    if (value !== null && value > 0 && value <= 100)
                      run(() =>
                        db.settings.put({ id: "preferences", step: value }),
                      );
                    else {
                      e.target.value = String(step);
                      setError("步幅須為 0.01 至 100 kg。");
                    }
                  }}
                />
              </label>
              <div className="chips">
                {[0.5, 1, 2.5, 5].map((n) => (
                  <button
                    key={n}
                    aria-pressed={step === n}
                    className={step === n ? "chip active" : "chip"}
                    onClick={() =>
                      run(() => db.settings.put({ id: "preferences", step: n }))
                    }
                  >
                    {n} kg
                  </button>
                ))}
              </div>
              <div className="divider" />
              <h3>資料備份</h3>
              <p className="help">
                資料只留在此瀏覽器及裝置，不會自動同步。清除網站資料會刪除紀錄，請定期備份。
              </p>
              <button
                className="outline wide"
                disabled={busy > 0 || !ready}
                onClick={() => run(download)}
              >
                <Download size={19} />
                匯出 JSON 備份
              </button>
              <button
                className="outline wide"
                disabled={busy > 0 || !ready}
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={19} />
                匯入 JSON 備份
              </button>
              <input
                ref={fileInput}
                className="hidden"
                type="file"
                accept=".json,application/json"
                aria-label="選擇備份檔案"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  run(() => readFile(file));
                }}
              />
              <div className="install-note">
                <h3>加入 iPhone 主畫面</h3>
                <p>
                  以 Safari
                  開啟，點「分享」→「加入主畫面」。首次連線開啟後，即可離線使用。
                </p>
              </div>
              <p className="help">
                啞鈴記單邊重量；徒手記額外負重。連續 2
                秒內的重量調整合併為一筆歷史。
              </p>
            </div>
          )}
          {panel.type === "import" && (
            <div className="form-stack">
              <p>
                備份包含 <strong>{panel.data.exercises.length}</strong> 個動作、
                <strong>{panel.data.history.length}</strong> 筆歷史。
              </p>
              <p className="warning">
                匯入將取代此裝置的全部動作、重量、歷史及步幅設定。建議先取消並匯出現有備份。
              </p>
              <button
                className="primary wide"
                disabled={busy > 0}
                onClick={() =>
                  run(async () => {
                    await importBackup(panel.data);
                    setPanel(null);
                    setMessage("備份已匯入");
                  })
                }
              >
                確認取代並匯入
              </button>
              <button className="outline wide" onClick={() => setPanel(null)}>
                取消
              </button>
            </div>
          )}
          {panel.type === "delete" && (
            <div className="form-stack">
              <p>刪除「{panel.exercise.zh}」及其全部重量歷史？</p>
              <button
                className="danger wide"
                disabled={busy > 0}
                onClick={() =>
                  run(async () => {
                    await deleteCustom(panel.exercise.id);
                    setPanel(null);
                    setMessage("動作已刪除");
                  })
                }
              >
                確認刪除
              </button>
              <button className="outline wide" onClick={() => setPanel(null)}>
                取消
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
