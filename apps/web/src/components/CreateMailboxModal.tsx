import { Check, Clock3, Dice5, Loader2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { LIFETIME_OPTIONS } from "@relaybox/shared";
import { Modal } from "./Modal";

interface Props { domain: string; defaultLifetime: number | null; onClose(): void; onCreate(alias: string | undefined, lifetime: number | null): Promise<void> }

export function CreateMailboxModal({ domain, defaultLifetime, onClose, onCreate }: Props) {
  const [mode, setMode] = useState<"random" | "custom">("random");
  const [alias, setAlias] = useState("");
  const [lifetime, setLifetime] = useState<number | "custom" | null>(defaultLifetime);
  const [customValue, setCustomValue] = useState(2);
  const [customUnit, setCustomUnit] = useState<"minutes" | "hours" | "days" | "years">("hours");
  const [busy, setBusy] = useState(false);
  const safeAlias = alias.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 63);
  const actualLifetime = useMemo(() => lifetime === "custom" ? customValue * ({ minutes: 60, hours: 3600, days: 86400, years: 31536000 }[customUnit]) : lifetime, [lifetime, customValue, customUnit]);
  const changeCustomUnit = (unit: typeof customUnit) => {
    const minimum = unit === "minutes" ? 5 : 1;
    const maximum = unit === "years" ? 100 : unit === "days" ? 36500 : unit === "hours" ? 876000 : 52560000;
    setCustomUnit(unit);
    setCustomValue((current) => Math.min(maximum, Math.max(minimum, current)));
  };
  const submit = async () => {
    setBusy(true);
    try { await onCreate(mode === "custom" ? safeAlias : undefined, actualLifetime); }
    finally { setBusy(false); }
  };
  return <Modal title="Create a private mailbox" subtitle="A fresh address, protected by a token stored only in this browser." onClose={onClose} className="create-modal">
    <div className="modal-content">
      <div className="segmented"><button className={mode === "random" ? "active" : ""} onClick={() => setMode("random")}><Dice5 /> Random address</button><button className={mode === "custom" ? "active" : ""} onClick={() => setMode("custom")}><Check /> Custom alias</button></div>
      <label className="field"><span>Email address</span><div className="address-input">
        {mode === "random" ? <span className="random-placeholder">A memorable alias will be generated</span> : <input autoFocus value={safeAlias} onChange={(event) => setAlias(event.target.value)} placeholder="your-alias" />}
        <b>@{domain}</b>
      </div></label>
      <fieldset className="lifetime-grid"><legend><Clock3 /> Mailbox lifetime</legend>
        {LIFETIME_OPTIONS.map((option) => <button key={String(option.value)} className={lifetime === option.value ? "active" : ""} onClick={() => setLifetime(option.value)}>{option.label}{lifetime === option.value && <Check />}</button>)}
        <button className={lifetime === "custom" ? "active" : ""} onClick={() => setLifetime("custom")}>Custom{lifetime === "custom" && <Check />}</button>
      </fieldset>
      {lifetime === "custom" && <div className="custom-duration"><input type="number" min={customUnit === "minutes" ? 5 : 1} max={customUnit === "years" ? 100 : customUnit === "days" ? 36500 : customUnit === "hours" ? 876000 : 52560000} value={customValue} onChange={(event) => setCustomValue(Math.max(customUnit === "minutes" ? 5 : 1, Number(event.target.value)))} /><select value={customUnit} onChange={(event) => changeCustomUnit(event.target.value as typeof customUnit)}><option>minutes</option><option>hours</option><option>days</option><option>years</option></select></div>}
      <div className="privacy-callout"><ShieldCheck /><p><strong>Unlisted and private</strong><span>Knowing the address alone never grants inbox access.</span></p></div>
    </div>
    <footer className="modal-actions"><button className="text-button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || (mode === "custom" && safeAlias.length < 2)} onClick={submit}>{busy ? <Loader2 className="spin" /> : <ShieldCheck />} Create mailbox</button></footer>
  </Modal>;
}
