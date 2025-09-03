import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import EditorForm from "./components/EditorForm";
import EndUserForm from "./components/EndUserForm";
import {
  parseCodeToQuestions,
  generateCodeForLanguage,
  buildHtmlFromPayload,
  replacePayloadInPython,
  replacePayloadInVBScript,
  buildPayloadObject,
  normalizePayloadFormToQuestions,
} from "./utils/formHelpers";

/*
  App.jsx
  - left-side edits (HTML / Python / VB) update preview after debounce
  - robust brace-aware JSON extraction for Python/VB
  - question text edits in preview are stored in `editingDrafts` while typing
  - logic confirmation popup appears only on blur if the question had logic and text changed
  - console.log bodies that are sent to backend (save & submit)
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

  // state
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

  // For the blur-based logic popup flow:
  const [editingDrafts, setEditingDrafts] = useState({}); // { qIndex: draftText }
  const [pendingTextChange, setPendingTextChange] = useState(null); // { qIndex, newText }

  // refs & flags
  const programmaticChangeRef = useRef(false);
  const userEditingRef = useRef(false);
  const parseTimeoutRef = useRef(null);
  const viewSwitchRef = useRef(false);
  const codeCacheRef = useRef(codeCache);
  useEffect(() => { codeCacheRef.current = codeCache; }, [codeCache]);

  // helper to set codeCache + keep ref synced
  function setCodeCacheAndRef(next) {
    setCodeCache((prev) => {
      const computed = typeof next === "function" ? next(prev) : next;
      codeCacheRef.current = computed;
      return computed;
    });
  }

  // -------------------------
  // Robust JSON extractor (brace-aware, string-safe)
  // returns { jsonText, start, end } or null
  // -------------------------
  function extractJsonBlock(code, anchorRegex) {
    if (!code) return null;
    const anchor = anchorRegex.exec(code);
    if (!anchor) return null;
    const startSearchIdx = anchor.index + anchor[0].length;
    const firstBrace = code.indexOf("{", startSearchIdx);
    if (firstBrace === -1) return null;

    let i = firstBrace;
    let depth = 0;
    let inString = false;
    let stringChar = null;
    let escaped = false;

    for (; i < code.length; i++) {
      const ch = code[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === stringChar) {
          inString = false;
          stringChar = null;
        }
        continue;
      } else {
        if (ch === '"' || ch === "'") {
          inString = true;
          stringChar = ch;
          escaped = false;
          continue;
        } else if (ch === "{") {
          depth += 1;
        } else if (ch === "}") {
          depth -= 1;
          if (depth === 0) {
            const jsonText = code.slice(firstBrace, i + 1);
            return { jsonText, start: firstBrace, end: i + 1 };
          }
        }
      }
    }
    return null;
  }
  function extractJsonFromPython(code) { return extractJsonBlock(code, /payload\s*=/i); }
  function extractJsonFromVBScript(code) { return extractJsonBlock(code, /Set\s+payload\s*=/i); }

  // -------------------------
  // Init: parse initial HTML and set caches
  // -------------------------
  useEffect(() => {
    const initialQuestions = parseCodeToQuestions(initialHtml);
    setQuestions(initialQuestions);
    const htmlCode = buildHtmlFromPayload({
      form: initialQuestions.map((q) => ({ question: q.text, type: q.type, options: q.options, logic: q.logic, quota: q.quota })),
    });
    const pythonCode = generateCodeForLanguage("python", initialQuestions, htmlCode);
    const vbCode = generateCodeForLanguage("vbscript", initialQuestions, htmlCode);

    programmaticChangeRef.current = true;
    setCodeCacheAndRef({ html: htmlCode, python: pythonCode, vbscript: vbCode });
    setLeftText(htmlCode);
    setVisibleSet(new Set(initialQuestions.map((_, i) => i)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When switching view, show cached code and suppress immediate parse
  useEffect(() => {
    if (parseTimeoutRef.current) { clearTimeout(parseTimeoutRef.current); parseTimeoutRef.current = null; }
    viewSwitchRef.current = true;
    programmaticChangeRef.current = true;
    setErrorMsg("");
    setLeftText(codeCacheRef.current[viewLang] || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewLang]);

  // -------------------------
  // Left textarea change handler (user types)
  // -------------------------
  function handleTextareaChange(e) {
    const newVal = e.target.value;
    userEditingRef.current = true;
    setLeftText(newVal);
    setCodeCacheAndRef((prev) => ({ ...prev, [viewLang]: newVal })); // persist raw user edits
    setErrorMsg("");
  }

  // -------------------------
  // Debounced parsing: update preview when edits stabilize
  // -------------------------
  useEffect(() => {
    if (parseTimeoutRef.current) {
      clearTimeout(parseTimeoutRef.current);
      parseTimeoutRef.current = null;
    }

    if (viewSwitchRef.current) {
      viewSwitchRef.current = false;
      userEditingRef.current = false;
      programmaticChangeRef.current = false;
      setErrorMsg("");
      return;
    }

    if (programmaticChangeRef.current) {
      programmaticChangeRef.current = false;
      userEditingRef.current = false;
      return;
    }

    if (!userEditingRef.current) return;

    parseTimeoutRef.current = setTimeout(() => {
      parseTimeoutRef.current = null;

      let newQuestions = questions;
      let error = "";

      if (viewLang === "html") {
        try {
          newQuestions = parseCodeToQuestions(leftText);
        } catch (err) {
          error = "Invalid HTML. Please fix the form HTML.";
        }
      } else if (viewLang === "python") {
        const block = extractJsonFromPython(leftText);
        if (block && block.jsonText) {
          try {
            const payload = JSON.parse(block.jsonText);
            if (!payload || !Array.isArray(payload.form)) {
              error = "Python payload must contain a 'form' array.";
            } else {
              newQuestions = normalizePayloadFormToQuestions(payload.form);
            }
          } catch (err) {
            error = "Invalid JSON in Python payload. Please fix and try again.";
          }
        } else {
          error = "";
        }
      } else if (viewLang === "vbscript") {
        const block = extractJsonFromVBScript(leftText);
        if (block && block.jsonText) {
          try {
            const payload = JSON.parse(block.jsonText);
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

      if (!error && newQuestions) {
        // update preview state
        setQuestions(newQuestions);
        setVisibleSet(new Set(newQuestions.map((_, i) => i)));

        // canonicalize and update caches
        const payloadObj = buildPayloadObject(newQuestions);
        const htmlCode = buildHtmlFromPayload(payloadObj);
        const pythonCode = generateCodeForLanguage("python", newQuestions, htmlCode);
        const vbCode = generateCodeForLanguage("vbscript", newQuestions, htmlCode);

        programmaticChangeRef.current = true;

        // preserve scaffolding for current view by replacing only payload
        if (viewLang === "python") {
          const jsonStr = JSON.stringify(payloadObj, null, 2);
          const base = codeCacheRef.current.python || pythonCode;
          const updated = replacePayloadInPython(base, jsonStr);
          setCodeCacheAndRef({ html: htmlCode, python: updated, vbscript: vbCode });
          setLeftText(updated);
        } else if (viewLang === "vbscript") {
          const jsonStr = JSON.stringify(payloadObj, null, 2);
          const base = codeCacheRef.current.vbscript || vbCode;
          const updated = replacePayloadInVBScript(base, jsonStr);
          setCodeCacheAndRef({ html: htmlCode, python: pythonCode, vbscript: updated });
          setLeftText(updated);
        } else {
          setCodeCacheAndRef({ html: htmlCode, python: pythonCode, vbscript: vbCode });
          setLeftText(htmlCode);
        }
      }

      userEditingRef.current = false;
    }, 600);

    return () => {
      if (parseTimeoutRef.current) {
        clearTimeout(parseTimeoutRef.current);
        parseTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftText, viewLang]);

  // -------------------------
  // Sync preview (GUI) changes into code views
  // -------------------------
  function syncQuestionsToCodeCache(newQuestions) {
    setQuestions(newQuestions);
    const payloadObj = buildPayloadObject(newQuestions);
    const htmlCode = buildHtmlFromPayload(payloadObj);
    const pythonCode = generateCodeForLanguage("python", newQuestions, htmlCode);
    const vbCode = generateCodeForLanguage("vbscript", newQuestions, htmlCode);

    programmaticChangeRef.current = true;

    if (viewLang === "python") {
      const jsonStr = JSON.stringify(payloadObj, null, 2);
      const base = codeCacheRef.current.python || pythonCode;
      const updated = replacePayloadInPython(base, jsonStr);
      setCodeCacheAndRef({ html: htmlCode, python: updated, vbscript: vbCode });
      setLeftText(updated);
    } else if (viewLang === "vbscript") {
      const jsonStr = JSON.stringify(payloadObj, null, 2);
      const base = codeCacheRef.current.vbscript || vbCode;
      const updated = replacePayloadInVBScript(base, jsonStr);
      setCodeCacheAndRef({ html: htmlCode, python: pythonCode, vbscript: updated });
      setLeftText(updated);
    } else {
      setCodeCacheAndRef({ html: htmlCode, python: pythonCode, vbscript: vbCode });
      setLeftText(htmlCode);
    }

    setVisibleSet(new Set(newQuestions.map((_, i) => i)));
  }

  // -------------------------
  // Preview (editor) handlers
  // -------------------------
  // NOTE: question text typing ONLY updates editingDrafts — commit on blur
  // -------------------------
// Preview (editor) handlers
// -------------------------

  const handleQuestionTextChange = (qIndex, newText) => {
    setEditingDrafts((prev) => ({ ...prev, [qIndex]: newText }));
  };
  const handleQuestionTextBlur = (qIndex) => {
    const draft = editingDrafts[qIndex];
    const current = questions[qIndex]?.text || "";

    console.log("onBlur fired for Q", qIndex, { draft, current, logic: questions[qIndex]?.logic });

    if (draft === undefined || draft === current) {
      console.log("No change → skip");
      setEditingDrafts((prev) => {
        const c = { ...prev };
        delete c[qIndex];
        return c;
      });
      return;
    }

    // text changed:
    if (questions[qIndex]?.logic && questions[qIndex].logic.length > 0) {
      console.log("Has logic, showing popup for Q", qIndex);
      setPendingTextChange({ qIndex, newText: draft });
    } else {
      console.log("No logic → committing text directly");
      const newQuestions = questions.map((q, i) =>
        i === qIndex ? { ...q, text: draft } : q
      );
      syncQuestionsToCodeCache(newQuestions);
      setEditingDrafts((prev) => {
        const c = { ...prev };
        delete c[qIndex];
        return c;
      });
    }
  };


  const keepLogicAndClose = () => {
    if (!pendingTextChange) return;
    const { qIndex, newText } = pendingTextChange;
    const newQuestions = questions.map((q, i) =>
      i === qIndex ? { ...q, text: newText } : q
    );
    syncQuestionsToCodeCache(newQuestions);
    setEditingDrafts((prev) => {
      const c = { ...prev };
      delete c[qIndex];
      return c;
    });
    setPendingTextChange(null);
  };

  const clearLogicForQuestion = () => {
    if (!pendingTextChange) return;
    const { qIndex, newText } = pendingTextChange;
    const newQuestions = questions.map((q, i) =>
      i === qIndex ? { ...q, text: newText, logic: [] } : q
    );
    syncQuestionsToCodeCache(newQuestions);
    setEditingDrafts((prev) => {
      const c = { ...prev };
      delete c[qIndex];
      return c;
    });
    setPendingTextChange(null);
  };

  const cancelTextChangeAndRevert = () => {
    if (!pendingTextChange) return;
    const { qIndex } = pendingTextChange;
    setEditingDrafts((prev) => {
      const c = { ...prev };
      delete c[qIndex];
      return c;
    });
    setPendingTextChange(null);
  };

  const handleOptionTextChange = (qIndex, oi, newText) => {
    const newQuestions = questions.map((q, i) =>
      i === qIndex ? { ...q, options: q.options.map((opt, idx) => (idx === oi ? newText : opt)) } : q
    );
    syncQuestionsToCodeCache(newQuestions);
  };

  const handleAddOption = (qIndex) => {
    const newQuestions = questions.map((q, i) => (i === qIndex ? { ...q, options: [...q.options, `Option ${q.options.length + 1}`] } : q));
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
    const showQuestions = showQuestionsCsv.split(",").map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n >= 0);
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
    const appended = [...questions, { id: questions.length, text: "New question", type: "radio", options: ["Option 1"], logic: [], quota: null }];
    syncQuestionsToCodeCache(appended);
  };

  // -------------------------
  // Backend save + submit (console.log the bodies)
  // -------------------------
  async function handleSaveDefinition() {
    try {
      const payloadObj = buildPayloadObject(questions);
      const body = {
        title: "Untitled form",
        description: "",
        form: payloadObj.form,
        meta: {},
      };

      // console what we're about to send
      console.log("Saving form payload to /api/forms ->", body);

      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.statusText}`);
      const data = await res.json();
      alert("Form saved (id: " + (data._id || data.id || "unknown") + ")");
    } catch (err) {
      console.error(err);
      alert("Error saving form: " + (err.message || err));
    }
  }

  function evaluateQuotas(questionsLocal, responsesLocal) {
    const out = [];
    questionsLocal.forEach((q, qi) => {
      if (q.quota) {
        const { condition, value } = q.quota;
        let count = 0;
        const resp = responsesLocal[qi];
        if (Array.isArray(resp)) count = resp.length;
        else if (resp !== undefined && resp !== null && resp !== "") count = 1;
        else count = 0;
        let passed = false;
        if (condition === "=") passed = count === value;
        if (condition === "<") passed = count < value;
        if (condition === ">") passed = count > value;
        out.push({ questionIndex: qi, option: null, condition, value, passed });
      }
    });
    return out;
  }

  function buildAnswers(questionsLocal, responsesLocal) {
    return questionsLocal.map((q, qi) => {
      const resp = responsesLocal[qi];
      const answerArr = Array.isArray(resp) ? resp : (resp !== undefined && resp !== null ? [resp] : []);
      return {
        questionIndex: qi,
        questionText: q.text,
        answer: answerArr,
        value: null,
        meta: {},
      };
    }).filter(Boolean);
  }

  async function handleSubmitEndUserForm(e) {
    e.preventDefault();
    try {
      const answers = buildAnswers(questions, responses);
      const evaluatedQuotas = evaluateQuotas(questions, responses);
      const formSnapshot = buildPayloadObject(questions).form;

      const body = {
        formId: null,
        formSnapshot,
        answers,
        evaluatedQuotas,
        meta: {},
      };

      // console what we're sending
      console.log("Submitting form response to /api/forms/submit ->", body);

      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Submit failed: ${res.statusText}`);
      const data = await res.json();
      alert("Thanks — response submitted. id: " + (data._id || data.id || "unknown"));
      setEndUserMode(false);
      setResponses({});
      setVisibleSet(new Set(questions.map((_, i) => i)));
    } catch (err) {
      console.error(err);
      alert("Submit error: " + (err.message || err));
    }
  }

  // -------------------------
  // Preview end-user handlers
  // -------------------------
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

    const newVisibleSet = new Set();
    questions.forEach((q, qi) => newVisibleSet.add(qi));
    questions.forEach((q, qi) => {
      if (q.logic && q.logic.length > 0) {
        q.logic.forEach((rule) => {
          const isSelected = q.type === "checkbox"
            ? Array.isArray(responses[qi]) && responses[qi].includes(rule.option)
            : responses[qi] === rule.option;
          if (isSelected) rule.showQuestions.forEach((s) => newVisibleSet.add(s));
        });
      }
    });
    setVisibleSet(newVisibleSet);
  };

  // -------------------------
  // Render
  // -------------------------
  return (
    <div className="container">
      <div className="left">
        <h3>Form Code (editable)</h3>

        <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <label htmlFor="lang-select" style={{ fontSize: 13, color: "#475569" }}>Show as:</label>
          <select id="lang-select" value={viewLang} onChange={(e) => setViewLang(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
            <option value="html">HTML (raw)</option>
            <option value="python">Python</option>
            <option value="vbscript">VBScript</option>
          </select>
          <div className="lang-indicator" style={{ marginLeft: "auto", fontSize: 13, color: "#94a3b8" }}>Editable ({viewLang})</div>
        </div>

        <textarea className={`editor ${errorMsg ? "invalid" : ""}`} value={leftText} onChange={handleTextareaChange} spellCheck="false" />

        {errorMsg && <div className="error-banner">{errorMsg}</div>}
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
              editingDrafts={editingDrafts}
              onQuestionTextChange={handleQuestionTextChange}
              onQuestionTextBlur={handleQuestionTextBlur}
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
              <button type="button" onClick={() => setEndUserMode(false)}>Back to Editor</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
