import React from "react";
import QuestionBlock from "./QuestionBlock";

export default function EndUserForm({
  formId,
  questions,
  responses,
  visibleSet,
  onEndUserChange,
  onSubmit
}) {
  const handleSubmit = (e) => {
    e.preventDefault();

    // Prepare answers in backend-compatible schema
    const answers = questions
      .map((q, qi) => {
        if (!visibleSet || visibleSet.has(qi)) {
          const userAnswer = responses[qi] || {};
          return {
            questionIndex: qi,
            questionText: q.text || "",           // snapshot of question text
            answer: Array.isArray(userAnswer.answer)
              ? userAnswer.answer
              : userAnswer.answer
              ? [userAnswer.answer]
              : [],
            value: userAnswer.value || null,
            meta: userAnswer.meta || {}
          };
        }
        return null;
      })
      .filter(Boolean); // remove nulls for invisible questions

    const formResponse = {
      formId: formId || null,
      formSnapshot: questions.map((q) => ({ ...q })), // snapshot of full form
      answers,
      evaluatedQuotas: [], // can be filled later
      meta: {}
    };

    onSubmit(formResponse);
  };

  return (
    <form onSubmit={handleSubmit}>
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
