import React, { useEffect, useState } from "react";

export default function QuestionLogicEditor({ questions, qIndex, initialOption, onSave, onRemove, onCancel }) {
  const opts = (questions[qIndex] && Array.isArray(questions[qIndex].options)) ? questions[qIndex].options : [];
  const [selectedOption, setSelectedOption] = useState(initialOption || (opts[0] || ""));
  const [csv, setCsv] = useState("");
  useEffect(() => {
    setSelectedOption(initialOption || (opts[0] || ""));
    const rule = (questions[qIndex] && Array.isArray(questions[qIndex].logic)) ? questions[qIndex].logic.find(r => r.option === (initialOption || opts[0])) : null;
    if (rule && Array.isArray(rule.showQuestions)) setCsv(rule.showQuestions.map(n => Number(n) + 1).join(","));
    else setCsv("");
  }, [initialOption, qIndex, questions]);

  useEffect(() => {
    const rule = (questions[qIndex] && Array.isArray(questions[qIndex].logic)) ? questions[qIndex].logic.find(r => r.option === selectedOption) : null;
    if (rule && Array.isArray(rule.showQuestions)) setCsv(rule.showQuestions.map(n => Number(n) + 1).join(","));
    else setCsv("");
  }, [selectedOption]);

  const handleSave = () => onSave(qIndex, selectedOption, csv);
  const handleRemove = () => onRemove(qIndex, selectedOption);

  return (
    <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: "1px solid #e6edf3", background: "#f9fafb" }}>
      <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Logic for Question #{qIndex + 1}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: "#334155" }}>Option:</label>
        <select value={selectedOption} onChange={(e) => setSelectedOption(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6,color:"#14453f" }}>
          {opts.map((o, i) => <option key={i} value={o} style={{color:'black'}}>{o}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: "#334155", marginBottom: 6 }}>Show questions (1-based, comma-separated):</div>
        <input value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="e.g. 2,4" style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0" ,color:"black"}} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={handleSave}>Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={handleRemove} style={{ marginLeft: "auto", background: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,0.12)" }}>Remove Rule</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
        Tip: question numbers are 1-based. A question cannot show itself; such references will be ignored.
      </div>
    </div>
  );
}