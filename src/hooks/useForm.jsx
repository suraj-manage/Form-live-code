import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  parseCodeToQuestions,
  formFromDocToCode,
  normalizeNames,
  mergeParsedWithExisting,
  buildPayloadObject,
  generateCodeForLanguage,
  tolerantJsonCleanup,
  tryParsePayloadFromText,
  buildHtmlFromPayload,
  escapeHtml,
} from '../formUtils';

export default function useForm() {
  const initialCode = `<form>
  <div class="question">
    <p>What is your favorite color?</p>
    <label><input type="radio" name="q0" value="Red" /> Red</label>
    <label><input type="radio" name="q0" value="Blue" /> Blue</label>
    <label><input type="radio" name="q0" value="Green" /> Green</label>
  </div>
</form>`;

  const [code, setCode] = useState(initialCode);
  const [questions, setQuestions] = useState([]);
  const parseTimer = useRef(null);
  const [viewLang, setViewLang] = useState("html");
  const [leftText, setLeftText] = useState(initialCode);
  const programmaticLeftUpdate = useRef(false);
  const leftTextareaRef = useRef(null);
  const [endUserMode, setEndUserMode] = useState(false);
  const [visibleSet, setVisibleSet] = useState(new Set());
  const [responses, setResponses] = useState({});
  const [pendingTextChange, setPendingTextChange] = useState(null);
  const [openLogicEditor, setOpenLogicEditor] = useState(null);

  const reparseHtml = useCallback(() => {
    const doc = new DOMParser().parseFromString(code, "text/html");
    normalizeNames(doc);
    const updatedCode = formFromDocToCode(doc);
    const parsedQuestions = parseCodeToQuestions(updatedCode);
    setQuestions((prevQuestions) => mergeParsedWithExisting(prevQuestions, parsedQuestions));
    setCode(updatedCode);
  }, [code]);

  const onLeftChange = useCallback((e) => {
    const newText = e.target.value;
    setLeftText(newText);
    clearTimeout(parseTimer.current);
    parseTimer.current = setTimeout(() => {
      if (viewLang === "html") {
        setCode(newText);
      } else {
        const payloadObj = tryParsePayloadFromText(newText, viewLang);
        if (payloadObj) {
          const newQuestions = payloadObj.form.map((q, i) => ({
            id: i,
            text: q.question,
            type: q.type,
            options: q.options,
            logic: q.logic,
          }));
          const htmlCode = buildHtmlFromPayload(payloadObj);
          setCode(htmlCode);
          setQuestions(newQuestions);
        }
      }
    }, 500);
  }, [viewLang]);

  const onLeftBlur = useCallback(() => {
    clearTimeout(parseTimer.current);
    if (viewLang === "html") {
      setCode(leftText);
    }
  }, [leftText, viewLang]);

  const startEndUserForm = useCallback(() => {
    setEndUserMode(true);
    const initialVisible = new Set(questions.filter(q => q.logic.length === 0).map(q => q.id));
    setVisibleSet(initialVisible);
  }, [questions]);

  const handleSubmitEndUserForm = useCallback(() => {
    setEndUserMode(false);
    console.log("Form responses:", responses);
    // TODO: Submit to a real backend
  }, [responses]);

  const handlePreviewQuestionTextChange = useCallback((qIndex, newText) => {
    setQuestions((prevQuestions) => {
      const q = prevQuestions[qIndex];
      const hasLogic = q.logic && q.logic.length > 0;
      if (hasLogic) {
        setPendingTextChange({ qIndex, newText, oldText: q.text });
        return prevQuestions;
      }
      const newQuestions = [...prevQuestions];
      newQuestions[qIndex] = { ...newQuestions[qIndex], text: newText };
      return newQuestions;
    });
  }, []);

  const handleToggleType = useCallback((qIndex) => {
    setQuestions((prev) => {
      const newQuestions = [...prev];
      const newType = newQuestions[qIndex].type === "radio" ? "checkbox" : "radio";
      newQuestions[qIndex] = { ...newQuestions[qIndex], type: newType };
      return newQuestions;
    });
  }, []);

  const handleRemoveQuestion = useCallback((qIndex) => {
    setQuestions((prev) => prev.filter((_, i) => i !== qIndex));
  }, []);

  const handleAddQuestion = useCallback(() => {
    setQuestions((prev) => [...prev, {
      id: prev.length,
      type: "radio",
      text: "New Question",
      options: ["Option 1"],
      logic: [],
    }]);
  }, []);

  const handleAddOption = useCallback((qIndex) => {
    setQuestions((prev) => {
      const newQuestions = [...prev];
      newQuestions[qIndex].options.push(`New Option`);
      return newQuestions;
    });
  }, []);

  const handleRemoveOption = useCallback((qIndex, oIndex) => {
    setQuestions((prev) => {
      const newQuestions = [...prev];
      const newOptions = newQuestions[qIndex].options.filter((_, i) => i !== oIndex);
      const optionToRemove = newQuestions[qIndex].options[oIndex];

      // Remove logic rules that depend on the removed option
      const newLogic = newQuestions[qIndex].logic.filter(
        (rule) => rule.option !== optionToRemove
      );

      newQuestions[qIndex] = { ...newQuestions[qIndex], options: newOptions, logic: newLogic };
      return newQuestions;
    });
  }, []);

  const handlePreviewOptionTextChange = useCallback((qIndex, oIndex, newText) => {
    setQuestions((prev) => {
      const newQuestions = [...prev];
      const oldOptionText = newQuestions[qIndex].options[oIndex];
      newQuestions[qIndex].options[oIndex] = newText;
      
      const logicRule = newQuestions[qIndex].logic.find(r => r.option === oldOptionText);
      if (logicRule) {
          logicRule.option = newText;
      }

      return newQuestions;
    });
  }, []);

  const toggleLogicEditor = useCallback((qIndex, option) => {
    setOpenLogicEditor(openLogicEditor?.qIndex === qIndex && openLogicEditor?.option === option ? null : { qIndex, option });
  }, [openLogicEditor]);

  const saveLogicForOption = useCallback((qIndex, option, csv) => {
    const showQuestions = csv.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(n => !isNaN(n) && n >= 0);
    setQuestions((prev) => {
      const newQuestions = [...prev];
      const question = newQuestions[qIndex];
      const logicRules = question.logic.filter(r => r.option !== option);
      if (showQuestions.length > 0) {
        logicRules.push({ option, showQuestions });
      }
      newQuestions[qIndex] = { ...question, logic: logicRules };
      return newQuestions;
    });
    setOpenLogicEditor(null);
  }, []);

  const removeLogicForOption = useCallback((qIndex, option) => {
    setQuestions((prev) => {
      const newQuestions = [...prev];
      const question = newQuestions[qIndex];
      const newLogic = question.logic.filter(r => r.option !== option);
      newQuestions[qIndex] = { ...question, logic: newLogic };
      return newQuestions;
    });
    setOpenLogicEditor(null);
  }, []);

  const handleEndUserChange = useCallback((qIndex, value) => {
    setResponses((prev) => {
      const newResponses = { ...prev };
      if (questions[qIndex].type === "checkbox") {
        const current = newResponses[qIndex] || [];
        if (current.includes(value)) {
          newResponses[qIndex] = current.filter(v => v !== value);
        } else {
          newResponses[qIndex] = [...current, value];
        }
      } else {
        newResponses[qIndex] = value;
      }
      return newResponses;
    });
    const currentQuestion = questions[qIndex];
    if (currentQuestion) {
      const logicRule = currentQuestion.logic.find((rule) => rule.option === value);
      const showQuestions = logicRule ? new Set(logicRule.showQuestions) : new Set();
      setVisibleSet(showQuestions);
    }
  }, [questions]);

  const keepLogicAndClose = useCallback(() => {
    if (!pendingTextChange) return;
    const { qIndex, newText } = pendingTextChange;
    setQuestions((prev) => {
      const newQuestions = [...prev];
      newQuestions[qIndex] = { ...newQuestions[qIndex], text: newText };
      return newQuestions;
    });
    setPendingTextChange(null);
  }, [pendingTextChange]);

  const clearLogicForQuestion = useCallback((qIndex) => {
    if (!pendingTextChange) return;
    const { newText } = pendingTextChange;
    setQuestions((prev) => {
      const newQuestions = [...prev];
      newQuestions[qIndex] = { ...newQuestions[qIndex], text: newText, logic: [] };
      return newQuestions;
    });
    setPendingTextChange(null);
  }, [pendingTextChange]);

  const cancelTextChangeAndRevert = useCallback((qIndex, oldText) => {
    setQuestions((prev) => {
      const newQuestions = [...prev];
      newQuestions[qIndex].text = oldText;
      return newQuestions;
    });
    setPendingTextChange(null);
  }, []);

  useEffect(() => {
    reparseHtml();
  }, [code, reparseHtml]);

  useEffect(() => {
    const handleCodeSync = () => {
      if (!programmaticLeftUpdate.current) {
        programmaticLeftUpdate.current = true;
        const newText = generateCodeForLanguage(viewLang, questions, code);
        const caret = leftTextareaRef.current?.selectionStart;
        setLeftText(newText);
        setTimeout(() => {
          if (leftTextareaRef.current) {
            leftTextareaRef.current.selectionStart = caret;
            leftTextareaRef.current.selectionEnd = caret;
          }
        }, 0);
      }
      programmaticLeftUpdate.current = false;
    };

    if (viewLang === "html") {
      handleCodeSync();
    } else {
      handleCodeSync();
    }
  }, [questions, code, viewLang]);

  return {
    state: {
      questions,
      viewLang,
      leftText,
      endUserMode,
      visibleSet,
      responses,
      pendingTextChange,
      openLogicEditor,
    },
    actions: {
      onLeftChange,
      onLeftBlur,
      onEditorSubmit: () => { /* not used */ },
      startEndUserForm,
      handleSubmitEndUserForm,
      handlePreviewQuestionTextChange,
      handleToggleType,
      handleRemoveQuestion,
      handleAddQuestion,
      handleAddOption,
      handleRemoveOption,
      handlePreviewOptionTextChange,
      toggleLogicEditor,
      saveLogicForOption,
      removeLogicForOption,
      handleEndUserChange,
      keepLogicAndClose,
      clearLogicForQuestion,
      cancelTextChangeAndRevert,
      setViewLang,
      normalizeLeftText: reparseHtml, // Use reparseHtml for normalization
      reparseHtml: reparseHtml,
    },
    refs: {
      leftTextareaRef,
    },
  };
}
