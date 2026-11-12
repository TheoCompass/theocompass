"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import html2canvas from "html2canvas-pro";
import CompassChart from "./CompassChart"; 
import { useRouter } from 'next/navigation';
import { trackEvent } from '../../lib/gtag';
import { createQuizSessionId, recordQuizCompletion } from '../../lib/api';
import { APP_STAGE } from '../../lib/site';
import { Check, Info } from "lucide-react";
import type { Question, UserResponse } from './_types';
import { AXIS_LABELS, FINGERPRINT_CATEGORIES, MAX_MULTI_SELECT, QUIZ_CATEGORY_LABELS } from './_constants';
import { normalizeAxisKey } from './_helpers';
import { PageHeader } from './_components/_PageHeader';
import { Modals } from './_components/_Modals';
import { ModeSelectCards } from './_components/_ModeSelectCards';
import { AxisSlider, QuizQuestionView } from './_components/_QuizQuestionView';
import { ResultsDashboard } from './_components/_ResultsDashboard';
import ExportCard from './_components/_ExportCard';
import ExportLabelsCard from './_components/_ExportLabelsCard';
import ExportFingerprintCard from './_components/_ExportFingerprintCard';

/**
 * Options for the tutorial's multi-select demo. These are the three positions
 * on the Eucharist question, so the mock reads like the real list -- but they
 * are fixture text, never scored, and never sent anywhere.
 */
const DEMO_OPTIONS = [
  {
    id: "demo-transubstantiation",
    label: "Transubstantiation",
    desc: "The bread and wine become the actual body and blood of Christ.",
  },
  {
    id: "demo-spiritual-presence",
    label: "Spiritual presence",
    desc: "Christ is truly present in the meal, but not in the elements themselves.",
  },
  {
    id: "demo-memorial",
    label: "Memorial remembrance",
    desc: "The supper remembers Christ's sacrifice; the elements remain symbols.",
  },
];

/**
 * The one definition of what a finished quiz looks like in localStorage.
 *
 * `handleNext` and the results page's "Save results" exit both write through
 * here, so the key and the stored shape cannot drift apart.
 */
