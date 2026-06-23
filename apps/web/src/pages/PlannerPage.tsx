import { useEffect, useMemo, useState } from "react";
import {
  createPlannerApiClient,
  type CraftingAction,
  type EffectiveInventoryResult,
  type InventoryDiffResult,
  type ManualInventoryOverrideRecord,
  type PlannerApiError,
  type PlayerCharacterState,
  type PlannerMaterial,
  type ResinPlanResult,
} from "../api/client.js";
import {
  buildDiffPayload,
  buildPlanPayload,
  furinaDefaults,
  type PlannerFormState,
} from "../planner/form.js";

type ResultState =
  | { mode: "empty" }
  | { mode: "plan"; data: ResinPlanResult }
  | { mode: "diff"; data: InventoryDiffResult };

export function PlannerPage() {
  const api = useMemo(() => createPlannerApiClient(), []);
  const [form, setForm] = useState<PlannerFormState>(furinaDefaults);
  const [result, setResult] = useState<ResultState>({ mode: "empty" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"plan" | "diff" | null>(null);
  const [health, setHealth] = useState<"checking" | "online" | "offline">("checking");
  const [loadedState, setLoadedState] = useState<PlayerCharacterState | null>(null);
  const [stateLoading, setStateLoading] = useState(false);

  useEffect(() => {
    api.health()
      .then(() => setHealth("online"))
      .catch(() => setHealth("offline"));
  }, [api]);

  async function loadCharacterState() {
    setStateLoading(true);
    setError(null);
    try {
      const state = await api.getCharacterState(form.playerKey, form.characterKey);
      setLoadedState(state);
      setForm((current) => ({
        ...current,
        currentLevel: state.level ?? current.currentLevel,
        currentAscensionPhase: state.ascension === undefined ? current.currentAscensionPhase : String(state.ascension),
        currentNormal: state.talents.normal ?? current.currentNormal,
        currentSkill: state.talents.skill ?? current.currentSkill,
        currentBurst: state.talents.burst ?? current.currentBurst,
      }));
    } catch (requestError) {
      setError(readableError(requestError));
      setLoadedState(null);
    } finally {
      setStateLoading(false);
    }
  }

  async function buildPlan() {
    setLoading("plan");
    setError(null);
    try {
      setResult({ mode: "plan", data: await api.getCharacterPlan(buildPlanPayload(form)) });
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setLoading(null);
    }
  }

  async function getDiffOnly() {
    setLoading("diff");
    setError(null);
    try {
      setResult({ mode: "diff", data: await api.getCharacterDiff(buildDiffPayload(form)) });
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="app-shell">
      <section className="planner-form" aria-label="Planner form">
        <div className="section-heading">
          <h1>Genshin-Agent Planner</h1>
          <p>Local deterministic planner prototype</p>
        </div>

        <BackendHealth status={health} />

        <FormFields form={form} onChange={setForm} />
        <PlayerStatePanel state={loadedState} loading={stateLoading} onLoad={loadCharacterState} />
        <ManualOverridesPanel api={api} playerKey={form.playerKey} />

        <div className="button-row">
          <button type="button" onClick={buildPlan} disabled={loading !== null}>
            {loading === "plan" ? "Building..." : "Build plan"}
          </button>
          <button type="button" className="secondary" onClick={getDiffOnly} disabled={loading !== null}>
            {loading === "diff" ? "Loading..." : "Get diff only"}
          </button>
          <button type="button" className="ghost" onClick={() => setForm(furinaDefaults)}>
            Reset to Furina example
          </button>
        </div>

        {error ? (
          <div role="alert" className="error-panel">
            {error}
          </div>
        ) : null}
      </section>

      <section className="planner-results" aria-label="Planner results">
        {result.mode === "empty" ? <EmptyState /> : <ResultView result={result} />}
      </section>
    </main>
  );
}

function FormFields({
  form,
  onChange,
}: {
  form: PlannerFormState;
  onChange: (next: PlannerFormState) => void;
}) {
  const update = <K extends keyof PlannerFormState>(key: K, value: PlannerFormState[K]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <form className="form-grid">
      <label>
        Player
        <input value={form.playerKey} onChange={(event) => update("playerKey", event.target.value)} />
      </label>
      <label>
        Character
        <input value={form.characterKey} onChange={(event) => update("characterKey", event.target.value)} />
      </label>
      <NumberField label="Current level" value={form.currentLevel} min={1} max={90} onChange={(value) => update("currentLevel", value)} />
      <label>
        Current ascension phase
        <input
          type="number"
          min={0}
          max={6}
          value={form.currentAscensionPhase}
          onChange={(event) => update("currentAscensionPhase", event.target.value)}
          placeholder="optional"
        />
      </label>
      <NumberField label="Target level" value={form.targetLevel} min={1} max={90} onChange={(value) => update("targetLevel", value)} />
      <label>
        Target ascension phase
        <input
          type="number"
          min={0}
          max={6}
          value={form.targetAscensionPhase}
          onChange={(event) => update("targetAscensionPhase", event.target.value)}
          placeholder="advanced optional"
        />
      </label>
      <NumberField label="Current normal" value={form.currentNormal} min={1} max={10} onChange={(value) => update("currentNormal", value)} />
      <NumberField label="Current skill" value={form.currentSkill} min={1} max={10} onChange={(value) => update("currentSkill", value)} />
      <NumberField label="Current burst" value={form.currentBurst} min={1} max={10} onChange={(value) => update("currentBurst", value)} />
      <NumberField label="Target normal" value={form.targetNormal} min={1} max={10} onChange={(value) => update("targetNormal", value)} />
      <NumberField label="Target skill" value={form.targetSkill} min={1} max={10} onChange={(value) => update("targetSkill", value)} />
      <NumberField label="Target burst" value={form.targetBurst} min={1} max={10} onChange={(value) => update("targetBurst", value)} />
      <NumberField label="Days" value={form.days} min={1} max={30} onChange={(value) => update("days", value)} />
      <NumberField
        label="Daily resin budget"
        value={form.dailyResinBudget}
        min={0}
        max={2000}
        onChange={(value) => update("dailyResinBudget", value)}
      />
      <label>
        Current resin
        <input
          type="number"
          min={0}
          max={2000}
          value={form.currentResin}
          onChange={(event) => update("currentResin", event.target.value)}
          placeholder="optional"
        />
      </label>
      <CheckboxField
        label="Use current resin on first day"
        checked={form.useCurrentResinOnFirstDay}
        onChange={(value) => update("useCurrentResinOnFirstDay", value)}
      />
      <NumberField
        label="Weekly discounts used"
        value={form.discountedWeeklyBossClaimsUsed}
        min={0}
        max={3}
        onChange={(value) => update("discountedWeeklyBossClaimsUsed", value)}
      />
      <CheckboxField label="Use player state" checked={form.usePlayerState} onChange={(value) => update("usePlayerState", value)} />
      <CheckboxField label="Use crafting" checked={form.useCrafting} onChange={(value) => update("useCrafting", value)} />
      <CheckboxField label="Allow Dust of Azoth" checked={form.allowDustOfAzoth} onChange={(value) => update("allowDustOfAzoth", value)} />
      <CheckboxField label="Allow Dream Solvent" checked={form.allowDreamSolvent} onChange={(value) => update("allowDreamSolvent", value)} />
      <CheckboxField
        label="Apply manual inventory overrides"
        checked={form.includeManualOverrides}
        onChange={(value) => update("includeManualOverrides", value)}
      />
      <section className="preference-panel">
        <h2>Plan preferences</h2>
        <label>
          Plan style
          <select value={form.planStyle} onChange={(event) => update("planStyle", event.target.value as PlannerFormState["planStyle"])}>
            <option value="resin_efficient">resin_efficient</option>
            <option value="fastest">fastest</option>
            <option value="low_effort">low_effort</option>
          </select>
        </label>
        <div className="day-checkboxes">
          {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => (
            <CheckboxField
              key={day}
              label={`Block ${day}`}
              checked={form.blockedDaysOfWeek.includes(day)}
              onChange={(checked) => update("blockedDaysOfWeek", toggleListValue(form.blockedDaysOfWeek, day, checked))}
            />
          ))}
        </div>
        <label>
          Blocked dates
          <input
            value={form.blockedDates}
            onChange={(event) => update("blockedDates", event.target.value)}
            placeholder="2026-06-25,2026-06-26"
          />
        </label>
        <CheckboxField label="Allow fragile resin" checked={form.allowFragileResin} onChange={(value) => update("allowFragileResin", value)} />
        <NumberField label="Max fragile resin" value={form.maxFragileResin} min={0} max={99} onChange={(value) => update("maxFragileResin", value)} />
        <label>
          Exclude source types
          <input value={form.excludedSourceTypes} onChange={(event) => update("excludedSourceTypes", event.target.value)} placeholder="event,shop" />
        </label>
        <label>
          Exclude materials
          <input value={form.excludedMaterials} onChange={(event) => update("excludedMaterials", event.target.value)} placeholder="mat_crown_of_insight" />
        </label>
      </section>
    </form>
  );
}

function toggleListValue(values: string[], value: string, enabled: boolean): string[] {
  return enabled ? [...new Set([...values, value])] : values.filter((item) => item !== value);
}

function BackendHealth({ status }: { status: "checking" | "online" | "offline" }) {
  return (
    <div className={`health-banner ${status}`}>
      <strong>Backend: {status}</strong>
      {status === "offline" ? <span>Backend is not running. Start it with npm run dev or set VITE_API_BASE_URL.</span> : null}
    </div>
  );
}

function PlayerStatePanel({
  state,
  loading,
  onLoad,
}: {
  state: PlayerCharacterState | null;
  loading: boolean;
  onLoad: () => void;
}) {
  return (
    <section className="state-panel">
      <div className="button-row">
        <button type="button" className="secondary" onClick={onLoad} disabled={loading}>
          {loading ? "Loading state..." : "Load character state"}
        </button>
      </div>
      {state ? (
        <div className="state-summary">
          <strong>{state.character.name ?? state.character.stableKey ?? state.character.key}</strong>
          <span>level source: {state.sources.level ?? "unknown"}</span>
          <span>ascension source: {state.sources.ascension ?? "unknown"}</span>
          <span>
            talent sources: normal {state.sources["talents.normal"] ?? "unknown"}, skill {state.sources["talents.skill"] ?? "unknown"}, burst{" "}
            {state.sources["talents.burst"] ?? "unknown"}
          </span>
          {state.equippedWeapon ? <span>weapon: {state.equippedWeapon.name ?? state.equippedWeapon.stableKey}</span> : null}
          <span>artifacts: {state.equippedArtifacts.length}</span>
          {state.conflicts.length > 0 ? <span className="warning-text">conflicts: {state.conflicts.map((conflict) => conflict.field).join(", ")}</span> : null}
          {state.warnings.map((warning) => (
            <span className="warning-text" key={warning}>
              {warning}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ManualOverridesPanel({
  api,
  playerKey,
}: {
  api: ReturnType<typeof createPlannerApiClient>;
  playerKey: string;
}) {
  const [materialKey, setMaterialKey] = useState("mat_heros_wit");
  const [mode, setMode] = useState<"absolute" | "delta">("absolute");
  const [quantity, setQuantity] = useState(40);
  const [reason, setReason] = useState("manual correction");
  const [overrides, setOverrides] = useState<ManualInventoryOverrideRecord[]>([]);
  const [effectiveInventory, setEffectiveInventory] = useState<EffectiveInventoryResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadOverrides() {
    setMessage(null);
    try {
      setOverrides(await api.listInventoryOverrides(playerKey));
    } catch (error) {
      setMessage(readableError(error));
    }
  }

  async function saveOverride() {
    setMessage(null);
    try {
      const saved = await api.upsertInventoryOverride(playerKey, materialKey, {
        mode,
        quantity,
        reason: reason.trim() || undefined,
      });
      setMessage(`Saved ${saved.material.name}`);
      await loadOverrides();
    } catch (error) {
      setMessage(readableError(error));
    }
  }

  async function deleteOverride() {
    setMessage(null);
    try {
      await api.deleteInventoryOverride(playerKey, materialKey);
      setMessage(`Deleted override for ${materialKey}`);
      await loadOverrides();
    } catch (error) {
      setMessage(readableError(error));
    }
  }

  async function loadEffectiveInventory() {
    setMessage(null);
    try {
      setEffectiveInventory(await api.getEffectiveInventory(playerKey));
    } catch (error) {
      setMessage(readableError(error));
    }
  }

  return (
    <section className="override-panel">
      <h2>Manual inventory overrides</h2>
      <div className="form-grid compact">
        <label>
          Material key
          <input value={materialKey} onChange={(event) => setMaterialKey(event.target.value)} />
        </label>
        <label>
          Mode
          <select value={mode} onChange={(event) => setMode(event.target.value as "absolute" | "delta")}>
            <option value="absolute">absolute</option>
            <option value="delta">delta</option>
          </select>
        </label>
        <NumberField label="Quantity" value={quantity} min={mode === "absolute" ? 0 : -9999} max={999999} onChange={setQuantity} />
        <label>
          Reason
          <input value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      </div>
      <div className="button-row">
        <button type="button" className="secondary" onClick={saveOverride}>
          Save override
        </button>
        <button type="button" className="ghost" onClick={deleteOverride}>
          Delete
        </button>
        <button type="button" className="ghost" onClick={loadOverrides}>
          List
        </button>
        <button type="button" className="ghost" onClick={loadEffectiveInventory}>
          Load effective inventory
        </button>
      </div>
      {message ? <p className="warning-text">{message}</p> : null}
      {overrides.length > 0 ? (
        <ul className="override-list">
          {overrides.map((override) => (
            <li key={override.id}>
              {override.material.name}: {override.mode} {override.quantity}; active={String(override.active)}
            </li>
          ))}
        </ul>
      ) : null}
      {effectiveInventory ? (
        <p className="muted">
          Effective inventory loaded: {effectiveInventory.items.length} items, overrides applied {effectiveInventory.overridesApplied}
        </p>
      ) : null}
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="checkbox-field">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ResultView({ result }: { result: Exclude<ResultState, { mode: "empty" }> }) {
  const diff = result.mode === "plan" ? result.data.inventoryDiff : result.data;
  const plan = result.mode === "plan" ? result.data : null;
  const missing = diff.materials.filter((material) => material.status === "missing");
  const satisfied = diff.materials.filter((material) => material.status === "satisfied");

  return (
    <div className="result-stack">
      <SummaryPanel diff={diff} plan={plan} />
      {plan ? <PreferencesPanel plan={plan} /> : null}
      <MaterialTable title="Missing materials" materials={missing} />
      {result.mode === "diff" ? <MaterialTable title="Satisfied materials" materials={satisfied} compact /> : null}
      <CraftingActions title="Crafting actions" actions={diff.craftingActions ?? []} />
      <CraftingActions title="Conversion actions" actions={diff.conversionActions ?? []} />
      {plan ? <ResinSchedule plan={plan} /> : null}
      {plan ? <TaskList title="Open-world tasks" tasks={plan.openWorldTasks} /> : null}
      {plan ? <TaskList title="Unknown/event tasks" tasks={plan.unknownTasks} /> : null}
      <Warnings warnings={plan?.warnings ?? diff.warnings} />
      <details className="raw-json">
        <summary>Raw JSON</summary>
        <pre>{JSON.stringify(result.data, null, 2)}</pre>
      </details>
    </div>
  );
}

function PreferencesPanel({ plan }: { plan: ResinPlanResult }) {
  const blockedDays = plan.schedule.filter((day) => day.blocked);

  return (
    <section className="result-panel">
      <h2>Preferences applied</h2>
      <div className="summary-grid">
        <Metric label="Plan style" value={String(plan.preferencesApplied?.planStyle ?? "resin_efficient")} />
        <Metric label="Blocked days" value={blockedDays.map((day) => `${day.date} ${day.dayOfWeek}`).join(", ") || "none"} />
        <Metric label="Fragile resin" value={`${plan.fragileResinUsed?.used ?? 0} used, ${plan.fragileResinUsed?.resinAdded ?? 0} resin`} />
        <Metric label="Excluded tasks" value={String(plan.excludedTasks?.length ?? 0)} />
      </div>
      {plan.excludedTasks && plan.excludedTasks.length > 0 ? (
        <ul className="warning-list">
          {plan.excludedTasks.map((task, index) => (
            <li key={`${task.groupKey ?? task.materialKey ?? task.sourceKey}-${index}`}>
              {task.groupKey ?? task.materialKey ?? task.sourceKey}: {task.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SummaryPanel({ diff, plan }: { diff: InventoryDiffResult; plan: ResinPlanResult | null }) {
  return (
    <section className="result-panel">
      <h2>Summary</h2>
      <div className="summary-grid">
        <Metric label="Character" value={`${diff.character.name} (${diff.character.stableKey})`} />
        <Metric label="Goal" value={`Level ${diff.goal.currentLevel}->${diff.goal.targetLevel}`} />
        <Metric label="Inventory snapshot" value={`#${diff.inventorySnapshot.id} ${diff.inventorySnapshot.source}`} />
        <Metric label="Missing materials" value={String(plan?.summary.totalMissingMaterials ?? diff.summary.missingMaterials)} />
        <Metric label="Scheduled resin" value={String(plan?.summary.scheduledEstimatedResin ?? "diff only")} />
        <Metric label="Warnings" value={String((plan?.warnings ?? diff.warnings).length)} />
        <Metric label="Overrides applied" value={String(diff.overridesApplied ?? 0)} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MaterialTable({ title, materials, compact = false }: { title: string; materials: PlannerMaterial[]; compact?: boolean }) {
  return (
    <section className="result-panel">
      <h2>{title}</h2>
      {materials.length === 0 ? (
        <p className="muted">None</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Required</th>
                <th>Owned</th>
                {!compact ? <th>Direct/effective</th> : null}
                <th>Missing</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((material) => (
                <tr key={material.stableKey}>
                  <td>{material.name}</td>
                  <td>{material.required}</td>
                  <td>{material.owned}</td>
                  {!compact ? <td>{formatDirectEffective(material)}</td> : null}
                  <td>{material.missing}</td>
                  <td>{material.sources?.join(", ") || "unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CraftingActions({ title, actions }: { title: string; actions: CraftingAction[] }) {
  return (
    <section className="result-panel">
      <h2>{title}</h2>
      {actions.length === 0 ? (
        <p className="muted">None</p>
      ) : (
        <div className="action-list">
          {actions.map((action) => (
            <article key={action.ruleId} className="action-item">
              <strong>
                {action.inputMaterialName} x{action.inputQuantity} {"->"} {action.outputMaterialName} x{action.outputQuantity}
              </strong>
              {action.catalystMaterialName ? (
                <span>
                  Catalyst: {action.catalystMaterialName} x{action.catalystQuantity}
                </span>
              ) : null}
              {action.warnings?.map((warning) => (
                <span className="warning-text" key={warning}>
                  {warning}
                </span>
              ))}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ResinSchedule({ plan }: { plan: ResinPlanResult }) {
  return (
    <section className="result-panel">
      <h2>Daily resin schedule</h2>
      <div className="schedule-list">
        {plan.schedule.map((day) => (
          <article key={day.date} className="day-card">
            <header>
              <strong>
                {day.date} {day.dayOfWeek}
              </strong>
              <span>
                {day.plannedResin}/{day.resinBudget} resin
              </span>
            </header>
            {day.tasks.length === 0 ? (
              <p className="muted">No resin tasks</p>
            ) : (
              day.tasks.map((task, index) => (
                <div className="task-row" key={`${task.materialKey}-${index}`}>
                  <strong>{task.sourceName ?? task.materialName}</strong>
                  <span>
                    {task.sourceType} | runs {task.runs ?? "unknown"} | resin {task.resin ?? "unknown"}
                  </span>
                  <small>{task.materials?.map((material) => `${material.materialName} ${material.missing}`).join(", ")}</small>
                  {task.warnings.map((warning) => (
                    <small className="warning-text" key={warning}>
                      {warning}
                    </small>
                  ))}
                </div>
              ))
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function TaskList({ title, tasks }: { title: string; tasks: ResinPlanResult["openWorldTasks"] }) {
  return (
    <section className="result-panel">
      <h2>{title}</h2>
      {tasks.length === 0 ? (
        <p className="muted">None</p>
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <article key={`${task.materialKey}-${task.sourceType}`}>
              <strong>{task.materialName}</strong>
              <span>
                {task.sourceName ?? task.sourceType} | missing {task.missing}
              </span>
              {task.warnings.map((warning) => (
                <small className="warning-text" key={warning}>
                  {warning}
                </small>
              ))}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  return (
    <section className="result-panel">
      <h2>Warnings</h2>
      {warnings.length === 0 ? (
        <p className="muted">None</p>
      ) : (
        <ul className="warning-list">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <h2>Build a plan to inspect progression gaps</h2>
      <p>Use the Furina defaults or enter another normalized character key.</p>
    </div>
  );
}

function formatDirectEffective(material: PlannerMaterial): string {
  if (material.directOwned === undefined && material.effectiveOwned === undefined) {
    return "-";
  }

  return `${material.directOwned ?? material.owned}/${material.effectiveOwned ?? material.owned}`;
}

function readableError(error: unknown): string {
  const apiError = error as PlannerApiError;
  if (apiError?.name === "PlannerApiError") {
    return [apiError.code, apiError.message].filter(Boolean).join(": ");
  }

  return error instanceof Error ? error.message : String(error);
}
