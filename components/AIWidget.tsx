
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WidgetState, EstimateTask, EstimationResult, BusinessConfig, LeadGenConfig } from '../types';
import { getEstimate, dispatchResendQuote } from '../services/geminiService';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';

interface Props {
  config: BusinessConfig;
}

const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    back: 'Back',
    next: 'Next',
    getEstimate: 'Calculate Cost',
    confirmQuote: 'Secure My Quote',
    newRequest: 'Start New',
    zipCode: 'Zip Code',
    urgency: 'Timing',
    placeholder: 'Describe the project in detail...',
    voiceStart: 'Speak to Agent',
    voiceListening: 'Listening...',
    voiceSpeaking: 'AI Speaking...',
    labor: 'Labor',
    parts: 'Parts',
    time: 'Timeline',
    submitGetQuote: 'Request Booking',
  },
  es: {
    back: 'Volver',
    next: 'Siguiente',
    getEstimate: 'Calcular Costo',
    confirmQuote: 'Asegurar Cotización',
    newRequest: 'Nuevo',
    zipCode: 'Código Postal',
    urgency: 'Urgencia',
    placeholder: 'Describa el proyecto en detalle...',
    voiceStart: 'Hablar con Agente',
    voiceListening: 'Escuchando...',
    voiceSpeaking: 'Hablando...',
    labor: 'Mano de obra',
    parts: 'Materiales',
    time: 'Tiempo',
    submitGetQuote: 'Solicitar Reserva',
  }
};

const formatCurrency = (amount: number, locale: string = 'en-US') => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
};

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

