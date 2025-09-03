import React from "react";
import QuestionBlock from "./QuestionBlock";

export default function EditorForm({
  questions,
  openLogicEditor,
  openQuotaEditor,
  onQuestionTextChange,
  onOptionTextChange,
  onAddOption,
  onRemoveOption,
  onRemoveQuestion,
  onToggleType,
  onToggleLogicEditor,
  onToggleQuotaEditor,
  saveLogicForOption,
  removeLogicForOption,
  saveQuotaForQuestion,
  removeQuotaForQuestion,
  setOpenLogicEditor,
  setOpenQuotaEditor,
  onAddQuestion,
  onSaveDefinition,
  onPreviewEndUserForm
}) {
  return (
    <form>
      {questions && questions.length > 0 ? (
        questions.map((q, qi) => (
          <QuestionBlock
            key={qi}
            question={q}
            qIndex={qi}
            mode="editor"
            openLogicEditor={openLogicEditor}
            openQuotaEditor={openQuotaEditor}
            onQuestionTextChange={onQuestionTextChange}
            onOptionTextChange={onOptionTextChange}
            onAddOption={onAddOption}
            onRemoveOption={onRemoveOption}
            onRemoveQuestion={onRemoveQuestion}
            onToggleType={onToggleType}
            onToggleLogicEditor={onToggleLogicEditor}
            onToggleQuotaEditor={onToggleQuotaEditor}
            saveLogicForOption={saveLogicForOption}
            removeLogicForOption={removeLogicForOption}
            saveQuotaForQuestion={saveQuotaForQuestion}
            removeQuotaForQuestion={removeQuotaForQuestion}
            setOpenLogicEditor={setOpenLogicEditor}
            setOpenQuotaEditor={setOpenQuotaEditor}
          />
        ))
      ) : (
        <div>No questions found in form definition.</div>
      )}
      <div className="form-actions" style={{ marginTop: 16 }}>
        <button type="button" onClick={onAddQuestion}>+ Add Question</button>
        <button type="button" onClick={onSaveDefinition} style={{ marginLeft: 8 }}>
          Save Definition
        </button>
        <button type="button" onClick={onPreviewEndUserForm} style={{ marginLeft: 8 }}>
          Preview End-User Form
        </button>
      </div>
    </form>
  );
}