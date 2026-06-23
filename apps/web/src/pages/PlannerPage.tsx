import { useMemo, useState } from "react";
import {
  createPlannerApiClient,
  type CraftingAction,
  type InventoryDiffResult,
  type PlannerApiError,
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

        <FormFields form={form} onChange={setForm} />

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
      <NumberField label="Target level" value={form.targetLevel} min={1} max={90} onChange={(value) => update("targetLevel", value)} />
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
    </form>
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