const AIWidget: React.FC<Props> = ({ config }) => {
  const [state, setState] = useState<WidgetState>(WidgetState.CLOSED);
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [language, setLanguage] = useState(config.defaultLanguage || 'en');
  const [task, setTask] = useState<EstimateTask>({ description: '', urgency: 'within-3-days', zipCode: '' });
  const [result, setResult] = useState<EstimationResult | null>(null);
  const [selectedUpsells, setSelectedUpsells] = useState<string[]>([]);
  const [loadingMessage, setLoadingMessage] = useState('Agent thinking...');
  const [leadFormStep, setLeadFormStep] = useState(0);
  const [leadInfo, setLeadInfo] = useState<Record<string, string>>({});

  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);

  const t = UI_TRANSLATIONS[language] || UI_TRANSLATIONS['en'];

  const toggleWidget = () => {
    const newState = state === WidgetState.CLOSED ? WidgetState.IDLE : WidgetState.CLOSED;
    setState(newState);
    if (newState === WidgetState.CLOSED) stopVoice();
  };

  const stopVoice = () => {
    setIsVoiceActive(false);
    setIsAiSpeaking(false);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    sessionRef.current = null;
  };

  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setIsVoiceActive(true);
      // Correct initialization using process.env.API_KEY directly
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64 = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64) {
              setIsAiSpeaking(true);
              const ctx = audioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(base64), ctx, 24000, 1);
              const s = ctx.createBufferSource();
              s.buffer = buffer;
              s.connect(ctx.destination);
              s.addEventListener('ended', () => {
                sourcesRef.current.delete(s);
                if (sourcesRef.current.size === 0) setIsAiSpeaking(false);
              });
              s.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(s);
            }
          },
        },
        config: { 
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are a helpful estimator for ${config.name}. Pricing logic: ${config.pricingRules}. Keep it professional and helpful.`
        }
      });
      sessionRef.current = sessionPromise;
    } catch (e) { alert("Mic required for voice mode."); stopVoice(); }
  };

  const handleEstimate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!task.description || !task.zipCode) return;
    setState(WidgetState.LOADING);
    try {
      const res = await getEstimate(task, config);
      setResult(res);
      setSelectedUpsells(res.suggestedUpsellIds || []);
      setState(WidgetState.RESULT);
    } catch (err) { alert("Error calculating estimate."); setState(WidgetState.IDLE); }
  };

  const totalCost = useMemo(() => {
    if (!result) return '';
    let extra = 0;
    (config.curatedRecommendations || []).forEach(u => {
      if (selectedUpsells.includes(u.id)) {
        const val = parseFloat(u.suggestedPrice.replace(/[^0-9.]/g, ''));
        if (!isNaN(val)) extra += val;
      }
    });
    const min = (result.baseMinCost || 0) + extra;
    const max = (result.baseMaxCost || 0) + extra;
    return max > min ? `${formatCurrency(min)} - ${formatCurrency(max)}` : formatCurrency(min);
  }, [result, selectedUpsells, config.curatedRecommendations]);

  const leadSteps = useMemo(() => {
    const fields = (Object.keys(config.leadGenConfig.fields) as Array<keyof LeadGenConfig['fields']>)
      .filter(k => config.leadGenConfig.fields[k].visible);
    const groups = [];
    for (let i = 0; i < fields.length; i += 2) groups.push(fields.slice(i, i + 2));
    return groups.length > 0 ? groups : [[]];
  }, [config.leadGenConfig.fields]);

  const primary = config.primaryColor || '#6366f1';

  return (
    <div className="fixed bottom-6 right-6 z-[2147483647] flex flex-col items-end">
      <AnimatePresence>
        {state !== WidgetState.CLOSED && (
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="w-[380px] sm:w-[420px] max-h-[85vh] bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col mb-4">
            <div style={{ backgroundColor: primary }} className="p-6 text-white shrink-0">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center space-x-3">
                  <img src={config.profilePic} className="w-12 h-12 rounded-full border-2 border-white object-cover" />
                  <div>
                    <h3 className="font-black text-lg leading-none truncate max-w-[150px]">{config.headerTitle}</h3>
                    <p className="text-white/70 text-[10px] uppercase font-bold tracking-widest mt-1">{config.headerSubtitle}</p>
                  </div>
                </div>
                <button onClick={toggleWidget} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex bg-black/10 p-1 rounded-xl">
                <button onClick={() => { stopVoice(); setMode('text'); }} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'text' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/70'}`}>Text Agent</button>
                <button onClick={() => setMode('voice')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'voice' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/70'}`}>Voice Agent</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-[#fcfdfe] no-scrollbar">
              <AnimatePresence mode="wait">
                {mode === 'voice' ? (
                  <motion.div key="voice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center py-10 text-center space-y-8">
                     <div className={`w-32 h-32 rounded-full flex items-center justify-center shadow-xl transition-all duration-500 ${isVoiceActive ? 'scale-110 shadow-indigo-200' : ''}`} style={{ backgroundColor: isVoiceActive ? primary : '#e2e8f0' }}>
                        <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center transition-colors ${isAiSpeaking ? 'border-white animate-pulse' : 'border-white/20'}`}>
                           <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                        </div>
                     </div>
                     <h4 className="text-xl font-black text-slate-800 tracking-tight">{isAiSpeaking ? t.voiceSpeaking : isVoiceActive ? t.voiceListening : t.voiceStart}</h4>
                     {!isVoiceActive && <button onClick={startVoice} style={{ backgroundColor: primary }} className="px-10 py-4 rounded-full text-white font-black text-xs uppercase tracking-widest shadow-xl">Activate Mic</button>}
                  </motion.div>
                ) : (
                  <>
                    {state === WidgetState.IDLE && (
                      <motion.form key="idle" onSubmit={handleEstimate} className="space-y-4">
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Project Details</label>
                           <textarea required value={task.description} onChange={e => setTask({...task, description: e.target.value})} className="w-full p-4 rounded-2xl border border-slate-200 text-sm h-32 shadow-inner outline-none focus:ring-2" style={{ '--tw-ring-color': primary } as any} placeholder={t.placeholder} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.zipCode}</label>
                              <input required value={task.zipCode} onChange={e => setTask({...task, zipCode: e.target.value})} className="w-full p-3 border rounded-xl text-sm" placeholder="00000" />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.urgency}</label>
                              <select value={task.urgency} onChange={e => setTask({...task, urgency: e.target.value as any})} className="w-full p-3 border rounded-xl text-sm bg-white">
                                 <option value="within-3-days">3 Days</option>
                                 <option value="same-day">ASAP</option>
                                 <option value="flexible">Flexible</option>
                              </select>
                           </div>
                        </div>
                        <button type="submit" style={{ backgroundColor: primary }} className="w-full py-4 text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all">{t.getEstimate}</button>
                      </motion.form>
                    )}

                    {state === WidgetState.LOADING && (
                      <div className="py-20 flex flex-col items-center justify-center space-y-6">
                        <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin" style={{ borderTopColor: primary }}></div>
                        <p className="font-black text-slate-600 animate-pulse">Running Calculations...</p>
                      </div>
                    )}

                    {state === WidgetState.RESULT && result && (
                      <motion.div key="result" className="space-y-6">
                        {/* Fix: Merged multiple style attributes into one to resolve JSX error */}
                        <div style={{ backgroundColor: primary + '10', borderColor: primary + '20' }} className="p-8 rounded-[2rem] text-center border-2">
                           <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: primary }}>Estimated Range</p>
                           <p className="text-4xl font-black" style={{ color: primary }}>{totalCost}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                           {['labor', 'parts', 'time'].map(k => (
                             <div key={k} className="bg-white p-3 rounded-2xl border flex flex-col items-center text-center">
                                <span className="text-[9px] font-black uppercase text-slate-400 mb-1">{t[k]}</span>
                                <span className="text-[11px] font-black text-slate-800 leading-tight">{(result as any)[`${k}Estimate`]}</span>
                             </div>
                           ))}
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => setState(WidgetState.IDLE)} className="flex-1 py-4 border-2 rounded-2xl text-xs font-black text-slate-400">{t.back}</button>
                           <button onClick={() => setState(WidgetState.LEAD_FORM)} style={{ backgroundColor: primary }} className="flex-[2] py-4 text-white font-black rounded-2xl shadow-xl hover:brightness-110">{t.confirmQuote}</button>
                        </div>
                      </motion.div>
                    )}

                    {state === WidgetState.LEAD_FORM && (
                       <motion.div key="lead-form" className="space-y-6">
                          <div className="flex justify-between items-center mb-4">
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Final Step: Contact Info</span>
                             <span className="text-[10px] font-black text-slate-900">{leadFormStep + 1} / {leadSteps.length}</span>
                          </div>
                          <form onSubmit={(e) => {
                             e.preventDefault();
                             if (leadFormStep === leadSteps.length - 1) setState(WidgetState.SUCCESS);
                             else setLeadFormStep(prev => prev + 1);
                          }} className="space-y-4">
                             {leadSteps[leadFormStep].map(f => (
                               <div key={f} className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{f}</label>
                                  <input required={config.leadGenConfig.fields[f].required} value={leadInfo[f] || ''} onChange={e => setLeadInfo({...leadInfo, [f]: e.target.value})} className="w-full p-4 border rounded-2xl shadow-sm outline-none focus:ring-2" style={{ '--tw-ring-color': primary } as any} />
                               </div>
                             ))}
                             <div className="flex gap-2 pt-4">
                                <button type="button" onClick={() => leadFormStep === 0 ? setState(WidgetState.RESULT) : setLeadFormStep(prev => prev - 1)} className="flex-1 py-4 border-2 rounded-2xl text-xs font-black text-slate-400">{t.back}</button>
                                <button type="submit" style={{ backgroundColor: primary }} className="flex-[2] py-4 text-white font-black rounded-2xl shadow-xl hover:brightness-110">{leadFormStep === leadSteps.length - 1 ? 'Book Appointment' : t.next}</button>
                             </div>
                          </form>
                       </motion.div>
                    )}

                    {state === WidgetState.SUCCESS && (
                      <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
                        <div className="w-20 h-20 rounded-full bg-green-100 text-green-600 flex items-center justify-center shadow-lg">
                           <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h4 className="text-2xl font-black">Request Sent!</h4>
                        <p className="text-slate-500 text-sm max-w-[240px]">We've received your request and will reach out shortly.</p>
                        <button onClick={() => { setState(WidgetState.IDLE); setLeadFormStep(0); }} style={{ backgroundColor: primary }} className="px-10 py-4 rounded-full text-white font-black text-xs uppercase tracking-widest shadow-xl">New Request</button>
                      </div>
                    )}
                  </>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={toggleWidget} style={{ backgroundColor: state === WidgetState.CLOSED ? primary : '#ffffff' }} className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl relative transition-all duration-300 transform active:scale-90 ${state === WidgetState.CLOSED ? 'text-white' : 'text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
        {state === WidgetState.CLOSED ? (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
        ) : <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>}
      </button>
    </div>
  );
};

export default AIWidget;