function persistFinalResults(snapshot: {
  matches: unknown[];
  familyMatches: unknown[];
  userDimCoords: Record<string, number>;
  userTolerance: number;
  userCertainty: number;
  userLabels: unknown[];
  selectedMode: "quick" | "standard" | "deep" | null;
  answeredCount: number;
}) {
  try {
    localStorage.setItem(
      "theocompass_final_results",
      JSON.stringify({ ...snapshot, timestamp: new Date().getTime() })
    );
  } catch (err) {
    console.error("Failed to save results", err);
  }
}

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
  const [showSpecific, setShowSpecific] = useState(true);
  // 0.5: global "active only" filter, shared by the results page AND the export image
  const [activeOnly, setActiveOnly] = useState(false);
  const [userTolerance, setUserTolerance] = useState<number>(50);
  // 14th axis: separate meta-axis computed server-side (priority-weighted avg of C).
  const [userCertainty, setUserCertainty] = useState<number>(50);
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
  /**
   * Set when the user leaves the results without saving, so a calculation that
   * is still in flight cannot write the result back after the fact.
   */
  const skipResultsSaveRef = useRef(false);
  /**
   * Which path produced the results being shown. The moderator/dev "skip to a
   * result" tools call /api/calculate directly, so they mark themselves here and
   * are excluded from completion analytics and the public stats counter.
   */
  const completionSourceRef = useRef<"quiz" | "dev">("quiz");
  const [quizAnimKey, setQuizAnimKey] = useState(0);
  /** Set before bumping quizAnimKey, so Back can slide in from the left. */
  const [quizAnimDir, setQuizAnimDir] = useState<"next" | "prev">("next");

  // Instructions view state
  const [tutorialStep, setTutorialStep] = useState(0);
  const [demoInfoOpen, setDemoInfoOpen] = useState(false);
  /**
   * The multi-select step is a working miniature of the real control: a mode
   * flag and the options ticked, so the reader can feel the cap before the
   * quiz. Local to the tutorial and thrown away with it.
   */
  const [demoMultiSelect, setDemoMultiSelect] = useState(false);
  const [demoPicks, setDemoPicks] = useState<string[]>([DEMO_OPTIONS[0].id]);
  const [skipConfirm, setSkipConfirm] = useState(false);

  // Current question temporary state
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [expandedInfo, setExpandedInfo] = useState<string | null>(null);
  const [isSilenceSelected, setIsSilenceSelected] = useState(false);
  const [silenceType, setSilenceType] = useState<"apathetic" | "hostile" | null>(null);
  /**
   * Multi-select is opt-in and dies with the question: off here, opened by a
   * disclaimer dialog, and turned off again for the next question by
   * `resetQuestionState`. Never persisted -- `restoreQuestionState` re-derives
   * it from the saved answer set.
   */
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false);
  const [showMultiSelectModal, setShowMultiSelectModal] = useState(false);
  /**
   * Which control declared silence. "None of the above" and the apathetic row
   * are two different answers on screen that resolve to the same calculation,
   * so the UI has to remember which one was used to light the right row.
   */
  const [silenceSource, setSilenceSource] = useState<"answer-none" | "rail" | null>(null);
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
        setUserCertainty(data.userCertainty ?? 50);
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

  /**
   * Results exit, option one: keep the finished result in this browser, then go
   * to the main page. The start screen reads this key and opens on the results.
   */
  const handleSaveResultsAndLeave = () => {
    if (results.length > 0) {
      persistFinalResults({
        matches: results,
        familyMatches,
        userDimCoords: userCoords,
        userTolerance,
        userCertainty,
        userLabels,
        selectedMode,
        answeredCount: answeredQuestionCount || questions.length,
      });
    }
    localStorage.removeItem('theocompass_quiz_progress');
    setShowBackModal(false);
    router.push('/');
  };

  /** Results exit, option two: forget the result so the next visit starts fresh. */
  const handleDiscardResultsAndLeave = () => {
    skipResultsSaveRef.current = true;
    localStorage.removeItem('theocompass_final_results');
    localStorage.removeItem('theocompass_quiz_progress');
    setShowBackModal(false);
    router.push('/');
  };

  const handleConfirmDev = () => {
    handleDevAutoFill(); 
    setShowDevModal(false);
  };

  const handleConfirmRestart = () => {
    skipResultsSaveRef.current = false;
    completionSourceRef.current = "quiz";
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
    setUserCertainty(50);
    setUserLabels([]);
    setShowSpecific(true);
    setActiveOnly(false);
    setShowRestartModal(false);
  };

  const startInstructions = async (mode: "quick" | "standard" | "deep") => {
    skipResultsSaveRef.current = false;
    completionSourceRef.current = "quiz";
    setSelectedMode(mode);
    setCurrentView("instructions");
    // The demo is a throwaway mock, so it starts back at one answer. The step
    // itself is left where it was: a reader who already reviewed all of them
    // should not be made to click through again (e.g. after a load error).
    setDemoMultiSelect(false);
    setDemoPicks([DEMO_OPTIONS[0].id]);
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

  /**
   * One answer is the rule; several are a deliberate, temporary exception.
   *
   * With multi-select off this behaves exactly as the pre-Phase-0.1 radio did:
   * the new answer replaces the old one and the conviction sliders go back to
   * their defaults. With it on, answers accumulate up to `MAX_MULTI_SELECT`
   * (1..3 -- the cap is enforced here as well as dimmed in the view).
   */
  const handleToggleAnswer = (answerId: string) => {
    setIsSilenceSelected(false);
    setSilenceType(null);
    setSilenceSource(null);

    if (!multiSelectEnabled) {
      setSelectedAnswers([answerId]);
      setCertainty(2);
      setTolerance(2);
      return;
    }

    const alreadySelected = selectedAnswers.includes(answerId);
    if (!alreadySelected && selectedAnswers.length >= MAX_MULTI_SELECT) return;

    const next = alreadySelected
      ? selectedAnswers.filter(id => id !== answerId)
      : [...selectedAnswers, answerId];

    setSelectedAnswers(next);

    // Reset the conviction defaults only when the answer set goes empty <-> first
    // pick. Toggling a second option used to wipe sliders the reader had moved.
    if (next.length === 0) {
      setCertainty(2);
      setTolerance(2);
    }
  };

  /**
   * Turns multi-select on for the current question only. The caller is the
   * disclaimer dialog, which is where the reader is told what they are trading
   * away -- the collection is capped, and the mode lapses on Next.
   */
  const handleEnableMultiSelect = () => {
    setMultiSelectEnabled(true);
    setShowMultiSelectModal(false);
  };

  /**
   * Back to one answer. The set collapses to its first pick rather than being
   * silently kept: the payload must never carry selections the UI no longer
   * lets the reader see or edit.
   */
  const handleDisableMultiSelect = () => {
    setMultiSelectEnabled(false);
    setSelectedAnswers(prev => prev.slice(0, 1));
  };

  const triggerSaveToast = () => {
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 1600);
  };

  const handleSilenceClick = (
    type: "apathetic" | "hostile",
    source: "answer-none" | "rail" = "rail"
  ) => {
    if (isSilenceSelected && silenceType === type && silenceSource === source) {
      setIsSilenceSelected(false);
      setSilenceType(null);
      setSilenceSource(null);
      setSelectedAnswers([]);
      setCertainty(2);
      setTolerance(2);
      return;
    }
    // Silence and affirmations are mutually exclusive: the engine ignores any
    // selections on a silenced question, so the UI must not imply otherwise.
    setSelectedAnswers([]);
    setIsSilenceSelected(true);
    setSilenceType(type);
    setSilenceSource(source);
    
    if (type === "apathetic") {
      setCertainty(0); 
      setTolerance(2); 
    } else if (type === "hostile") {
      setCertainty(3); 
      setTolerance(1); 
    }
  };

  /**
   * "None of the above" is the answer list's last entry. Internally it still
   * resolves to apathetic silence -- the calculation the roadmap asked for --
   * but the reader is given it as its own answer, so only that row lights up
   * and the copy never explains where the number goes.
   */
  const handleNoneOfTheAbove = () => handleSilenceClick("apathetic", "answer-none");

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
      // Primary id stays the first selection so older readers of the payload
      // (and the pre-multi-select engine) keep working.
      answerId: isSilenceSelected
        ? `silence_${silenceType}`
        : (selectedAnswers[0] || "skipped"),
      answerIds: isSilenceSelected ? [] : selectedAnswers.slice(0, MAX_MULTI_SELECT),
      certainty,
      tolerance,
      isSilence: isSilenceSelected,
      silenceType: silenceType || undefined,
      // UI provenance only -- which control declared the silence, so a restored
      // question can light the row the reader actually pressed.
      silenceSource: isSilenceSelected ? (silenceSource ?? undefined) : undefined
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
      setQuizAnimDir("next");
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
          setUserCertainty(data.userCertainty ?? 50);
          setUserLabels(data.userLabels || []);
          
          // Dev-generated results are for inspection only: they must not enter
          // product analytics or the public stats below.
          const countsAsStatistic = completionSourceRef.current !== "dev";
          if (countsAsStatistic) {
            trackEvent('quiz_complete', {
              quiz_mode: selectedMode || 'quick',
              questions_answered: Object.keys(newAnswers).length,
              top_match: data.matches[0]?.name || 'unknown',
              top_match_score: data.matches[0]?.matchPercentage || 0,
              user_tolerance: data.userTolerance ?? 50,
              user_certainty: data.userCertainty ?? 50
            });
          }

          const answerCount = Object.keys(newAnswers).length;
          setAnsweredQuestionCount(answerCount);

          if (!skipResultsSaveRef.current) {
            persistFinalResults({
              matches: data.matches,
              familyMatches: data.familyMatches || [],
              userDimCoords: data.userDimCoords,
              userTolerance: data.userTolerance ?? 50,
              userCertainty: data.userCertainty ?? 50,
              userLabels: data.userLabels,
              selectedMode,
              answeredCount: answerCount,
            });
          }

          localStorage.removeItem('theocompass_quiz_progress');

          // Anonymous completion stat for the landing page. Only normal runs
          // count: the moderator/dev shortcuts mark completionSourceRef as
          // "dev", so a generated result -- even one that replaced an in-flight
          // normal calculation -- is never reported as a real completion.
          // Fire-and-forget: the results screen must never wait on it, and the
          // per-run session id makes a retry harmless.
          if (countsAsStatistic) {
            void recordQuizCompletion({
              sessionId: createQuizSessionId(),
              mode: selectedMode ?? 'quick',
              answeredCount: answerCount,
              topFamily: data.matches[0]?.family ?? null,
              topMatchId: data.matches[0]?.id ?? null,
              topMatchName: data.matches[0]?.name ?? null,
              topMatchScore: data.matches[0]?.matchPercentage ?? null,
              userTolerance: data.userTolerance ?? 50,
              userCertainty: data.userCertainty ?? 50,
            });
          }
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
    // A shortcut for inspecting the results screen, not a real completion:
    // mark it so handleNext cannot report this result if it is still in flight.
    completionSourceRef.current = "dev";
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
        setUserCertainty(data.userCertainty ?? 50);
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
    // Same rule as handleDevAutoFill: generated results stay out of the stats.
    completionSourceRef.current = "dev";
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
        setUserCertainty(data.userCertainty ?? 50);
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
      setQuizAnimDir("prev");
      setQuizAnimKey(prev => prev + 1);
    }
  };

  const resetQuestionState = () => {
    setSelectedAnswers([]);
    setExpandedInfo(null);
    setIsSilenceSelected(false);
    setSilenceType(null);
    setSilenceSource(null);
    setCertainty(2);
    setTolerance(2);
    // Multi-select is per question: the next question opens as a single-choice
    // list, and the reader has to ask for the wider mode again.
    setMultiSelectEnabled(false);
    setShowMultiSelectModal(false);
  };

  const restoreQuestionState = (savedAns: UserResponse) => {
    // Progress saved before multi-select only stored `answerId`, and silence
    // stored a "silence_apathetic" sentinel there, so both need guarding.
    const restoredAnswers = (
      savedAns.isSilence
        ? []
        : savedAns.answerIds && savedAns.answerIds.length > 0
          ? savedAns.answerIds
          : savedAns.answerId && savedAns.answerId !== "skipped"
            ? [savedAns.answerId]
            : []
      // A payload written before the cap existed could carry more than three;
      // slice here so the counter can never read "5 / 3".
    ).slice(0, MAX_MULTI_SELECT);

    setSelectedAnswers(restoredAnswers);
    setCertainty(savedAns.certainty);
    setTolerance(savedAns.tolerance);
    setIsSilenceSelected(savedAns.isSilence);
    setSilenceType(savedAns.silenceType || null);
    // Legacy saves predate the field and could only have used the rail.
    setSilenceSource(savedAns.isSilence ? (savedAns.silenceSource ?? "rail") : null);
    // A saved question with several answers can only be edited (or even read
    // honestly) in multi-select, so the mode follows the data here. Every other
    // question restores as single-choice.
    setMultiSelectEnabled(restoredAnswers.length > 1);
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
        backgroundColor: "#ffffff",
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
        backgroundColor: "#ffffff",
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
        handleToggleAnswer(displayAnswers[numKey - 1].id);
        return;
      }
      
      if (e.key === "Enter" && (selectedAnswers.length > 0 || isSilenceSelected)) {
        e.preventDefault();
        handleNext();
        return;
      }

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        handleNoneOfTheAbove();
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
  }, [currentView, displayAnswers, selectedAnswers, isSilenceSelected, multiSelectEnabled, silenceSource]);


  // One definition, four return branches. This prop list was pasted into each
  // of them, so adding one meant remembering all four.
  const modals = (
    <Modals
      showBackModal={showBackModal}
      showDevModal={showDevModal}
      showRestartModal={showRestartModal}
      showMultiSelectModal={showMultiSelectModal}
      onCloseMultiSelectModal={() => setShowMultiSelectModal(false)}
      onConfirmMultiSelect={handleEnableMultiSelect}
      devCode={devCode}
      onUnlockDevTools={() => {
        setShowRestartModal(false);
        setShowDevModal(true);
      }}
      onCloseBackModal={() => setShowBackModal(false)}
      onCloseDevModal={() => setShowDevModal(false)}
      onCloseRestartModal={() => {
        setShowRestartModal(false);
        setDevCode("");
      }}
      onConfirmBack={handleConfirmBack}
      onConfirmDev={handleConfirmDev}
      onConfirmRestart={handleConfirmRestart}
      onDevDenomFill={handleDevDenomFill}
      onSetDevCode={setDevCode}
      backContext={currentView === "results" ? "results" : "progress"}
      onSaveAndLeave={handleSaveResultsAndLeave}
      onDiscardAndLeave={handleDiscardResultsAndLeave}
    />
  );

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
      <div className="min-h-screen bg-paper flex flex-col font-sans text-ink">
        <PageHeader
          showRestart={false}
          onLogoClick={() => setShowBackModal(true)}
          onTitleClick={() => setShowBackModal(true)}
          onBackClick={() => setShowBackModal(true)}
          onRestartClick={() => setShowRestartModal(true)}
        />

        {modals}
        <main id="main-content" className="flex-grow flex flex-col items-center justify-center p-6 max-w-4xl mx-auto animate-fade-in-up">
          <span className="meta">TheoCompass · {APP_STAGE}</span>
          <h1 className="font-display text-3xl md:text-4xl mt-2 mb-3 text-center text-ink">
            How deep do you want to go?
          </h1>
          <p className="text-ink-soft mb-8 text-center max-w-xl text-sm leading-relaxed">
            30 to 120 questions on the doctrines that separate traditions. Progress
            is saved automatically.
          </p>

          <ModeSelectCards savedMode={savedMode} onSelectQuick={() => startInstructions("quick")} />
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: INSTRUCTIONS
  // ==========================================
  if (currentView === "instructions") {
    const demoAtCap = demoMultiSelect && demoPicks.length >= MAX_MULTI_SELECT;

    const steps = [
      {
        title: "Select your Stance",
        color: "text-ink",
        content: (
          <div>
            <p className="text-sm text-ink-soft mb-4">Choose the answer that best represents your view. Tap <strong className="text-cerulean-900">Context</strong> for a detailed definition.</p>
            
            <div className="border border-rule bg-paper px-3 py-2.5">
              <div className="flex justify-between items-center">
                <span className="font-medium text-accent-deep">Example: Transubstantiation</span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setDemoInfoOpen(!demoInfoOpen); }}
                  aria-expanded={demoInfoOpen}
                  className={`flex shrink-0 items-center gap-1.5 border px-2 py-2 text-2xs font-medium transition-colors ${
                    demoInfoOpen
                      ? "border-cerulean-900 bg-cerulean-900 text-white"
                      : "border-rule bg-paper-raised text-ink-muted"
                  }`}
                >
                  <Info aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="whitespace-nowrap">{demoInfoOpen ? "Hide" : "Context"}</span>
                </button>
              </div>
              
              {demoInfoOpen && (
                <div className="mt-2 border border-cerulean-200 bg-cerulean-50 px-3 py-2 text-xs leading-relaxed text-ink-soft">
                  <span className="meta block">Further context</span>
                  The bread and wine become the actual body and blood of Christ during the Eucharist, while maintaining their physical appearances.
                </div>
              )}
            </div>
            
            <p className="text-xs text-ink-muted mt-2">
              The same <strong className="text-cerulean-900 font-medium">Context</strong> button sits on every answer during the quiz.
            </p>
          </div>
        ),
      },
      /* Hand-mirrored from `QuizQuestionView` so the reader meets the real
         control before the quiz. Keep the wording in step with the mode bar:
         if one says "Tick up to 3", so must the other. Fixture options only --
         `demoPicks` never reaches `userAnswers`. */
      {
        title: "Hold more than one?",
        color: "text-accent",
        content: (
          <div>
            <p className="text-sm text-ink-soft mb-4">
              One answer is the rule. When a question genuinely sits between positions,
              opt in for <strong className="text-cerulean-900">that question only</strong> —
              a short confirm appears first.
            </p>

            <div className="border border-rule bg-paper px-3 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-2xs leading-snug text-ink-muted">
                {demoMultiSelect ? (
                  <>
                    <span>
                      Tick up to {MAX_MULTI_SELECT} options you affirm — this question only.
                    </span>
                    <span className="shrink-0 border border-cerulean-300 bg-cerulean-50 px-1.5 py-0.5 font-semibold text-cerulean-900">
                      <span className="num">{demoPicks.length}</span>
                      <span className="num"> / {MAX_MULTI_SELECT}</span> selected
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setDemoMultiSelect(false);
                        setDemoPicks(prev => prev.slice(0, 1));
                      }}
                      className="shrink-0 underline decoration-dotted underline-offset-2 transition-colors hover:text-ink"
                    >
                      Back to one
                    </button>
                  </>
                ) : (
                  <>
                    <span>Pick the one option closest to what you hold.</span>
                    <button
                      type="button"
                      onClick={() => setDemoMultiSelect(true)}
                      className="shrink-0 border border-rule-strong bg-paper-raised px-1.5 py-0.5 font-semibold text-cerulean-800 transition-colors hover:border-cerulean-400 hover:bg-cerulean-50"
                    >
                      Hold more than one?
                    </button>
                  </>
                )}
              </div>

              <div className="mt-3 flex flex-col gap-2">
                {DEMO_OPTIONS.map((opt) => {
                  const isPicked = demoPicks.includes(opt.id);
                  const isBlocked = demoAtCap && !isPicked;

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={isPicked}
                      aria-disabled={isBlocked}
                      onClick={() => {
                        // Same rules as the quiz: one answer replaces, several accumulate.
                        if (!demoMultiSelect) {
                          setDemoPicks([opt.id]);
                          return;
                        }
                        setDemoPicks(prev => {
                          if (prev.includes(opt.id)) return prev.filter(id => id !== opt.id);
                          if (prev.length >= MAX_MULTI_SELECT) return prev;
                          return [...prev, opt.id];
                        });
                      }}
                      className={`flex items-start gap-2.5 border px-2.5 py-2.5 text-left transition-colors ${
                        isPicked
                          ? "border-cerulean-600 bg-cerulean-50 ring-1 ring-cerulean-600"
                          : isBlocked
                            ? "cursor-not-allowed border-rule bg-paper-raised"
                            : "border-rule bg-paper-raised hover:border-cerulean-400 hover:bg-cerulean-50/60"
                      } ${isBlocked ? "opacity-40" : ""}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border-2 transition-colors ${
                          demoMultiSelect ? "rounded-[3px]" : "rounded-full"
                        } ${
                          isPicked ? "border-cerulean-600 bg-cerulean-600" : "border-rule-strong"
                        }`}
                      >
                        {isPicked && (
                          <Check className="h-2.5 w-2.5 animate-tick-pop text-white" strokeWidth={3} />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-mini font-medium leading-tight text-ink">
                          {opt.label}
                        </span>
                        <span className="mt-0.5 block text-2xs leading-snug text-ink-muted">
                          {opt.desc}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {demoAtCap && (
                <p className="mt-1.5 text-2xs leading-snug text-ink-muted">
                  {MAX_MULTI_SELECT} is the limit — untick one to choose another.
                </p>
              )}
            </div>

            <p className="text-xs text-ink-muted mt-2">
              A wide selection is scored as a spread, not a sharper position, and the mode
              resets on the next question.
            </p>
          </div>
        ),
      },
      {
        title: "Set your Certainty",
        color: "text-accent",
        content: (
          <div>
            <p className="text-sm text-ink-soft mb-4">How confident are you in this specific belief?</p>
            <div className="mt-1 border border-rule bg-paper px-3 py-3 pointer-events-none select-none">
              <AxisSlider
                legend="Certainty"
                labels={["Not Sure", "Leaning", "Pretty Sure", "Certain"]}
                shortLabels={["Not sure", "Leaning", "Pretty sure", "Certain"]}
                value={2}
                onChange={() => {}}
              />
            </div>
          </div>
        ),
      },
      {
        title: "Set Tolerance",
        color: "text-accent",
        content: (
          <div>
            <p className="text-sm text-ink-soft mb-4">How many of the other options do you consider valid? This affects how exclusive your match is.</p>
            <div className="mt-1 border border-rule bg-paper px-3 py-3 pointer-events-none select-none">
              <AxisSlider
                legend="How many views are acceptable?"
                labels={["None Valid", "None for Fellowship", "A Few Valid", "Most Valid", "All Valid"]}
                shortLabels={["None", "No fellowship", "A few", "Most", "All"]}
                value={2}
                onChange={() => {}}
              />
              <p className="mt-2 text-2xs leading-snug text-ink-muted">
                A few other options are valid, but require theological discernment.
              </p>
            </div>
          </div>
        ),
      },
      {
        title: "When nothing fits",
        color: "text-ink",
        content: (
          <div>
            <p className="text-sm text-ink-soft mb-4">
              Three ways to say a question misses you. They are not interchangeable, so
              pick the one that is actually true — the first lives in the answer list,
              the other two are declared underneath it.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="border border-rule bg-paper px-3 py-2.5">
                <span className="meta block">In the list</span>
                <span className="mt-0.5 block text-mini font-medium text-ink">
                  None of the above
                </span>
                <p className="mt-0.5 text-2xs leading-snug text-ink-muted">
                  The question applies to you, but no option is what you hold.
                </p>
              </div>
              <div className="border border-rule bg-paper px-3 py-2.5">
                <span className="meta block">Silence</span>
                <span className="mt-0.5 block text-mini font-medium text-ink">
                  Apathetic silence
                </span>
                <p className="mt-0.5 text-2xs leading-snug text-ink-muted">
                  The topic itself is not relevant to you. A soft, neutral stance.
                </p>
              </div>
              <div className="border border-punch-300 bg-punch-soft px-3 py-2.5">
                <span className="meta block">Silence</span>
                <span className="mt-0.5 block text-mini font-medium text-punch-ink">
                  Hostile silence
                </span>
                <p className="mt-0.5 text-2xs leading-snug text-ink-soft">
                  You reject the premise itself. Penalises traditions that affirm it.
                </p>
              </div>
            </div>
            <p className="text-xs text-ink-muted mt-2">
              Either silence skips the sliders, so nothing has to be faked to move on.
            </p>
          </div>
        ),
      },
    ];

    const totalSteps = steps.length;
    
    return (
      <div className="min-h-screen bg-paper flex flex-col font-sans text-ink">
        <PageHeader
          showRestart={false}
          onLogoClick={() => setShowBackModal(true)}
          onTitleClick={() => setShowBackModal(true)}
          onBackClick={() => setShowBackModal(true)}
          onRestartClick={() => setShowRestartModal(true)}
        />
        {modals}
       <main id="main-content" className="mx-auto flex w-full max-w-[56rem] flex-grow flex-col px-4 py-6 md:px-8 md:py-10 animate-fade-in">
          <div className="border border-rule bg-paper-raised px-4 py-6 sm:px-8 sm:py-8">
            <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-tight text-ink">How to navigate the quiz</h1>
            <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-ink-soft">
              TheoCompass measures not just <em>what</em> you believe, but <em>how</em> you hold those beliefs.
            </p>
            
            <div className="mt-5 flex items-center gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTutorialStep(i)}
                  className={`h-[3px] transition-all ${
                    i === tutorialStep ? "w-6 bg-cerulean-900" : "w-3 bg-rule-strong hover:bg-ink-muted"
                  }`}
                  aria-label={`Step ${i + 1}`}
                />
              ))}
            </div>
            
            <div className="mb-4 min-h-[150px] border border-rule bg-paper px-3.5 py-4 animate-fade-in-up" key={tutorialStep}>
              <div className="flex items-center gap-2 mb-3">
                <span className="num flex h-5 min-w-5 items-center justify-center bg-cerulean-900 px-1 font-mono text-3xs font-bold text-white">
                  {tutorialStep + 1}
                </span>
                <h3 className={`font-display text-base leading-tight ${steps[tutorialStep].color}`}>{steps[tutorialStep].title}</h3>
              </div>
              {steps[tutorialStep].content}
            </div>
            
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setTutorialStep(Math.max(0, tutorialStep - 1))}
                disabled={tutorialStep === 0}
                className={`text-sm font-medium transition-colors ${
                  tutorialStep === 0 ? "text-rule-strong cursor-not-allowed" : "text-ink-soft hover:text-accent"
                }`}
              >
                ← Previous
              </button>
              <span className="text-xs text-ink-muted font-medium">
                Step {tutorialStep + 1} of {totalSteps}
              </span>
              <button
                type="button"
                onClick={() => setTutorialStep(Math.min(totalSteps - 1, tutorialStep + 1))}
                disabled={tutorialStep === totalSteps - 1}
                className={`text-sm font-medium transition-colors ${
                  tutorialStep === totalSteps - 1 ? "text-rule-strong cursor-not-allowed" : "text-ink-soft hover:text-accent"
                }`}
              >
                Next →
              </button>
            </div>

            {error && (
              <div className="mb-3 flex items-center justify-between border border-punch-300 bg-punch-soft px-3 py-2 text-xs text-punch-ink">
                <span>{error}</span>
                <button onClick={() => startInstructions(selectedMode!)} className="ml-4 underline font-bold whitespace-nowrap">Try Again</button>
              </div>
            )}

            <div className="mb-3 flex items-start gap-2 border border-rule bg-muted-soft px-3 py-2 text-2xs leading-snug text-ink-soft">
              
              <span><span className="font-semibold">During the quiz:</span> Press <kbd className="inline-block border border-rule-strong bg-paper-raised px-1 font-mono font-bold text-3xs min-w-[18px] text-center">1</kbd>–<kbd className="inline-block border border-rule-strong bg-paper-raised px-1 font-mono font-bold text-3xs min-w-[18px] text-center">4</kbd> to select (they toggle while multi-select is on), <kbd className="inline-block border border-rule-strong bg-paper-raised px-1 font-mono font-bold text-3xs">Enter</kbd> to confirm, <kbd className="inline-block border border-rule-strong bg-paper-raised px-1 font-mono font-bold text-3xs">N</kbd> for none of the above, <kbd className="inline-block border border-rule-strong bg-paper-raised px-1 font-mono font-bold text-3xs">S</kbd> / <kbd className="inline-block border border-rule-strong bg-paper-raised px-1 font-mono font-bold text-3xs">H</kbd> for silence.</span>
            </div>

            <button 
              onClick={startQuiz} 
              disabled={isLoading || !!error || tutorialStep < totalSteps - 1}
              className={`mt-2 w-full px-5 py-2.5 text-sm font-medium transition-colors ${
                isLoading || error ? "bg-rule text-ink-muted cursor-not-allowed" : 
                tutorialStep < totalSteps - 1 ? "bg-rule text-ink-muted cursor-not-allowed" :
                "bg-accent hover:bg-accent-deep text-white"
              }`}
            >
              {isLoading ? "Loading Database..." : 
               error ? "Database Error" : 
               tutorialStep < totalSteps - 1 ? `Review all ${totalSteps} steps to continue →` : 
               "Start Quiz"}
            </button>
            
            {skipConfirm ? (
              <div className="flex items-center justify-center gap-2 mt-3">
                <span className="text-xs text-ink-muted">Skip tutorial?</span>
                <button
                  type="button"
                  onClick={() => { setSkipConfirm(false); startQuiz(); }}
                  disabled={isLoading || !!error}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isLoading || error ? "bg-rule text-ink-muted cursor-not-allowed" : "bg-cerulean-100 text-cerulean-900 hover:bg-cerulean-200"
                  }`}
                >
                  Yes, skip
                </button>
                <button
                  type="button"
                  onClick={() => setSkipConfirm(false)}
                  className="text-xs text-ink-muted hover:text-ink-soft underline"
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
                  isLoading || error ? "text-rule-strong cursor-not-allowed" : "text-ink-muted hover:text-accent"
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
      certainty: userCertainty,
    };

    return (
      <div className="min-h-screen bg-paper flex flex-col font-sans text-ink relative overflow-x-hidden">
        {/* HIDDEN EXPORT CARDS */}
        <ExportCard
          ref={exportRef}
          results={results}
          familyMatches={familyMatches}
          userCoords={userCoords}
          userTolerance={userTolerance}
          userCertainty={userCertainty}
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
          userCertainty={userCertainty}
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
        {modals}

        <ResultsDashboard
          results={results}
          familyMatches={familyMatches}
          userCoords={userCoords}
          userTolerance={userTolerance}
          userCertainty={userCertainty}
          userLabels={userLabels}
          selectedMode={selectedMode}
          isCalculating={isCalculating}
          showSpecific={showSpecific}
          compareDenomId={compareDenomId}
          expandedAxis={expandedAxis}
          collapsedCategories={collapsedCategories}
          allCoordinates={allCoordinates}
          isExporting={isExporting}
          isExportingLabels={isExportingLabels}
          isExportingFingerprint={isExportingFingerprint}
          activeOnly={activeOnly}
          onSetActiveOnly={setActiveOnly}
          onSetShowSpecific={setShowSpecific}
          onSetCompareDenomId={setCompareDenomId}
          onSetExpandedAxis={setExpandedAxis}
          onSetCollapsedCategories={setCollapsedCategories}
          onDownloadImage={handleDownloadImage}
          onDownloadLabels={handleDownloadLabels}
          onDownloadFingerprint={handleDownloadFingerprint}
          onRetake={() => setShowRestartModal(true)}
        />

        {/* GLOBAL FOOTER */}
        <footer className="mt-auto w-full border-t border-rule bg-paper py-8 px-6 text-center">
          <div className="mx-auto flex max-w-3xl flex-col items-center">
            <p className="mb-5 max-w-md font-serif text-base italic leading-relaxed text-ink-soft">
              “He is before all things, and in him all things hold together.”
              <span className="mt-1 block text-xs not-italic text-ink-muted">
                Colossians 1:17
              </span>
            </p>
            <div className="meta flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <a href="https://theocompass.com" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-ink">TheoCompass.com</a>
              <a href="https://www.reddit.com/r/TheoCompass" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-ink">r/TheoCompass</a>
              <a href="https://ko-fi.com/oroq" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-accent">Support on Ko-fi</a>
              <a href="mailto:theocompass.project@gmail.com" className="transition-colors hover:text-ink">Contact</a>
            </div>
            <div className="mt-6 space-y-1 border-t border-rule pt-4 text-2xs text-ink-muted">
              <p>Built for informed decisions, not persuasion.</p>
              <p>© 2026 Oroq / TheoCompass Project</p>
            </div>
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
    <div className="min-h-screen bg-paper flex flex-col font-sans text-ink">
      <PageHeader
        showRestart={true}
        onLogoClick={() => setShowBackModal(true)}
        onTitleClick={() => setShowBackModal(true)}
        onBackClick={() => setShowBackModal(true)}
        onRestartClick={() => setShowRestartModal(true)}
      />
      
      {modals}

      {showSaveToast && (
        <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 pointer-events-none">
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 border border-rule-strong bg-paper-raised px-3 py-1.5 text-xs font-medium text-ink animate-scale-in-out"
          >
            <svg className="h-3.5 w-3.5 text-sage" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
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
        selectedAnswers={selectedAnswers}
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
        quizAnimDir={quizAnimDir}
        userAnswers={userAnswers}
        multiSelectEnabled={multiSelectEnabled}
        maxSelections={MAX_MULTI_SELECT}
        noneOfAboveSelected={
          isSilenceSelected && silenceType === "apathetic" && silenceSource === "answer-none"
        }
        apatheticSilenceSelected={
          isSilenceSelected && silenceType === "apathetic" && silenceSource !== "answer-none"
        }
        onToggleAnswer={handleToggleAnswer}
        onToggleInfo={toggleInfo}
        onSilenceClick={handleSilenceClick}
        onSelectNone={handleNoneOfTheAbove}
        onOpenMultiSelectMode={() => setShowMultiSelectModal(true)}
        onDisableMultiSelect={handleDisableMultiSelect}
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