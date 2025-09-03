import React, { useEffect, useState } from "react";

export default function QuestionQuotaEditor({ questions, qIndex, initialQuota, onSave, onRemove, onCancel }) {
  const [condition, setCondition] = useState(initialQuota ? initialQuota.condition : "=");
  const [value, setValue] = useState(initialQuota && typeof initialQuota.value === "number" ? initialQuota.value : "");
  const [meetRequirement, setMeetRequirement] = useState(initialQuota ? !!initialQuota.meetRequirement : false);

  useEffect(() => {
    setCondition(initialQuota ? initialQuota.condition : "=");
    setValue(initialQuota && typeof initialQuota.value === "number" ? initialQuota.value : "");
    setMeetRequirement(initialQuota ? !!initialQuota.meetRequirement : false);
  }, [initialQuota]);

  const handleSave = () => {
    const qObj = { condition: condition, value: value === "" ? null : Number(value), meetRequirement: !!meetRequirement };
    onSave(qIndex, qObj);
  };

  const handleRemove = () => onRemove(qIndex);

  return (
    <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: "1px solid #e6edf3", background: "#ffffff" }}>
      <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Quota for Question #{qIndex + 1}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: "#334155" }}>Condition:</label>
        <select value={condition} onChange={(e) => setCondition(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6 }}>
          <option value="=">=</option>
          <option value="<">&lt;</option>
          <option value=">">&gt;</option>
        </select>
        <input
          type="number"
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
          style={{ padding: "6px 8px", borderRadius: 6, width: 120 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={meetRequirement} onChange={(e) => setMeetRequirement(e.target.checked)} />
          <span style={{ fontSize: 13 }}>Must meet</span>
        </label>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={handleSave}>Save Quota</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={handleRemove} style={{ marginLeft: "auto", background: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,0.12)" }}>Remove Quota</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
        Quota is for editor/searching/automation. It does not by itself hide/show questions unless you add runtime logic that checks it.
      </div>
    </div>
  );
}