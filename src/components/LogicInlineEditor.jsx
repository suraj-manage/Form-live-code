    import React, { useState } from 'react';

export default function LogicInlineEditor({
  questions,
  qIndex,
  optionValue,
  initialRules,
  onSave,
  onCancel,
  onRemove,
}) {
  const [csv, setCsv] = useState(
    (initialRules?.showQuestions || [])
      .map(n => Number(n) + 1)
      .join(",")
  );

  return (
    <div className="logic-inline">
      <div className="small">
        Logic for option <strong>"{optionValue}"</strong> (enter question numbers to SHOW, comma-separated, 1-based):
      </div>
      <input
        type="text"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder="e.g. 2,4"
      />
      <div className="q-actions">
        <button type="button" onClick={() => onSave(qIndex, optionValue, csv)}>Save</button>
        <button type="button" onClick={onCancel} className="secondary">Cancel</button>
        <button type="button" onClick={() => onRemove(qIndex, optionValue)} className="remove-option-btn">
          Remove Rule
        </button>
      </div>
      <div className="kicker">
        Note: question numbers are 1-based. A question cannot show itself; such references will be ignored.
      </div>
    </div>
  );
}