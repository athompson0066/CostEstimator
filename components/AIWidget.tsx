
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WidgetState, EstimateTask, EstimationResult, BusinessConfig, LeadGenConfig, WidgetIconType, RecommendedService } from '../types';
import { getEstimate, dispatchResendQuote } from '../services/geminiService';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

interface Props {
  config: BusinessConfig;
}

// Simple translation map for widget UI
const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    back: 'Back',
    next: 'Next',
    getEstimate: 'Get Estimate',
    confirmQuote: 'Confirm Quote',
    newRequest: 'New Request',
    zipCode: 'Zip Code',
    urgency: 'Urgency',
    placeholder: 'What do you need help with?',
    voiceStart: 'Start Conversation',
    voiceListening: 'Listening...',
    voiceSpeaking: 'Crew Speaking...',
    labor: 'Labor',
    parts: 'Parts',
    time: 'Time',
    submitGetQuote: 'Submit & Get HTML Quote',
    selectService: 'Select a service...',
    within3Days: 'Within 3 Days',
    sameDay: 'Same Day',
    flexible: 'Flexible',
    stepInfo: 'Step {{current}} of {{total}}',
    recommendedUpgrades: 'Recommended Upgrades',
    baseEstimate: 'Base Estimate',
    totalWithUpgrades: 'Total with Upgrades',
    addedCost: 'Added Cost',
    language: 'Language',
    finalDetails: 'Final Details',
    date: 'Preferred Date',
    timeField: 'Preferred Time'
  },
  es: {
    back: 'Volver',
    next: 'Siguiente',
    getEstimate: 'Obtener Presupuesto',
    confirmQuote: 'Confirmar Presupuesto',
    newRequest: 'Nueva Solicitud',
    zipCode: 'Código Postal',
    urgency: 'Urgencia',
    placeholder: '¿En qué podemos ayudarte?',
    voiceStart: 'Iniciar Conversación',
    voiceListening: 'Escuchando...',
    voiceSpeaking: 'Equipo Hablando...',
    labor: 'Mano de obra',
    parts: 'Materiales',
    time: 'Tiempo',
    submitGetQuote: 'Enviar y Obtener Presupuesto HTML',
    selectService: 'Selecciona un servicio...',
    within3Days: 'En 3 días',
    sameDay: 'Mismo día',
    flexible: 'Flexible',
    stepInfo: 'Paso {{current}} de {{total}}',
    recommendedUpgrades: 'Mejoras Recomendadas',
    baseEstimate: 'Presupuesto Base',
    totalWithUpgrades: 'Total con Mejoras',
    addedCost: 'Costo Adicional',
    language: 'Idioma',
    finalDetails: 'Detalles Finales',
    date: 'Fecha Preferida',
    timeField: 'Hora Preferida'
  }
};

const LANGUAGES_LIST = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' },
];

// Formatting Helper
const formatCurrency = (amount: number, locale: string = 'en-US') => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
};

