import React from "react";
import QuestionBlock from "./QuestionBlock";

export default function EndUserForm({
  questions,
  responses,
  visibleSet,
  onEndUserChange,
  onSubmit
}) {
  return (
    <form onSubmit={onSubmit}>
      {questions && questions.length > 0 ? (
        questions.map((q, qi) => {
          if (!visibleSet || visibleSet.has(qi)) {
            return (
              <QuestionBlock
                key={qi}
                question={q}
                qIndex={qi}
                mode="endUser"
                responses={responses}
                visibleSet={visibleSet}
                onEndUserChange={onEndUserChange}
              />
            );
          }
          return null;
        })
      ) : (
        <div>No questions available.</div>
      )}
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button type="submit">Submit Answers</button>
      </div>
    </form>
  );
}