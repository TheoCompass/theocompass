"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import html2canvas from "html2canvas-pro";
import CompassChart from "./CompassChart"; 
import { useRouter } from 'next/navigation';
import { trackEvent } from '../../lib/gtag';
import type { Question, UserResponse } from './_types';
import { AXIS_LABELS, FINGERPRINT_CATEGORIES, QUIZ_CATEGORY_LABELS } from './_constants';
import { normalizeAxisKey } from './_helpers';
import { PageHeader } from './_components/_PageHeader';
import { Modals } from './_components/_Modals';
import { ModeSelectCards } from './_components/_ModeSelectCards';
import { QuizQuestionView } from './_components/_QuizQuestionView';
import { ResultsDashboard } from './_components/_ResultsDashboard';
import ExportCard from './_components/_ExportCard';
import ExportLabelsCard from './_components/_ExportLabelsCard';
import ExportFingerprintCard from './_components/_ExportFingerprintCard';

export default function QuizController() {
  // --- APP STATE ---
  const [currentView, setCurrentView] = useState<"mode-select" | "instructions" | "quiz" | "results">("mode-select");
  const [selectedMode, setSelectedMode] = useState<"quick" | "standard" | "deep" | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // --- DATA STATE ---
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answeredQuestionCount, setAnsweredQuestionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- QUIZ STATE ---
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, UserResponse>>({}); 

  // --- LOCAL STORAGE & HYDRATION STATE ---
  const [isLoaded, setIsLoaded] = useState(false);

  // --- RESULTS STATE ---
  const [results, setResults] = useState<any[]>([]);
  const [familyMatches, setFamilyMatches] = useState<any[]>([]);
  const [userCoords, setUserCoords] = useState<Record<string, number>>({});
  const [showSpecific, setShowSpecific] = useState(false);
  const [showTopFamilyDenoms, setShowTopFamilyDenoms] = useState(false);
  // 0.5: global "active only" filter, shared by the results page AND the export image
  const [activeOnly, setActiveOnly] = useState(false);
  const [userTolerance, setUserTolerance] = useState<number>(50);
  const [userLabels, setUserLabels] = useState([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [compareDenomId, setCompareDenomId] = useState<string | null>(null);
  const [expandedAxis, setExpandedAxis] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // --- COORDINATES LOOKUP (for comparison) ---
  const [allCoordinates, setAllCoordinates] = useState<Map<string, {
    name: string;
    family: string;
    dimCoords: Record<string, number>;
    isActive?: boolean;
    estMembers?: number | null;
  }>>(new Map());

  // --- SCREENSHOT REFS ---
  const exportRef = useRef<HTMLDivElement>(null);
  const exportLabelsRef = useRef<HTMLDivElement>(null);
  const exportFingerprintRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingLabels, setIsExportingLabels] = useState(false);
  const [isExportingFingerprint, setIsExportingFingerprint] = useState(false);

  // --- ROUTER & MODALS ---
  const router = useRouter();
  const [showBackModal, setShowBackModal] = useState(false);
  const [showDevModal, setShowDevModal] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false); 
  const [devCode, setDevCode] = useState("");
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [quizAnimKey, setQuizAnimKey] = useState(0);

  // Instructions view state
  const [tutorialStep, setTutorialStep] = useState(0);
  const [demoInfoOpen, setDemoInfoOpen] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);

  // Current question temporary state
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [expandedInfo, setExpandedInfo] = useState<string | null>(null);
  const [isSilenceSelected, setIsSilenceSelected] = useState(false);
  const [silenceType, setSilenceType] = useState<"apathetic" | "hostile" | null>(null);
  const [certainty, setCertainty] = useState(2); 
  const [tolerance, setTolerance] = useState(2);

  // Enhanced UX state
  const [showShortcutHint, setShowShortcutHint] = useState(true);
  const [showCategoryTransition, setShowCategoryTransition] = useState(false);
  const [transitionCategoryName, setTransitionCategoryName] = useState("");
  const [hasShownFirstInfoPulse, setHasShownFirstInfoPulse] = useState(false);
  const [transitionCategoryCode, setTransitionCategoryCode] = useState("");

  // --- DERIVED VARIABLES ---
  const totalQuestions = questions.length;
  const currentQuestion = questions[currentQuestionIndex];
  const progressPercentage = totalQuestions > 0 ? ((currentQuestionIndex) / totalQuestions) * 100 : 0;
  const hasPrimaryKeyword = currentQuestion?.question.toLowerCase().includes("primary");

  // --- FETCH COORDINATES & MERGE INTO RESULTS ---
  useEffect(() => {
    if (currentView !== "results" || results.length === 0) return;

    const fetchCoordinates = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
        const res = await fetch(`${apiUrl}/api/coordinates`);
        if (!res.ok) return;
        const rows: any[] = await res.json();

        const map = new Map<string, {
          name: string;
          family: string;
          dimCoords: Record<string, number>;
          isActive?: boolean;
          estMembers?: number | null;
        }>();

        for (const row of rows) {
          if (row.mode !== "quick") continue;
          const denomId = row.denomination_id;
          if (map.has(denomId)) continue;

          const dimCoords: Record<string, number> = {};
          for (const key of Object.keys(row)) {
            if (key.endsWith("_avg")) {
              const shortKey = normalizeAxisKey(key);
              if (AXIS_LABELS[shortKey]) {
                dimCoords[shortKey] = row[key];
              }
            }
            if (key === "tolerance_score") {
              dimCoords["tolerance"] = row[key];
            }
            if (key === "certainty_score") {
              dimCoords["certainty"] = row[key];
            }
          }

          map.set(denomId, {
            name: row.name || denomId,
            family: row.family || "",
            dimCoords,
            isActive: row.is_active === 1 || row.is_active === true,
            estMembers: row.est_members_global ?? null,
          });
        }

        setAllCoordinates(map);

        const enriched = results.map((r: any) => {
          const coord = map.get(r.id);
          if (coord && coord.dimCoords && Object.keys(coord.dimCoords).length > 0) {
            return { ...r, dimCoords: coord.dimCoords };
          }
          return r;
        });
        setResults(enriched);
      } catch (err) {
        console.error("Failed to fetch coordinates", err);
      }
    };

    fetchCoordinates();
  }, [currentView, results.length]);

  // --- LOCAL STORAGE LOGIC ---

  // 1. INITIAL LOAD (Runs once on mount)
  useEffect(() => {
    const savedResults = localStorage.getItem('theocompass_final_results');
    if (savedResults) {
      try {
        const data = JSON.parse(savedResults);
        setResults(data.matches);
        setFamilyMatches(data.familyMatches || []);
        setUserCoords(data.userDimCoords);
        setUserTolerance(data.userTolerance);
        setUserLabels(data.userLabels);
        setSelectedMode(data.selectedMode || null);
        setAnsweredQuestionCount(data.answeredCount || 0);
        setCurrentView("results");
        setIsLoaded(true);
        return;
      } catch (e) {
        console.error("Failed to load saved results", e);
      }
    }

    const savedData = localStorage.getItem('theocompass_quiz_progress');
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        if (data.questions && data.questions.length > 0) {
          setQuestions(data.questions);
          setUserAnswers(data.userAnswers);
          setCurrentQuestionIndex(data.currentQuestionIndex || 0);
          setSelectedMode(data.selectedMode || null);
          setCurrentView("quiz");
        }
      } catch (e) {
        console.error("Failed to load saved progress", e);
      }
    }
    
    setIsLoaded(true);
  }, []);

  // 2. SAVE QUIZ PROGRESS (Runs when quiz data changes)
  useEffect(() => {
    if (isLoaded && currentView === "quiz" && questions.length > 0 && Object.keys(userAnswers).length > 0) {
      const dataToSave = {
        questions,
        userAnswers,
        currentQuestionIndex,
        selectedMode
      };
      localStorage.setItem('theocompass_quiz_progress', JSON.stringify(dataToSave));
      triggerSaveToast();
    }
  }, [isLoaded, currentView, questions, userAnswers, currentQuestionIndex, selectedMode]);

  // 3. SYNC UI STATE (Restores visual state for current question after refresh)
  useEffect(() => {
    if (currentView === "quiz" && currentQuestion && userAnswers[currentQuestion.id]) {
      restoreQuestionState(userAnswers[currentQuestion.id]);
    } else if (currentView === "quiz") {
      resetQuestionState();
    }
  }, [currentQuestionIndex, currentView, userAnswers]);

  // 4. Prevent Next.js hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleConfirmBack = () => {
    router.push('/');
  };

  const handleConfirmDev = () => {
    handleDevAutoFill(); 
    setShowDevModal(false);
  };

  const handleConfirmRestart = () => {
    localStorage.removeItem('theocompass_quiz_progress');
    localStorage.removeItem('theocompass_final_results');
    setCurrentView("mode-select");
    resetQuestionState();
    setUserAnswers({});
    setCurrentQuestionIndex(0);
    setQuestions([]);
    setResults([]);
    setFamilyMatches([]);
    setUserCoords({});
    setUserTolerance(50);
    setUserLabels([]);
    setShowSpecific(false);
    setShowTopFamilyDenoms(false);
    setActiveOnly(false);
    setShowRestartModal(false);
  };

  const startInstructions = async (mode: "quick" | "standard" | "deep") => {
    setSelectedMode(mode);
    setCurrentView("instructions");
    setIsLoading(true);
    setError(null);
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
      const response = await fetch(`${apiUrl}/api/questions?mode=${mode}`);

      if (!response.ok) throw new Error("Failed to fetch questions");
      
      const data = await response.json();
      setQuestions(data);
    } catch (err) {
      console.error(err);
      setError("Could not load questions. Make sure your database API is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const startQuiz = () => setCurrentView("quiz");

  const handleStandardAnswerClick = (answerId: string) => {
    setSelectedAnswer(answerId);
    setIsSilenceSelected(false);
    setSilenceType(null);
    setCertainty(2); 
    setTolerance(2); 
  };

  const triggerSaveToast = () => {
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 1600);
  };

  const handleSilenceClick = (type: "apathetic" | "hostile") => {
    if (isSilenceSelected && silenceType === type) {
      setIsSilenceSelected(false);
      setSilenceType(null);
      setSelectedAnswer(null);
      setCertainty(2);
      setTolerance(2);
      return;
    }
    setSelectedAnswer(`silence_${type}`); 
    setIsSilenceSelected(true);
    setSilenceType(type);
    
    if (type === "apathetic") {
      setCertainty(0); 
      setTolerance(2); 
    } else if (type === "hostile") {
      setCertainty(3); 
      setTolerance(1); 
    }
  };

  const toggleInfo = (e: React.MouseEvent, answerId: string) => {
    e.stopPropagation();
    setExpandedInfo(expandedInfo === answerId ? null : answerId);
    if (!hasShownFirstInfoPulse) {
      setHasShownFirstInfoPulse(true);
    }
  };

  const handleNext = async () => {
    const currentQ = questions[currentQuestionIndex];
    const newAnswers = { ...userAnswers };
    
    newAnswers[currentQ.id] = {
      questionId: currentQ.id,
      answerId: selectedAnswer || "skipped",
      certainty,
      tolerance,
      isSilence: isSilenceSelected,
      silenceType: silenceType || undefined
    };
    
    setUserAnswers(newAnswers);

    if (currentQuestionIndex < questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      const nextQuestion = questions[nextIndex];
      const currentCategory = QUIZ_CATEGORY_LABELS[currentQuestion.category] || currentQuestion.category;
      const nextCategory = QUIZ_CATEGORY_LABELS[nextQuestion?.category] || nextQuestion?.category;
      
      if (nextQuestion && currentCategory !== nextCategory) {
        setTransitionCategoryName(nextCategory);
        setTransitionCategoryCode(nextQuestion.category);
        setShowCategoryTransition(true);
      }
      
      setCurrentQuestionIndex(nextIndex);
      setQuizAnimKey(prev => prev + 1);
    } else {
      setIsCalculating(true);
      setCurrentView("results");

      const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
      try {
        const res = await fetch(`${apiUrl}/api/calculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newAnswers)
        });
        
        const data = await res.json();
        
        if (data.status === "success") {
          setResults(data.matches); 
          setFamilyMatches(data.familyMatches || []);
          setUserCoords(data.userDimCoords || {});
          setUserTolerance(data.userTolerance ?? 50);
          setUserLabels(data.userLabels || []);
          
          trackEvent('quiz_complete', {
            quiz_mode: selectedMode || 'quick',
            questions_answered: Object.keys(newAnswers).length,
            top_match: data.matches[0]?.name || 'unknown',
            top_match_score: data.matches[0]?.matchPercentage || 0,
            user_tolerance: data.userTolerance ?? 50
          });

          const answerCount = Object.keys(newAnswers).length;
          setAnsweredQuestionCount(answerCount);

          localStorage.setItem("theocompass_final_results", JSON.stringify({
             matches: data.matches,
             familyMatches: data.familyMatches || [],
             userDimCoords: data.userDimCoords,
             userTolerance: data.userTolerance ?? 50,
             userLabels: data.userLabels,
             selectedMode: selectedMode,
             answeredCount: answerCount,
             timestamp: new Date().getTime()
          }));

          localStorage.removeItem('theocompass_quiz_progress');
        } else {
          console.error("Calculation failed");
        }
      } catch (error) {
        console.error("API error:", error);
      } finally {
        setIsCalculating(false);
      }
    }
  };

  useEffect(() => {
    if (currentView === "quiz") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentQuestionIndex, currentView]);

  const handleDevAutoFill = async () => {
    const dummyAnswers: Record<string, UserResponse> = {};
    questions.forEach(q => {
      const randomAnswerIndex = Math.floor(Math.random() * q.answers.length);
      const randomCertainty = Math.floor(Math.random() * 4);
      const randomTolerance = Math.floor(Math.random() * 5);
      
      dummyAnswers[q.id] = {
        questionId: q.id,
        answerId: q.answers[randomAnswerIndex].id,
        certainty: randomCertainty,
        tolerance: randomTolerance,
        isSilence: false
      };
    });

    setUserAnswers(dummyAnswers);
    setIsCalculating(true);
    setCurrentView('results');

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

    try {
      const res = await fetch(`${apiUrl}/api/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dummyAnswers)
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        setResults(data.matches);
        setFamilyMatches(data.familyMatches || []);
        setUserCoords(data.userDimCoords);
        setUserTolerance(data.userTolerance ?? 50);
        setUserLabels(data.userLabels);
      } else {
        console.error("Calculation failed:", data.error);
      }
    } catch (error) {
      console.error("Failed to calculate:", error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleDevDenomFill = async (denomId: string) => {
    setIsCalculating(true);
    setCurrentView('results');
    setShowDevModal(false);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

    try {
      const profileRes = await fetch(`${apiUrl}/api/dev/profile?id=${denomId}`);
      const profileData = await profileRes.json();

      if (!profileRes.ok) {
        alert(`API Error: ${profileData.error || profileRes.statusText}`);
        throw new Error(profileData.error || "Failed to fetch dev profile");
      }

      if (profileData.error) {
         console.error("API Error:", profileData.error);
         alert("Error finding Denomination: " + profileData.error);
         return;
      }

      const finalAnswers: Record<string, UserResponse> = {};
      questions.forEach(q => {
        if (profileData[q.id]) {
          finalAnswers[q.id] = profileData[q.id];
        }
      });

      setUserAnswers(finalAnswers);

      const calcRes = await fetch(`${apiUrl}/api/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalAnswers)
      });
      const data = await calcRes.json();
      
      if (data.status === 'success') {
        setResults(data.matches);
        setFamilyMatches(data.familyMatches || []);
        setUserCoords(data.userDimCoords);
        setUserTolerance(data.userTolerance ?? 50);
        setUserLabels(data.userLabels);
      } else {
        console.error("Calculation failed:", data.error);
      }
    } catch (error) {
      console.error("Failed to execute dev test:", error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      setQuizAnimKey(prev => prev + 1);
    }
  };

  const resetQuestionState = () => {
    setSelectedAnswer(null);
    setExpandedInfo(null);
    setIsSilenceSelected(false);
    setSilenceType(null);
    setCertainty(2);
    setTolerance(2);
  };

  const restoreQuestionState = (savedAns: UserResponse) => {
    setSelectedAnswer(savedAns.answerId);
    setCertainty(savedAns.certainty);
    setTolerance(savedAns.tolerance);
    setIsSilenceSelected(savedAns.isSilence);
    setSilenceType(savedAns.silenceType || null);
    setExpandedInfo(null);
  };

  const handleDownloadFingerprint = async () => {
    if (!exportFingerprintRef.current) return;
    setIsExportingFingerprint(true);
    
    try {
      exportFingerprintRef.current.style.position = 'static';
      exportFingerprintRef.current.style.left = 'auto';
      
      const canvas = await html2canvas(exportFingerprintRef.current, {
        scale: 2, 
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      
      const dataURL = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "TheoCompass-Fingerprint.png";
      link.href = dataURL;
      link.click();

      trackEvent('download_fingerprint_image', {
        quiz_mode: selectedMode || 'quick',
      });

    } catch (err) {
      console.error("Failed to generate fingerprint image", err);
    } finally {
      if (exportFingerprintRef.current) {
        exportFingerprintRef.current.style.position = 'absolute';
        exportFingerprintRef.current.style.left = '-9999px';
      }
      setIsExportingFingerprint(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!exportRef.current) return;
    setIsExporting(true);
    
    try {
      exportRef.current.style.position = 'static';
      exportRef.current.style.left = 'auto';
      
      const canvas = await html2canvas(exportRef.current, {
        scale: 2, 
        useCORS: true,
        backgroundColor: "#0f172a", 
      });
      
      const dataURL = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "TheoCompass-Results.png";
      link.href = dataURL;
      link.click();

      trackEvent('download_results_image', {
        top_match: results[0]?.name || 'unknown',
        top_match_score: results[0]?.matchPercentage || 0,
        quiz_mode: selectedMode || 'quick'
      });

    } catch (err) {
      console.error("Failed to generate image", err);
    } finally {
      if (exportRef.current) {
        exportRef.current.style.position = 'absolute';
        exportRef.current.style.left = '-9999px';
      }
      setIsExporting(false);
    }
  };

  const handleDownloadLabels = async () => {
    if (!exportLabelsRef.current) return;
    setIsExportingLabels(true);
    
    try {
      exportLabelsRef.current.style.position = 'static';
      exportLabelsRef.current.style.left = 'auto';
      
      const canvas = await html2canvas(exportLabelsRef.current, {
        scale: 2, 
        useCORS: true,
        backgroundColor: "#f8fafc",
      });
      
      const dataURL = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "TheoCompass-Belief-Labels.png";
      link.href = dataURL;
      link.click();

      trackEvent('download_labels_image', {
        quiz_mode: selectedMode || 'quick',
        user_labels: userLabels.join(',')
      });

    } catch (err) {
      console.error("Failed to generate labels image", err);
    } finally {
      if (exportLabelsRef.current) {
        exportLabelsRef.current.style.position = 'absolute';
        exportLabelsRef.current.style.left = '-9999px';
      }
      setIsExportingLabels(false);
    }
  };

  // Memoize shuffle
  const shuffledAnswers = useMemo(() => {
    if (!currentQuestion || !currentQuestion.answers) return [];
    
    const shuffled = [...currentQuestion.answers];
    
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
  }, [currentQuestion?.id]);

  const displayAnswers = isMounted && currentQuestion 
    ? shuffledAnswers 
    : (currentQuestion?.answers || []);

  // KEYBOARD SHORTCUTS (quiz view only)
  useEffect(() => {
    if (currentView !== "quiz") return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const numKey = parseInt(e.key);
      if (numKey >= 1 && numKey <= displayAnswers.length) {
        e.preventDefault();
        handleStandardAnswerClick(displayAnswers[numKey - 1].id);
        return;
      }
      
      if (e.key === "Enter" && (selectedAnswer || isSilenceSelected)) {
        e.preventDefault();
        handleNext();
        return;
      }

      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        handleSilenceClick("apathetic");
        return;
      }
      if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        handleSilenceClick("hostile");
        return;
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentView, displayAnswers, selectedAnswer, isSilenceSelected]);


  // ==========================================
  // VIEW 1: MODE SELECT
  // ==========================================
  if (currentView === "mode-select") {
    const savedData = typeof window !== 'undefined' ? localStorage.getItem('theocompass_quiz_progress') : null;
    let savedMode: string | null = null;
    if (savedData && isMounted) {
      try {
        const parsed = JSON.parse(savedData);
        savedMode = parsed.selectedMode || null;
      } catch {}
    }

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
        <PageHeader
          showRestart={false}
          onLogoClick={() => setShowBackModal(true)}
          onTitleClick={() => setShowBackModal(true)}
          onBackClick={() => setShowBackModal(true)}
          onRestartClick={() => setShowRestartModal(true)}
        />

        <Modals
          showBackModal={showBackModal}
          showDevModal={showDevModal}
          showRestartModal={showRestartModal}
          devCode={devCode}
          onUnlockDevTools={() => { setShowRestartModal(false); setShowDevModal(true); }}
          onCloseBackModal={() => setShowBackModal(false)}
          onCloseDevModal={() => setShowDevModal(false)}
          onCloseRestartModal={() => { setShowRestartModal(false); setDevCode(""); }}
          onConfirmBack={handleConfirmBack}
          onConfirmDev={handleConfirmDev}
          onConfirmRestart={handleConfirmRestart}
          onDevDenomFill={handleDevDenomFill}
          onSetDevCode={setDevCode}
        />
        <main className="flex-grow flex flex-col items-center justify-center p-6 max-w-4xl mx-auto animate-fade-in-up">
          <h1 className="font-serif text-3xl md:text-5xl font-bold mb-4 text-center">Select Quiz Mode</h1>
          <p className="text-slate-600 mb-10 text-center max-w-xl">Choose how deep you want to go. Progress is saved automatically.</p>
          
          <ModeSelectCards savedMode={savedMode} onSelectQuick={() => startInstructions("quick")} />
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: INSTRUCTIONS
  // ==========================================
  if (currentView === "instructions") {
    const totalSteps = 4;
    
    const steps = [
      {
        title: "Select your Stance",
        color: "text-slate-800",
        content: (
          <div>
            <p className="text-sm text-slate-600 mb-4">Choose the answer that best represents your view. Click <strong className="text-blue-600">"Learn more"</strong> for a detailed definition.</p>
            
            <div className="bg-white p-4 rounded-xl border-2 border-blue-300 shadow-sm mb-3">
              <div className="flex justify-between items-center">
                <span className="font-medium text-blue-800">Example: Transubstantiation</span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setDemoInfoOpen(!demoInfoOpen); }}
                  className={`flex items-center gap-1.5 text-sm font-medium transition-colors flex-shrink-0 px-3 py-1.5 rounded-full border ${
                    demoInfoOpen
                      ? "bg-blue-600 text-white border-blue-600 shadow-md"
                      : "bg-slate-100 text-blue-600 border-blue-200 animate-pulse-slow ring-2 ring-blue-300"
                  }`}
                >
                  <span className="text-xs whitespace-nowrap">{demoInfoOpen ? "Close" : "Learn more"}</span>
                </button>
              </div>
              
              {demoInfoOpen && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-slate-600 border border-blue-200 animate-fade-in-up">
                  <strong className="text-blue-800">Further Context:</strong><br/>
                  The bread and wine become the actual body and blood of Christ during the Eucharist, while maintaining their physical appearances.
                </div>
              )}
            </div>
            
            <p className="text-xs text-slate-400 mt-2">
              Tap <strong className="text-blue-600 font-medium">"Learn more"</strong> on any answer during the quiz to read additional context about that theological position.
            </p>
          </div>
        ),
      },
      {
        title: "Set your Certainty",
        color: "text-blue-700",
        content: (
          <div>
            <p className="text-sm text-slate-600 mb-4">How confident are you in this specific belief?</p>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex justify-between text-sm mb-2 font-medium">
                <span className="text-slate-800 font-bold flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  Certainty
                </span>
                <span className="font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full text-xs">Pretty Sure</span>
              </div>
              <div className="relative mb-2">
                <div className="absolute top-1/2 left-0 right-0 h-2 -translate-y-1/2 rounded-lg pointer-events-none bg-gradient-to-r from-slate-300 via-blue-400 to-blue-600"></div>
                <div className="absolute top-1/2 left-0 right-0 h-2 -translate-y-1/2 flex justify-between px-[2px] pointer-events-none">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className={`w-0.5 h-3 -translate-y-0.5 rounded-full ${i <= 2 ? 'bg-white' : 'bg-white/60'}`} />
                  ))}
                </div>
                <div className="w-full h-8 relative">
                  <div className="absolute left-[62%] top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-blue-500 shadow-md"></div>
                </div>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Not Sure</span><span>Leaning</span><span>Pretty Sure</span><span>Certain</span>
              </div>
            </div>
          </div>
        ),
      },
      {
        title: "Set Tolerance",
        color: "text-emerald-600",
        content: (
          <div>
            <p className="text-sm text-slate-600 mb-4">How many of the other options do you consider valid? This affects how exclusive your match is.</p>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex justify-between items-end mb-1">
                <span className="text-slate-800 text-sm font-bold flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  Tolerance
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-yellow-50 text-yellow-600">A Few</span>
              </div>
              <p className="text-xs text-slate-500 italic mb-2">A few other options are valid, but require theological discernment.</p>
              <div className="w-full h-2 rounded-full bg-gradient-to-r from-red-400 via-yellow-400 via-green-400 to-sky-400"></div>
              <div className="hidden sm:flex justify-between text-xs text-slate-400 mt-1">
                <span>None</span>
                <span className="text-center leading-tight -ml-7">None for<br/>Fellowship</span>
                <span className="-ml-8">A Few</span>
                <span className="-ml-3">Most</span>
                <span>All</span>
              </div>
              <div className="flex sm:hidden justify-between text-xs text-slate-400 mt-1">
                <span>None</span>
                <span>A Few</span>
                <span>All</span>
              </div>
            </div>
          </div>
        ),
      },
      {
        title: "Or, Choose Silence",
        color: "text-slate-800",
        content: (
          <div>
            <p className="text-sm text-slate-600 mb-4">If a question doesn't fit your theology, bypass the sliders entirely:</p>
            <div className="flex flex-col sm:flex-row gap-3 mb-3">
              <div className="flex-1 p-4 rounded-xl border-2 border-slate-300 bg-slate-50/50 text-sm flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">🤷</span>
                <div className="text-left">
                  <span className="font-bold text-slate-700 block">Apathetic Silence</span>
                  <p className="text-xs text-slate-400 mt-0.5">The topic isn't relevant to you. Creates a soft, neutral stance.</p>
                </div>
              </div>
              <div className="flex-1 p-4 rounded-xl border-2 border-red-200 bg-red-50/50 text-sm flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">✋</span>
                <div className="text-left">
                  <span className="font-bold text-red-700 block">Hostile Silence</span>
                  <p className="text-xs text-slate-400 mt-0.5">You reject the question's premise. Penalizes denominations that affirm it.</p>
                </div>
              </div>
            </div>
          </div>
        ),
      },
    ];
    
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
        <PageHeader
          showRestart={false}
          onLogoClick={() => setShowBackModal(true)}
          onTitleClick={() => setShowBackModal(true)}
          onBackClick={() => setShowBackModal(true)}
          onRestartClick={() => setShowRestartModal(true)}
        />
        <Modals
          showBackModal={showBackModal}
          showDevModal={showDevModal}
          showRestartModal={showRestartModal}
          devCode={devCode}
          onUnlockDevTools={() => { setShowRestartModal(false); setShowDevModal(true); }}
          onCloseBackModal={() => setShowBackModal(false)}
          onCloseDevModal={() => setShowDevModal(false)}
          onCloseRestartModal={() => { setShowRestartModal(false); setDevCode(""); }}
          onConfirmBack={handleConfirmBack}
          onConfirmDev={handleConfirmDev}
          onConfirmRestart={handleConfirmRestart}
          onDevDenomFill={handleDevDenomFill}
          onSetDevCode={setDevCode}
        />
       <main className="flex-grow p-6 max-w-2xl mx-auto w-full flex flex-col">
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm mt-8">
            <h1 className="font-serif text-3xl font-bold mb-2 text-blue-900">How to navigate the quiz</h1>
            <p className="text-slate-500 text-sm mb-6">
              TheoCompass measures not just <em>what</em> you believe, but <em>how</em> you hold those beliefs.
            </p>
            
            <div className="flex items-center justify-center gap-2 mb-6">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTutorialStep(i)}
                  className={`w-4 h-4 rounded-full transition-all ${
                    i === tutorialStep ? "bg-blue-600 w-8" : "bg-slate-300 hover:bg-slate-400"
                  }`}
                  aria-label={`Step ${i + 1}`}
                />
              ))}
            </div>
            
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 mb-6 min-h-[180px] animate-fade-in-up" key={tutorialStep}>
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                  {tutorialStep + 1}
                </span>
                <h3 className={`font-bold text-lg ${steps[tutorialStep].color}`}>{steps[tutorialStep].title}</h3>
              </div>
              {steps[tutorialStep].content}
            </div>
            
            <div className="flex justify-between items-center mb-6">
              <button
                type="button"
                onClick={() => setTutorialStep(Math.max(0, tutorialStep - 1))}
                disabled={tutorialStep === 0}
                className={`text-sm font-medium transition-colors ${
                  tutorialStep === 0 ? "text-slate-300 cursor-not-allowed" : "text-slate-600 hover:text-blue-700"
                }`}
              >
                ← Previous
              </button>
              <span className="text-xs text-slate-400 font-medium">
                Step {tutorialStep + 1} of {totalSteps}
              </span>
              <button
                type="button"
                onClick={() => setTutorialStep(Math.min(totalSteps - 1, tutorialStep + 1))}
                disabled={tutorialStep === totalSteps - 1}
                className={`text-sm font-medium transition-colors ${
                  tutorialStep === totalSteps - 1 ? "text-slate-300 cursor-not-allowed" : "text-slate-600 hover:text-blue-700"
                }`}
              >
                Next →
              </button>
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => startInstructions(selectedMode!)} className="ml-4 underline font-bold whitespace-nowrap">Try Again</button>
              </div>
            )}

            <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-700 flex items-center gap-2">
              <span className="text-indigo-400 text-base leading-none">⌨️</span>
              <span><span className="font-semibold">During the quiz:</span> Press <kbd className="inline-block bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded font-bold text-[10px] min-w-[18px] text-center">1</kbd>–<kbd className="inline-block bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded font-bold text-[10px] min-w-[18px] text-center">4</kbd> to select, <kbd className="inline-block bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded font-bold text-[10px]">Enter</kbd> to confirm, <kbd className="inline-block bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded font-bold text-[10px]">S</kbd> / <kbd className="inline-block bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded font-bold text-[10px]">H</kbd> for silence.</span>
            </div>

            <button 
              onClick={startQuiz} 
              disabled={isLoading || !!error || tutorialStep < totalSteps - 1}
              className={`w-full py-4 rounded-xl font-bold shadow-md transition-all text-lg ${
                isLoading || error ? "bg-slate-200 text-slate-500 cursor-not-allowed" : 
                tutorialStep < totalSteps - 1 ? "bg-slate-200 text-slate-400 cursor-not-allowed" :
                "bg-blue-900 hover:bg-blue-800 text-white"
              }`}
            >
              {isLoading ? "Loading Database..." : 
               error ? "Database Error" : 
               tutorialStep < totalSteps - 1 ? "Review all 4 steps to continue →" : 
               "Start Quiz"}
            </button>
            
            {skipConfirm ? (
              <div className="flex items-center justify-center gap-2 mt-3">
                <span className="text-xs text-slate-500">Skip tutorial?</span>
                <button
                  type="button"
                  onClick={() => { setSkipConfirm(false); startQuiz(); }}
                  disabled={isLoading || !!error}
                  className={`text-sm font-bold px-4 py-1.5 rounded-lg transition-colors ${
                    isLoading || error ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  }`}
                >
                  Yes, skip
                </button>
                <button
                  type="button"
                  onClick={() => setSkipConfirm(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSkipConfirm(true)}
                disabled={isLoading || !!error}
                className={`w-full text-center text-sm mt-3 transition-colors ${
                  isLoading || error ? "text-slate-300 cursor-not-allowed" : "text-slate-400 hover:text-blue-600"
                }`}
              >
                Skip tutorial, start quiz
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW 4: RESULTS DASHBOARD
  // ==========================================
  if (currentView === 'results') {
    const displayFamilies = selectedMode === "quick" && !showSpecific && familyMatches.length > 0;
    const exportCoordsWithTolerance: Record<string, number> = {
      ...userCoords,
      tolerance: userTolerance,
    };

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 relative overflow-x-hidden">
        {/* HIDDEN EXPORT CARDS */}
        <ExportCard
          ref={exportRef}
          results={results}
          familyMatches={familyMatches}
          userCoords={userCoords}
          userTolerance={userTolerance}
          selectedMode={selectedMode}
          showSpecific={showSpecific}
          displayFamilies={displayFamilies}
          activeOnly={activeOnly}
          allCoordinates={allCoordinates}
          timestamp={new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          questionCount={answeredQuestionCount || questions.length}
        />

        <ExportLabelsCard
          userLabels={userLabels}
          selectedMode={selectedMode}
          questionCount={answeredQuestionCount || questions.length}
          onRef={(el: HTMLDivElement | null) => { exportLabelsRef.current = el; }}
        />

        <ExportFingerprintCard
          userCoords={userCoords}
          userTolerance={userTolerance}
          selectedMode={selectedMode}
          questionCount={answeredQuestionCount || questions.length}
          onRef={(el: HTMLDivElement | null) => { exportFingerprintRef.current = el; }}
        />

        <PageHeader
          showRestart={true}
          onLogoClick={() => setShowBackModal(true)}
          onTitleClick={() => setShowBackModal(true)}
          onBackClick={() => setShowBackModal(true)}
          onRestartClick={() => setShowRestartModal(true)}
        />
        <Modals
          showBackModal={showBackModal}
          showDevModal={showDevModal}
          showRestartModal={showRestartModal}
          devCode={devCode}
          onUnlockDevTools={() => { setShowRestartModal(false); setShowDevModal(true); }}
          onCloseBackModal={() => setShowBackModal(false)}
          onCloseDevModal={() => setShowDevModal(false)}
          onCloseRestartModal={() => { setShowRestartModal(false); setDevCode(""); }}
          onConfirmBack={handleConfirmBack}
          onConfirmDev={handleConfirmDev}
          onConfirmRestart={handleConfirmRestart}
          onDevDenomFill={handleDevDenomFill}
          onSetDevCode={setDevCode}
        />

        <ResultsDashboard
          results={results}
          familyMatches={familyMatches}
          userCoords={userCoords}
          userTolerance={userTolerance}
          userLabels={userLabels}
          selectedMode={selectedMode}
          isCalculating={isCalculating}
          showSpecific={showSpecific}
          showTopFamilyDenoms={showTopFamilyDenoms}
          compareDenomId={compareDenomId}
          expandedAxis={expandedAxis}
          collapsedCategories={collapsedCategories}
          allCoordinates={allCoordinates}
          isExporting={isExporting}
          exportRef={exportRef}
          isExportingLabels={isExportingLabels}
          isExportingFingerprint={isExportingFingerprint}
          activeOnly={activeOnly}
          onSetActiveOnly={setActiveOnly}
          onSetShowSpecific={setShowSpecific}
          onSetShowTopFamilyDenoms={setShowTopFamilyDenoms}
          onSetCompareDenomId={setCompareDenomId}
          onSetExpandedAxis={setExpandedAxis}
          onSetCollapsedCategories={setCollapsedCategories}
          onDownloadImage={handleDownloadImage}
          onDownloadLabels={handleDownloadLabels}
          onDownloadFingerprint={handleDownloadFingerprint}
          onRetake={() => setShowRestartModal(true)}
          onDevMenu={() => setShowDevModal(true)}
        />

        {/* GLOBAL FOOTER */}
        <footer className="w-full bg-slate-900 text-slate-300 py-10 px-6 text-center mt-auto">
          <div className="max-w-4xl mx-auto flex flex-col items-center">
            <p className="font-serif italic text-lg mb-6 text-slate-400">
              "He is before all things, and in him all things hold together." — Colossians 1:17
            </p>
            <div className="flex gap-6 mb-8 text-sm">
              <a href="https://theocompass.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">TheoCompass.com</a>
              <a href="https://www.reddit.com/r/TheoCompass" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">r/TheoCompass</a>
              <a href="https://ko-fi.com/oroq" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">Support on Ko-fi</a>
              <a href="mailto:theocompass.project@gmail.com" className="hover:text-white transition-colors">Contact</a>
            </div>
            <p className="text-xs text-slate-500 mb-2">Built for informed decision, not persuasion.</p>
            <p className="text-xs text-slate-500">© 2026 Oroq / TheoCompass Project</p>
          </div>
        </footer>
      </div>
    );
  }


  // ==========================================
  // VIEW 3: THE ACTUAL QUIZ
  // ==========================================
  if (!currentQuestion) return <div className="p-10 text-center">Error: No question data found.</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <PageHeader
          showRestart={true}
          onLogoClick={() => setShowBackModal(true)}
          onTitleClick={() => setShowBackModal(true)}
          onBackClick={() => setShowBackModal(true)}
          onRestartClick={() => setShowRestartModal(true)}
        />
        <div className="w-full bg-slate-200 h-3">
          <div 
            className="h-3 transition-all duration-500 ease-out relative overflow-hidden"
            style={{ width: `${progressPercentage}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-700 rounded-r-full"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer rounded-r-full"></div>
          </div>
        </div>
      </header>
      
      <Modals
        showBackModal={showBackModal}
        showDevModal={showDevModal}
        showRestartModal={showRestartModal}
        devCode={devCode}
        onUnlockDevTools={() => { setShowRestartModal(false); setShowDevModal(true); }}
        onCloseBackModal={() => setShowBackModal(false)}
        onCloseDevModal={() => setShowDevModal(false)}
        onCloseRestartModal={() => { setShowRestartModal(false); setDevCode(""); }}
        onConfirmBack={handleConfirmBack}
        onConfirmDev={handleConfirmDev}
        onConfirmRestart={handleConfirmRestart}
        onDevDenomFill={handleDevDenomFill}
        onSetDevCode={setDevCode}
      />

      {showSaveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="bg-slate-800 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg animate-scale-in-out flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Progress saved
          </div>
        </div>
      )}

      <QuizQuestionView
        currentQuestion={currentQuestion}
        questions={questions}
        currentQuestionIndex={currentQuestionIndex}
        totalQuestions={totalQuestions}
        progressPercentage={progressPercentage}
        hasPrimaryKeyword={hasPrimaryKeyword}
        displayAnswers={displayAnswers}
        selectedAnswer={selectedAnswer}
        expandedInfo={expandedInfo}
        isSilenceSelected={isSilenceSelected}
        silenceType={silenceType}
        certainty={certainty}
        tolerance={tolerance}
        hasShownFirstInfoPulse={hasShownFirstInfoPulse}
        showShortcutHint={showShortcutHint}
        showCategoryTransition={showCategoryTransition}
        transitionCategoryName={transitionCategoryName}
        transitionCategoryCode={transitionCategoryCode}
        quizAnimKey={quizAnimKey}
        userAnswers={userAnswers}
        onStandardAnswerClick={handleStandardAnswerClick}
        onToggleInfo={toggleInfo}
        onSilenceClick={handleSilenceClick}
        onSetCertainty={setCertainty}
        onSetTolerance={setTolerance}
        onNext={handleNext}
        onBack={handleBack}
        onDismissShortcutHint={() => setShowShortcutHint(false)}
        onDismissCategoryTransition={() => setShowCategoryTransition(false)}
      />
    </div>
  );
}