// Audio Utils
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const AIWidget: React.FC<Props> = ({ config }) => {
  const [state, setState] = useState<WidgetState>(WidgetState.CLOSED);
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [language, setLanguage] = useState(config.defaultLanguage || 'en');
  const [leadFormStep, setLeadFormStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [task, setTask] = useState<EstimateTask>({
    description: '',
    urgency: 'within-3-days',
    zipCode: '',
  });
  const [result, setResult] = useState<EstimationResult | null>(null);
  const [selectedUpsellIds, setSelectedUpsellIds] = useState<string[]>([]);
  const [loadingMessage, setLoadingMessage] = useState('Assembling Agent Crew...');
  const [loadingStage, setLoadingStage] = useState(0);
  const [leadInfo, setLeadInfo] = useState<Record<string, string>>({
    name: '',
    email: '',
    phone: '',
    city: '',
    company: '',
    notes: '',
    customField: '',
    serviceType: '',
    date: '',
    time: '',
  });

  // Voice States
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);

  const t = UI_TRANSLATIONS[language] || UI_TRANSLATIONS['en'];

  const availableLanguages = useMemo(() => {
    return LANGUAGES_LIST.filter(l => (config.supportedLanguages || ['en']).includes(l.code));
  }, [config.supportedLanguages]);

  const toggleWidget = () => {
    const newState = state === WidgetState.CLOSED ? WidgetState.IDLE : WidgetState.CLOSED;
    setState(newState);
    if (newState === WidgetState.CLOSED) {
      stopVoiceSession();
    }
    setLeadFormStep(0);
  };

  const stopVoiceSession = () => {
    setIsVoiceActive(false);
    setIsAiSpeaking(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current = null;
    }
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
  };

  const startVoiceSession = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsVoiceActive(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;
      streamRef.current = stream;

      const systemInstruction = `
        You are leading a voice-enabled "Crew" for ${config.name}.
        Industry: ${config.industry}.
        Core Services: ${config.services.join(', ')}.
        Pricing Rules: ${config.pricingRules}.
        
        IMPORTANT: The conversation language MUST be ${LANGUAGES_LIST.find(l => l.code === language)?.name || 'English'}.
        Your goal is to guide users through project requirements conversationally.
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setIsAiSpeaking(true);
              const ctx = audioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsAiSpeaking(false);
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }
          },
          onerror: (e) => console.error("Crew Error", e),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
        }
      });
      sessionRef.current = sessionPromise;
    } catch (err: any) {
      alert("Could not activate agent crew.");
    }
  };

  const handleEstimate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!task.description || !task.zipCode) return;
    setState(WidgetState.LOADING);
    const messages = ['Visual Inspector scanning...', 'Pricing Analyst calculating...', 'Orchestrator finalizing...'];
    let i = 0;
    const interval = setInterval(() => { i++; setLoadingMessage(messages[i % messages.length]); }, 1800);
    try {
      const est = await getEstimate({ ...task, language }, config);
      setResult(est);
      setSelectedUpsellIds([]);
      setState(WidgetState.RESULT);
    } catch (error) {
      alert('Crew failed to estimate.');
      setState(WidgetState.IDLE);
    } finally {
      clearInterval(interval);
    }
  };

  const activeUpsells = useMemo(() => {
    if (!result) return [];
    return (config.curatedRecommendations || []).filter(r => r.isApproved);
  }, [result, config.curatedRecommendations]);

  const totalCostDisplay = useMemo(() => {
    if (!result) return { total: '', isRange: false };
    
    let additionalCost = 0;
    activeUpsells.forEach(u => {
      if (selectedUpsellIds.includes(u.id)) {
        const match = u.suggestedPrice.match(/(\d+(\.\d+)?)/);
        const price = match ? parseFloat(match[0]) : 0;
        additionalCost += price;
      }
    });

    let min = (result.baseMinCost || 0) + additionalCost;
    let max = (result.baseMaxCost || 0) + additionalCost;

    if (max <= min || !result.baseMaxCost || result.baseMaxCost === 0) {
      return { total: formatCurrency(min), isRange: false };
    }
    
    return { total: `${formatCurrency(min)} - ${formatCurrency(max)}`, isRange: true };
  }, [result, selectedUpsellIds, activeUpsells]);

  const handleLeadSubmit = async () => {
    setState(WidgetState.LOADING);
    setLoadingMessage('Dispatching...');
    try {
      if (result) {
        const chosenNames = activeUpsells.filter(u => selectedUpsellIds.includes(u.id)).map(u => u.label);
        const updatedLeadInfo = { ...leadInfo };
        if (chosenNames.length > 0) {
          updatedLeadInfo.notes = (updatedLeadInfo.notes || '') + `\n\nChosen Upgrades: ${chosenNames.join(', ')}`;
        }
        await dispatchResendQuote(updatedLeadInfo, result, config);
      }
      setState(WidgetState.SUCCESS);
    } catch (err) {
      setState(WidgetState.SUCCESS);
    }
  };

  const resetWidget = () => {
    setTask({ description: '', urgency: 'within-3-days', zipCode: '' });
    setResult(null);
    setSelectedUpsellIds([]);
    setState(WidgetState.IDLE);
    setLeadFormStep(0);
  };

  const leadSteps = useMemo(() => {
    const fields = (Object.keys(config.leadGenConfig.fields) as Array<keyof LeadGenConfig['fields']>).filter(
      key => config.leadGenConfig.fields[key].visible
    );
    const groups = [];
    for (let i = 0; i < fields.length; i += 2) groups.push(fields.slice(i, i + 2));
    return groups.length > 0 ? groups : [[]];
  }, [config.leadGenConfig.fields]);

  const currentStepFields = leadSteps[leadFormStep] || [];
  const isLastStep = leadFormStep === leadSteps.length - 1;

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLastStep) handleLeadSubmit();
    else { setDirection(1); setLeadFormStep(prev => prev + 1); }
  };

  const handlePrevStep = () => {
    if (leadFormStep === 0) setState(WidgetState.RESULT);
    else { setDirection(-1); setLeadFormStep(prev => prev - 1); }
  };

  const handleQuickQuestion = (q: string) => {
    setTask({ ...task, description: q });
  };

  const primaryColor = config.primaryColor || '#ea580c';
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  };

  const toggleUpsell = (id: string) => {
    setSelectedUpsellIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const slideVariants = {
    initial: (direction: number) => ({
      x: direction > 0 ? 100 : -100,
      opacity: 0,
    }),
    animate: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -100 : 100,
      opacity: 0,
    }),
  };

  return (
    <div className="fixed bottom-6 right-6 z-[2147483647] flex flex-col items-end font-sans text-slate-900" style={{ '--primary-rgb': hexToRgb(primaryColor) } as any}>
      <AnimatePresence>
        {state !== WidgetState.CLOSED && (
          <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} className="w-[380px] sm:w-[420px] max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col mb-4">
            <div style={{ backgroundColor: primaryColor }} className="p-5 text-white shadow-md z-10">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0 relative">
                    <img src={config.profilePic} className="w-12 h-12 rounded-full border-2 border-white object-cover shadow-sm" />
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></span>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight truncate max-w-[150px]">{config.headerTitle}</h3>
                    <p className="text-white/80 text-[10px] font-medium tracking-wide uppercase">{config.headerSubtitle}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {availableLanguages.length > 1 && (
                    <div className="relative">
                      <select 
                        value={language} 
                        onChange={(e) => setLanguage(e.target.value)} 
                        className="bg-white/20 border-none rounded-lg text-[10px] font-bold py-1 pl-2 pr-6 appearance-none cursor-pointer text-white focus:ring-0 shadow-sm"
                      >
                        {availableLanguages.map(l => <option key={l.code} value={l.code} className="text-slate-900">{l.name}</option>)}
                      </select>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-80">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>
                  )}
                  <button onClick={toggleWidget} className="p-2 hover:bg-white/10 rounded-full transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
              </div>
              <div className="flex bg-black/10 p-1 rounded-xl">
                <button onClick={() => setMode('text')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'text' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/70'}`}>Text</button>
                <button onClick={() => setMode('voice')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'voice' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/70'}`}>Voice</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 flex flex-col relative">
              <AnimatePresence mode="wait">
                {mode === 'voice' ? (
                  <motion.div key="voice" className="flex-1 flex flex-col items-center justify-center text-center space-y-6 py-8">
                    <div className="w-32 h-32 rounded-full flex items-center justify-center relative z-10 shadow-xl transition-all" style={{ backgroundColor: isVoiceActive ? primaryColor : '#cbd5e1' }}>
                      <svg className="w-12 h-12 text-white relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </div>
                    <h4 className="text-xl font-black">{isAiSpeaking ? t.voiceSpeaking : isVoiceActive ? t.voiceListening : t.voiceStart}</h4>
                    {!isVoiceActive && <button onClick={startVoiceSession} style={{ backgroundColor: primaryColor }} className="px-8 py-3 rounded-full text-white font-bold text-sm shadow-lg hover:brightness-110">{t.voiceStart}</button>}
                  </motion.div>
                ) : (
                  <div className="flex-1 flex flex-col h-full overflow-x-hidden">
                    {state === WidgetState.IDLE && (
                      <motion.form key="idle" onSubmit={handleEstimate} className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t.placeholder}</label>
                          <div className="relative">
                            <textarea required value={task.description} onChange={(e) => setTask({ ...task, description: e.target.value })} className="w-full p-4 rounded-xl border border-slate-200 text-sm h-32 outline-none focus:ring-2" style={{ '--tw-ring-color': primaryColor } as any} />
                            {config.suggestedQuestions && config.suggestedQuestions.length > 0 && (
                              <div className="absolute bottom-2 left-2 right-2 flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                                {config.suggestedQuestions.map((q, idx) => (
                                  <button 
                                    key={idx} 
                                    type="button" 
                                    onClick={() => handleQuickQuestion(q)}
                                    className="whitespace-nowrap bg-white/90 border border-slate-100 shadow-sm rounded-full px-3 py-1 text-[9px] font-black text-slate-600 hover:bg-white hover:shadow-md transition-all active:scale-95"
                                  >
                                    {q}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t.zipCode}</label>
                            <input required type="text" value={task.zipCode} onChange={(e) => setTask({ ...task, zipCode: e.target.value })} className="w-full p-3 border rounded-xl" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t.urgency}</label>
                            <select value={task.urgency} onChange={(e) => setTask({ ...task, urgency: e.target.value as any })} className="w-full p-3 border rounded-xl appearance-none bg-white">
                              <option value="within-3-days">{t.within3Days}</option>
                              <option value="same-day">{t.sameDay}</option>
                              <option value="flexible">{t.flexible}</option>
                            </select>
                          </div>
                        </div>
                        <button type="submit" style={{ backgroundColor: primaryColor }} className="w-full text-white font-black py-4 rounded-xl shadow-lg hover:brightness-110">{t.getEstimate}</button>
                      </motion.form>
                    )}

                    {state === WidgetState.LOADING && (
                      <div className="flex-1 flex flex-col items-center justify-center py-10 space-y-6">
                        <div className="w-16 h-16 border-4 border-slate-100 border-t-orange-500 rounded-full animate-spin" style={{ borderTopColor: primaryColor }}></div>
                        <p className="font-black text-lg text-slate-800">{loadingMessage}</p>
                      </div>
                    )}

                    {state === WidgetState.RESULT && result && (
                      <motion.div key="result" className="space-y-5 flex-1 pb-4">
                        <div style={{ backgroundColor: primaryColor + '15' }} className="p-6 rounded-3xl text-center border border-slate-100 shadow-sm relative overflow-hidden group">
                           <div className="relative z-10">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: primaryColor }}>{selectedUpsellIds.length > 0 ? t.totalWithUpgrades : t.baseEstimate}</p>
                              <p className="text-4xl font-black" style={{ color: primaryColor }}>{totalCostDisplay.total}</p>
                           </div>
                        </div>

                        {activeUpsells.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t.recommendedUpgrades}</h4>
                            <div className="space-y-2">
                              {activeUpsells.map((u) => (
                                <div 
                                  key={u.id} 
                                  onClick={() => toggleUpsell(u.id)}
                                  className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${selectedUpsellIds.includes(u.id) ? 'bg-orange-50 border-orange-500' : 'bg-white border-orange-500/10 hover:border-orange-500/30'}`}
                                >
                                  <div className="flex-1 pr-4">
                                    <h5 className="text-xs font-black text-slate-800">{u.label}</h5>
                                    <p className="text-[10px] text-slate-500 leading-tight">{u.description}</p>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-xs font-black text-orange-600">+{u.suggestedPrice}</span>
                                    <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedUpsellIds.includes(u.id) ? 'bg-orange-600 border-orange-600' : 'border-slate-200'}`}>
                                      {selectedUpsellIds.includes(u.id) && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2">
                          {['labor', 'parts', 'time'].map(key => (
                            <div key={key} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center">
                              <p className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">{t[key]}</p>
                              <p className="text-[11px] font-black truncate w-full text-center">{(result as any)[`${key}Estimate`]}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 pt-2">
                           <button onClick={resetWidget} className="flex-1 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black text-slate-400">{t.back}</button>
                           <button onClick={() => setState(WidgetState.LEAD_FORM)} style={{ backgroundColor: primaryColor }} className="flex-[2] text-white font-black py-4 rounded-2xl shadow-lg hover:brightness-110">{t.confirmQuote}</button>
                        </div>
                      </motion.div>
                    )}

                    {state === WidgetState.LEAD_FORM && (
                      <motion.div key="lead-form" className="flex-1 flex flex-col h-full relative">
                        <div className="mb-8">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.finalDetails}</span>
                            <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{leadFormStep + 1} / {leadSteps.length}</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${((leadFormStep + 1) / leadSteps.length) * 100}%` }}
                              className="h-full"
                              style={{ backgroundColor: primaryColor }}
                            />
                          </div>
                        </div>

                        <form onSubmit={handleNextStep} className="flex-1 flex flex-col overflow-hidden relative">
                          <AnimatePresence mode="wait" custom={direction}>
                            <motion.div 
                              key={leadFormStep}
                              custom={direction}
                              variants={slideVariants}
                              initial="initial"
                              animate="animate"
                              exit="exit"
                              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                              className="flex-1 space-y-5"
                            >
                              {currentStepFields.map(f => (
                                <div key={f} className="space-y-1">
                                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                                     {f === 'customField' 
                                       ? (config.leadGenConfig.customFieldLabel || 'Field') 
                                       : f === 'time' ? (t.timeField || 'Time') : (t[f] || f.charAt(0).toUpperCase() + f.slice(1).replace(/([A-Z])/g, ' $1'))}
                                   </label>
                                   {f === 'serviceType' ? (
                                     <div className="relative group">
                                       <select
                                         required={config.leadGenConfig.fields[f].required}
                                         value={leadInfo[f]}
                                         onChange={(e) => setLeadInfo({...leadInfo, [f]: e.target.value})}
                                         className="w-full p-4 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 bg-white appearance-none transition-all group-hover:border-slate-300 shadow-sm"
                                         style={{ '--tw-ring-color': primaryColor } as any}
                                       >
                                         <option value="">{t.selectService}</option>
                                         {(config.services || []).map(service => (
                                           <option key={service} value={service}>{service}</option>
                                         ))}
                                       </select>
                                       <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                                       </div>
                                     </div>
                                   ) : (
                                     <input 
                                       required={config.leadGenConfig.fields[f].required} 
                                       type={f === 'email' ? 'email' : f === 'phone' ? 'tel' : f === 'date' ? 'date' : f === 'time' ? 'time' : 'text'} 
                                       value={leadInfo[f]} 
                                       onChange={(e) => setLeadInfo({...leadInfo, [f]: e.target.value})} 
                                       className="w-full p-4 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 transition-all hover:border-slate-300 shadow-sm" 
                                       style={{ '--tw-ring-color': primaryColor } as any} 
                                     />
                                   )}
                                </div>
                              ))}
                            </motion.div>
                          </AnimatePresence>

                          <div className="flex gap-3 pt-8 pb-4">
                              <button 
                                type="button" 
                                onClick={handlePrevStep} 
                                className="flex-1 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black text-slate-400 hover:bg-slate-50 transition-colors"
                              >
                                {t.back}
                              </button>
                              <button 
                                type="submit" 
                                style={{ backgroundColor: primaryColor }} 
                                className="flex-[2] text-white font-black py-4 rounded-2xl shadow-xl shadow-slate-200 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center space-x-2"
                              >
                                <span>{isLastStep ? t.submitGetQuote : t.next}</span>
                                {!isLastStep && (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                                )}
                              </button>
                           </div>
                        </form>
                      </motion.div>
                    )}

                    {state === WidgetState.SUCCESS && (
                      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
                         <motion.div 
                           initial={{ scale: 0 }}
                           animate={{ scale: 1 }}
                           transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                           className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-green-600 shadow-lg shadow-green-100"
                         >
                           <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                         </motion.div>
                         <div>
                           <h4 className="text-2xl font-black mb-2">Estimate Ready!</h4>
                           <p className="text-sm text-slate-500 max-w-[240px] mx-auto">We've sent the detailed project breakdown to your inbox.</p>
                         </div>
                         <button onClick={resetWidget} style={{ backgroundColor: primaryColor }} className="px-8 py-4 rounded-2xl text-white font-black text-sm shadow-xl hover:brightness-110 active:scale-[0.98] transition-all">{t.newRequest}</button>
                      </div>
                    )}
                  </div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={toggleWidget} style={{ backgroundColor: state === WidgetState.CLOSED ? primaryColor : '#ffffff' }} className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl relative group transform active:scale-95 transition-all ${state === WidgetState.CLOSED ? 'text-white' : 'text-slate-600 border'}`}>
        {state === WidgetState.CLOSED ? (
          <><div className="absolute -top-12 right-0 bg-slate-900 text-white text-[10px] font-black py-1.5 px-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl border border-white/10">{config.hoverTitle}<div className="absolute -bottom-1 right-6 w-2 h-2 bg-slate-900 rotate-45"></div></div>
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></>
        ) : <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>}
      </button>
    </div>
  );
};

export default AIWidget;
