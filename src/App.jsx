import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import EditorForm from "./components/EditorForm";
import EndUserForm from "./components/EndUserForm";
import {
  parseCodeToQuestions,
  generateCodeForLanguage,
  buildHtmlFromPayload,
  extractJsonFromPython,
  extractJsonFromVBScript,
  replacePayloadInPython,
  replacePayloadInVBScript,
  buildPayloadObject,
  normalizePayloadFormToQuestions,
} from "./utils/formHelpers";

/*
  App.jsx - main app wired so:
   - Switching languages does not produce flicker or premature JSON error.
   - Python/VB views allow editing ONLY the JSON payload block; edits to that payload
     update questions and regenerate all views.
   - Edits outside payload in Python/VB are ignored for form state and do not produce errors.
   - All files in src provided and consistent with internal question shape: { text, type, options, logic, quota }.
*/

export default function App() {
  const initialHtml = `<form>
  <div class="question">
    <p>What is your favorite color?</p>
    <label><input type="radio" name="q0" value="Red" /> Red</label>
    <label><input type="radio" name="q0" value="Blue" /> Blue</label>
    <label><input type="radio" name="q0" value="Green" /> Green</label>
  </div>
</form>`;

  // State
  const [questions, setQuestions] = useState([]);
  const [viewLang, setViewLang] = useState("html"); // html | python | vbscript
  const [codeCache, setCodeCache] = useState({ html: initialHtml, python: "", vbscript: "" });
  const [leftText, setLeftText] = useState(initialHtml);
  const [errorMsg, setErrorMsg] = useState("");

  const [endUserMode, setEndUserMode] = useState(false);
  const [responses, setResponses] = useState({});
  const [visibleSet, setVisibleSet] = useState(new Set());
  const [openLogicEditor, setOpenLogicEditor] = useState(null);
  const [openQuotaEditor, setOpenQuotaEditor] = useState(null);
  const [pendingTextChange, setPendingTextChange] = useState(null);

  // Refs for edit control
  const programmaticChangeRef = useRef(false);
  const userEditingRef = useRef(false);

  // Initial mount: parse HTML and generate code for all views
  useEffect(() => {
    const initialQuestions = parseCodeToQuestions(initialHtml);
    setQuestions(initialQuestions);
    const htmlCode = buildHtmlFromPayload({ form: initialQuestions.map(q => ({ question: q.text, type: q.type, options: q.options, logic: q.logic, quota: q.quota })) });
    const pythonCode = generateCodeForLanguage("python", initialQuestions, htmlCode);
    const vbCode = generateCodeForLanguage("vbscript", initialQuestions, htmlCode);

    // Set programmatically to avoid triggering "user edit" parsing logic
    programmaticChangeRef.current = true;
    setCodeCache({ html: htmlCode, python: pythonCode, vbscript: vbCode });
    setLeftText(htmlCode);
    setVisibleSet(new Set(initialQuestions.map((_, i) => i)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When changing viewLang we only update textarea programmatically (no parse)
  useEffect(() => {
    programmaticChangeRef.current = true;
    setErrorMsg("");
    setLeftText(codeCache[viewLang] || "");
  }, [viewLang, codeCache]);

  // Textarea change handler - mark as user edit
  function handleTextareaChange(e) {
    userEditingRef.current = true;
    setLeftText(e.target.value);
  }

  // Main parsing logic triggered when leftText changes.
  // We will skip parsing when changes were programmatic (i.e., coming from setLeftText in code).
  useEffect(() => {
    // If this change was programmatic, clear the flag and do nothing.
    if (programmaticChangeRef.current) {
      programmaticChangeRef.current = false;
      // reset userEditingRef so spurious programmatic sets don't cause parse next time
      userEditingRef.current = false;
      return;
    }

    // Only proceed to parse if user actually edited the textarea.
    if (!userEditingRef.current) {
      return;
    }

    let newQuestions = questions;
    let error = "";

    if (viewLang === "html") {
      // If user edited HTML, parse whole form into questions.
      try {
        const parsed = parseCodeToQuestions(leftText);
        newQuestions = parsed;
      } catch (err) {
        // Keep previous questions on parse error; show friendly message
        error = "Invalid HTML. Please fix the form HTML.";
      }
    } else if (viewLang === "python") {
      const jsonText = extractJsonFromPython(leftText);
      if (jsonText) {
        try {
          const payload = JSON.parse(jsonText);
          if (!payload || !Array.isArray(payload.form)) {
            error = "Python payload must contain a 'form' array.";
          } else {
            newQuestions = normalizePayloadFormToQuestions(payload.form);
          }
        } catch (err) {
          error = "Invalid JSON in Python payload. Please fix and try again.";
        }
      } else {
        // No payload block found — user may be editing other parts; ignore without error
        error = "";
      }
    } else if (viewLang === "vbscript") {
      const jsonText = extractJsonFromVBScript(leftText);
      if (jsonText) {
        try {
          const payload = JSON.parse(jsonText);
          if (!payload || !Array.isArray(payload.form)) {
            error = "VBScript payload must contain a 'form' array.";
          } else {
            newQuestions = normalizePayloadFormToQuestions(payload.form);
          }
        } catch (err) {
          error = "Invalid JSON in VBScript payload. Please fix and try again.";
        }
      } else {
        error = "";
      }
    }

    setErrorMsg(error);

    // Only update global state if parsing succeeded or HTML (which parsed into newQuestions)
    if (!error && newQuestions) {
      // Update internal questions
      setQuestions(newQuestions);
      setVisibleSet(new Set(newQuestions.map((_, i) => i)));

      // Build canonical HTML / code from newQuestions and update all code caches
      const payloadObj = buildPayloadObject(newQuestions);
      const htmlCode = buildHtmlFromPayload(payloadObj);
      const pythonCode = generateCodeForLanguage("python", newQuestions, htmlCode);
      const vbCode = generateCodeForLanguage("vbscript", newQuestions, htmlCode);

      // Update cache programmatically (so it doesn't trigger parse)
      programmaticChangeRef.current = true;
      setCodeCache({ html: htmlCode, python: pythonCode, vbscript: vbCode });

      // For Python/VB views: replace ONLY the payload in the user's code sample with pretty JSON
      if (viewLang === "python") {
        const jsonStr = JSON.stringify(payloadObj, null, 2);
        const updated = replacePayloadInPython(leftText, jsonStr);
        programmaticChangeRef.current = true;
        setLeftText(updated);
      } else if (viewLang === "vbscript") {
        const jsonStr = JSON.stringify(payloadObj, null, 2);
        const updated = replacePayloadInVBScript(leftText, jsonStr);
        programmaticChangeRef.current = true;
        setLeftText(updated);
      } else {
        // For HTML view, we update the left text to canonical HTML
        programmaticChangeRef.current = true;
        setLeftText(htmlCode);
      }
    }

    // reset user editing flag after handling
    userEditingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftText, viewLang]);

  // --- Utility that syncs GUI changes (buttons/inputs) to all code views ---
  function syncQuestionsToCodeCache(newQuestions) {
    setQuestions(newQuestions);
    const payloadObj = buildPayloadObject(newQuestions);
    const htmlCode = buildHtmlFromPayload(payloadObj);
    const pythonCode = generateCodeForLanguage("python", newQuestions, htmlCode);
    const vbCode = generateCodeForLanguage("vbscript", newQuestions, htmlCode);

    programmaticChangeRef.current = true;
    setCodeCache({ html: htmlCode, python: pythonCode, vbscript: vbCode });
    programmaticChangeRef.current = true;
    setLeftText(viewLang === "html" ? htmlCode : viewLang === "python" ? pythonCode : vbCode);
    setVisibleSet(new Set(newQuestions.map((_, i) => i)));
  }

  // --- Editor handlers (GUI) ---
  const handleQuestionTextChange = (qIndex, newText) => {
    if (questions[qIndex]?.logic?.length > 0) {
      setPendingTextChange({ qIndex, newText });
      return;
    }
    const newQuestions = questions.map((q, i) => (i === qIndex ? { ...q, text: newText } : q));
    syncQuestionsToCodeCache(newQuestions);
  };

  const keepLogicAndClose = () => {
    const { qIndex, newText } = pendingTextChange || {};
    if (qIndex === undefined) return setPendingTextChange(null);
    const newQuestions = questions.map((q, i) => (i === qIndex ? { ...q, text: newText } : q));
    syncQuestionsToCodeCache(newQuestions);
    setPendingTextChange(null);
  };

  const clearLogicForQuestion = () => {
    const { qIndex, newText } = pendingTextChange || {};
    if (qIndex === undefined) return setPendingTextChange(null);
    const newQuestions = questions.map((q, i) => (i === qIndex ? { ...q, text: newText, logic: [] } : q));
    syncQuestionsToCodeCache(newQuestions);
    setPendingTextChange(null);
  };

  const cancelTextChangeAndRevert = () => {
    setPendingTextChange(null);
  };

  const handleOptionTextChange = (qIndex, oi, newText) => {
    const newQuestions = questions.map((q, i) =>
      i === qIndex ? { ...q, options: q.options.map((opt, idx) => (idx === oi ? newText : opt)) } : q
    );
    syncQuestionsToCodeCache(newQuestions);
  };

  const handleAddOption = (qIndex) => {
    const newQuestions = questions.map((q, i) =>
      i === qIndex ? { ...q, options: [...q.options, `Option ${q.options.length + 1}`] } : q
    );
    syncQuestionsToCodeCache(newQuestions);
  };

  const handleRemoveOption = (qIndex, oi) => {
    const newQuestions = questions.map((q, i) => (i === qIndex ? { ...q, options: q.options.filter((_, idx) => idx !== oi) } : q));
    syncQuestionsToCodeCache(newQuestions);
  };

  const handleRemoveQuestion = (qIndex) => {
    const newQuestions = questions.filter((_, i) => i !== qIndex);
    syncQuestionsToCodeCache(newQuestions);
  };

  const handleToggleType = (qIndex, newType) => {
    const newQuestions = questions.map((q, i) => (i === qIndex ? { ...q, type: newType } : q));
    syncQuestionsToCodeCache(newQuestions);
  };

  const handleToggleLogicEditor = (qIndex, optionValue) => setOpenLogicEditor({ qIndex, optionValue });
  const handleToggleQuotaEditor = (qIndex) => setOpenQuotaEditor(qIndex);

  const saveLogicForOption = (qIndex, option, showQuestionsCsv) => {
    const showQuestions = showQuestionsCsv
      .split(",")
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0);
    const newQuestions = questions.map((q, i) => {
      if (i !== qIndex) return q;
      const newLogic = (q.logic || []).filter((r) => r.option !== option).concat({ option, showQuestions });
      return { ...q, logic: newLogic };
    });
    syncQuestionsToCodeCache(newQuestions);
    setOpenLogicEditor(null);
  };

  const removeLogicForOption = (qIndex, option) => {
    const newQuestions = questions.map((q, i) => (i !== qIndex ? q : { ...q, logic: (q.logic || []).filter((r) => r.option !== option) }));
    syncQuestionsToCodeCache(newQuestions);
    setOpenLogicEditor(null);
  };

  const saveQuotaForQuestion = (qIndex, quotaObj) => {
    const newQuestions = questions.map((q, i) => (i === qIndex ? { ...q, quota: quotaObj } : q));
    syncQuestionsToCodeCache(newQuestions);
    setOpenQuotaEditor(null);
  };

  const removeQuotaForQuestion = (qIndex) => {
    const newQuestions = questions.map((q, i) => (i === qIndex ? { ...q, quota: null } : q));
    syncQuestionsToCodeCache(newQuestions);
    setOpenQuotaEditor(null);
  };

  const handleAddQuestion = () => {
    const newQuestions = [
      ...questions,
      { id: questions.length, text: "New question", type: "radio", options: ["Option 1"], logic: [], quota: null },
    ];
    syncQuestionsToCodeCache(newQuestions);
  };

  const handleSaveDefinition = () => {
    alert("Form definition saved!");
  };

  const handlePreviewEndUserForm = () => {
    setEndUserMode(true);
    setVisibleSet(new Set(questions.map((_, i) => i)));
  };

  const handleEndUserChange = (qIndex, opt, checked) => {
    if (!questions[qIndex]) return;
    if (questions[qIndex].type === "checkbox") {
      const prev = Array.isArray(responses[qIndex]) ? responses[qIndex] : [];
      const next = checked ? [...prev, opt] : prev.filter((v) => v !== opt);
      setResponses({ ...responses, [qIndex]: next });
    } else {
      setResponses({ ...responses, [qIndex]: opt });
    }

    // Recompute visible set based on logic rules and latest responses
    const newVisibleSet = new Set();
    questions.forEach((q, qi) => newVisibleSet.add(qi));
    questions.forEach((q, qi) => {
      if (q.logic && q.logic.length > 0) {
        q.logic.forEach((rule) => {
          const isSelected =
            q.type === "checkbox" ? Array.isArray(responses[qi]) && responses[qi].includes(rule.option) : responses[qi] === rule.option;
          if (isSelected) {
            rule.showQuestions.forEach((s) => newVisibleSet.add(s));
          }
        });
      }
    });
    setVisibleSet(newVisibleSet);
  };

  const handleSubmitEndUserForm = (e) => {
    e.preventDefault();
    alert("Thank you for submitting the form!\n" + JSON.stringify(responses, null, 2));
    setEndUserMode(false);
    setResponses({});
    setVisibleSet(new Set(questions.map((_, i) => i)));
  };

  // Render
  return (
    <div className="container">
      <div className="left">
        <h3>Form Code (editable)</h3>
        <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <label htmlFor="lang-select" style={{ fontSize: 13, color: "#475569" }}>
            Show as:
          </label>
          <select id="lang-select" value={viewLang} onChange={(e) => setViewLang(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
            <option value="html">HTML (raw)</option>
            <option value="python">Python</option>
            <option value="vbscript">VBScript</option>
          </select>
          <div style={{ marginLeft: "auto", fontSize: 13, color: "#94a3b8" }}>Editable ({viewLang})</div>
        </div>

        <textarea className="editor" value={leftText} onChange={handleTextareaChange} readOnly={false} spellCheck="false" />

        {errorMsg && (
          <div style={{ color: "#ef4444", marginTop: 8 }}>
            {errorMsg}
          </div>
        )}
      </div>

      <div className="right">
        {pendingTextChange ? (
          <div className="modal-overlay">
            <div className="modal">
              <h4>Question text changed</h4>
              <p>You changed text for question #{pendingTextChange.qIndex + 1}. This question has logic rules attached.</p>
              <p>What do you want to do with the logic for this question?</p>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={keepLogicAndClose}>Keep logic & Apply text</button>
                <button onClick={clearLogicForQuestion} style={{ background: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,0.12)" }}>
                  Clear logic & Apply
                </button>
                <button onClick={cancelTextChangeAndRevert} style={{ marginLeft: "auto" }}>
                  Cancel (revert text)
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!endUserMode ? (
          <>
            <h3>Preview / Editor</h3>
            <EditorForm
              questions={questions}
              openLogicEditor={openLogicEditor}
              openQuotaEditor={openQuotaEditor}
              onQuestionTextChange={handleQuestionTextChange}
              onOptionTextChange={handleOptionTextChange}
              onAddOption={handleAddOption}
              onRemoveOption={handleRemoveOption}
              onRemoveQuestion={handleRemoveQuestion}
              onToggleType={handleToggleType}
              onToggleLogicEditor={handleToggleLogicEditor}
              onToggleQuotaEditor={handleToggleQuotaEditor}
              saveLogicForOption={saveLogicForOption}
              removeLogicForOption={removeLogicForOption}
              saveQuotaForQuestion={saveQuotaForQuestion}
              removeQuotaForQuestion={removeQuotaForQuestion}
              setOpenLogicEditor={setOpenLogicEditor}
              setOpenQuotaEditor={setOpenQuotaEditor}
              onAddQuestion={handleAddQuestion}
              onSaveDefinition={handleSaveDefinition}
              onPreviewEndUserForm={handlePreviewEndUserForm}
            />
          </>
        ) : (
          <>
            <h3>End-User Form</h3>
            <EndUserForm questions={questions} responses={responses} visibleSet={visibleSet} onEndUserChange={handleEndUserChange} onSubmit={handleSubmitEndUserForm} />
            <div style={{ marginTop: 16 }}>
              <button type="button" onClick={() => setEndUserMode(false)}>
                Back to Editor
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}