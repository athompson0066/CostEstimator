
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BusinessConfig, SavedWidget, 
  AppTabType, ManualPriceItem, RecommendedService 
} from './types';
import AIWidget from './components/AIWidget';
import { 
  investigatorAgent, marketAnalystAgent, pricingStrategistAgent, copywriterAgent, getEstimate 
} from './services/geminiService';
import { 
  supabase, isSupabaseConfigured 
} from './services/supabaseClient';
import { GoogleGenAI } from "@google/genai";

const INITIAL_CONFIG: BusinessConfig = {
  name: '',
  industry: '',
  primaryColor: '#6366f1',
  headerTitle: 'AI Estimator',
  headerSubtitle: 'Get a quote in seconds',
  profilePic: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=256&h=256&auto=format&fit=crop',
  hoverTitle: 'Get Instant Quote',
  hoverTitleBgColor: '#0f172a',
  widgetIcon: 'calculator',
  services: [],
  locationContext: '',
  pricingRules: '',
  pricingKnowledgeBase: '',
  customAgentInstruction: 'You are a professional estimator.',
  googleSheetUrl: '',
  useSheetData: false,
  manualPriceList: [],
  curatedRecommendations: [],
  suggestedQuestions: [],
  intelligenceSources: [],
  leadGenConfig: {
    enabled: true,
    destination: 'email',
    targetEmail: '',
    resendApiKey: '',
    webhookUrl: '',
    slackWebhookUrl: '',
    twilioConfig: { accountSid: '', authToken: '', fromNumber: '', toNumber: '' },
    fields: {
      name: { visible: true, required: true },
      email: { visible: true, required: true },
      phone: { visible: true, required: true },
      city: { visible: true, required: false },
      company: { visible: false, required: false },
      notes: { visible: true, required: false },
      customField: { visible: false, required: false },
      serviceType: { visible: true, required: true },
      date: { visible: true, required: false },
      time: { visible: false, required: false },
    }
  },
  defaultLanguage: 'en',
  supportedLanguages: ['en'],
};

const App: React.FC = () => {
  const [config, setConfig] = useState<BusinessConfig>(INITIAL_CONFIG);
  const [activeTab, setActiveTab] = useState<AppTabType>('dashboard');
  const [urlToScan, setUrlToScan] = useState('');
  const [savedWidgets, setSavedWidgets] = useState<SavedWidget[]>([]);
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [loadingAgent, setLoadingAgent] = useState<string | null>(null);
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [csvInput, setCsvInput] = useState('');
  const [testPrompt, setTestPrompt] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const lastSyncedUrl = useRef<string>('');

  useEffect(() => {
    try {
      setCloudEnabled(isSupabaseConfigured());
    } catch (e) {
      console.warn("Cloud config check failed", e);
    }
    fetchWidgets();
  }, [cloudEnabled]);

  const fetchWidgets = async () => {
    let list: SavedWidget[] = [];
    if (cloudEnabled) {
      try {
        const { data, error } = await supabase.from('widgets').select('*').order('updated_at', { ascending: false });
        if (!error && data) list = data;
      } catch (e) { console.error("Cloud fetch error", e); }
    }
    
    const local = localStorage.getItem('estimate_ai_profiles');
    if (local) {
      try {
        const localList = JSON.parse(local);
        const merged = [...list];
        localList.forEach((lw: SavedWidget) => {
          if (!merged.find(mw => mw.id === lw.id)) merged.push(lw);
        });
        setSavedWidgets(merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
      } catch (e) { console.error("Local storage parse error", e); }
    } else {
      setSavedWidgets(list);
    }
  };

  const saveWidget = async () => {
    if (!config.name) return alert("Please run at least the Digital Investigator first.");
    const timestamp = new Date().toISOString();
    const widgetId = activeWidgetId || `local-${Date.now()}`;
    const newWidget: SavedWidget = {
      id: widgetId,
      user_id: 'local-user',
      name: config.name,
      config: { ...config },
      created_at: timestamp,
      updated_at: timestamp
    };

    const updatedWidgets = activeWidgetId 
      ? savedWidgets.map(w => w.id === activeWidgetId ? newWidget : w)
      : [newWidget, ...savedWidgets];
    
    setSavedWidgets(updatedWidgets);
    localStorage.setItem('estimate_ai_profiles', JSON.stringify(updatedWidgets));
    setActiveWidgetId(widgetId);

    if (cloudEnabled) {
      try {
        const data = { name: config.name, config, updated_at: timestamp };
        if (activeWidgetId && !activeWidgetId.startsWith('local-')) {
          await supabase.from('widgets').update(data).eq('id', activeWidgetId);
        } else {
          const res = await supabase.from('widgets').insert([data]).select();
          if (res.data) setActiveWidgetId(res.data[0].id);
        }
      } catch (e) { console.error("Cloud save failed", e); }
    }
    alert("Profile Saved Successfully.");
    setActiveTab('dashboard');
  };

  const deleteWidget = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete profile?")) return;
    const updated = savedWidgets.filter(w => w.id !== id);
    setSavedWidgets(updated);
    localStorage.setItem('estimate_ai_profiles', JSON.stringify(updated));
    if (activeWidgetId === id) { setActiveWidgetId(null); setConfig(INITIAL_CONFIG); }
    if (cloudEnabled && !id.startsWith('local-')) supabase.from('widgets').delete().eq('id', id).then();
  };

  // AGENT ACTIONS
  const deployInvestigator = async () => {
    if (!urlToScan) return alert("Enter a URL first.");
    setLoadingAgent('investigator');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const { data, sources } = await investigatorAgent(ai, urlToScan, config.customAgentInstruction);
      setConfig(prev => ({ ...prev, ...data, intelligenceSources: sources }));
    } catch (err: any) { alert("Error: " + err.message); }
    finally { setLoadingAgent(null); }
  };

  const deployAnalyst = async () => {
    setLoadingAgent('analyst');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const data = await marketAnalystAgent(ai, config);
      setConfig(prev => ({ ...prev, ...data }));
    } catch (err: any) { alert("Error: " + err.message); }
    finally { setLoadingAgent(null); }
  };

  const deployStrategist = async () => {
    setLoadingAgent('strategist');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const data = await pricingStrategistAgent(ai, config);
      setConfig(prev => ({ ...prev, ...data }));
    } catch (err: any) { alert("Error: " + err.message); }
    finally { setLoadingAgent(null); }
  };

  const deployCopywriter = async () => {
    setLoadingAgent('copywriter');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const data = await copywriterAgent(ai, config);
      setConfig(prev => ({ ...prev, ...data }));
    } catch (err: any) { alert("Error: " + err.message); }
    finally { setLoadingAgent(null); }
  };

  const handleCsvImport = () => {
    if (!csvInput.trim()) return;
    const lines = csvInput.split('\n');
    const newList: ManualPriceItem[] = lines.filter(l => l.includes(',')).map((line, i) => {
      const [label, price] = line.split(',');
      return { id: `csv-${Date.now()}-${i}`, label: label.trim(), price: price.trim() };
    });
    setConfig(prev => ({ ...prev, manualPriceList: [...prev.manualPriceList, ...newList] }));
    setCsvInput('');
    alert(`Imported ${newList.length} items.`);
  };

  const testPricingLogic = async () => {
    if (!testPrompt) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await getEstimate({ description: testPrompt, zipCode: '90210', urgency: 'within-3-days' }, config);
      setTestResult(res);
    } catch (e) {
      alert("Testing failed. Check console.");
    } finally {
      setTestLoading(false);
    }
  };

  const getIframeEmbedCode = () => {
    try {
      const encodedConfig = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
      const url = `${window.location.origin}/?widget=true&config=${encodedConfig}`;
      return `<iframe \n  src="${url}" \n  style="position: fixed; bottom: 20px; right: 20px; width: 450px; height: 85vh; border: none; z-index: 2147483647; background: transparent;" \n  allow="microphone; camera"\n></iframe>`;
    } catch (e) {
      return "Error generating code.";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-full md:w-80 bg-slate-900 text-white p-6 flex flex-col shrink-0 z-20">
        <div className="flex items-center space-x-3 mb-10">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <span className="text-xl font-black uppercase tracking-tighter">Estimate AI</span>
        </div>
        
        <nav className="flex-1 space-y-1 overflow-y-auto no-scrollbar">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}>Client Dashboard</button>
          <div className="pt-6 pb-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">The Crew</div>
          <button onClick={() => setActiveTab('crew')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'crew' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}>AI Agents</button>
          <button onClick={() => setActiveTab('services')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'services' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}>Pricing Logic</button>
          <button onClick={() => setActiveTab('design')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'design' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}>Branding</button>
          <button onClick={() => setActiveTab('leads')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'leads' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}>Leads & Routing</button>
          <button onClick={() => setActiveTab('embed')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'embed' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}>Publish Widget</button>
        </nav>

        <button onClick={saveWidget} className="mt-6 w-full py-4 bg-orange-600 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl hover:brightness-110 active:scale-95 transition-all">Save Business Profile</button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 md:p-12 overflow-y-auto bg-[#f8fafc]">
        <div className="max-w-5xl mx-auto pb-20">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                <div>
                  <h1 className="text-4xl font-black tracking-tight">Managed Business Profiles</h1>
                  <p className="text-slate-500 mt-2 font-medium">Create a profile for a handyman, contractor, or service business.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {savedWidgets.map(w => (
                    <div key={w.id} onClick={() => { setConfig(w.config); setActiveWidgetId(w.id); }} className={`group p-8 bg-white rounded-[2.5rem] border-2 cursor-pointer transition-all hover:shadow-xl relative ${activeWidgetId === w.id ? 'border-indigo-600 ring-4 ring-indigo-50 shadow-lg shadow-indigo-100' : 'border-slate-100 shadow-sm'}`}>
                      <img src={w.config.profilePic} className="w-16 h-16 rounded-2xl mb-4 object-cover border-2 shadow-sm" />
                      <h4 className="font-black text-xl truncate">{w.config.name || 'Untitled Client'}</h4>
                      <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4">{w.config.industry || 'Handyman'}</p>
                      <button onClick={(e) => deleteWidget(w.id, e)} className="text-[10px] font-black text-red-400 hover:text-red-600 uppercase transition-opacity opacity-0 group-hover:opacity-100">Remove</button>
                    </div>
                  ))}
                  <div onClick={() => { setConfig(INITIAL_CONFIG); setActiveWidgetId(null); setActiveTab('crew'); }} className="p-8 border-2 border-dashed rounded-[2.5rem] border-slate-200 flex flex-col items-center justify-center text-slate-400 font-black cursor-pointer hover:border-indigo-600 hover:text-indigo-600 transition-all hover:bg-indigo-50/30">
                    <div className="w-12 h-12 rounded-full border-2 border-dashed flex items-center justify-center mb-2">+</div>
                    <span>New Profile</span>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'crew' && (
              <motion.div key="crew" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
                <div className="flex justify-between items-end">
                  <div>
                    <h1 className="text-4xl font-black tracking-tight">AI Crew Agents</h1>
                    <p className="text-slate-500 mt-2 font-medium">Deploy 4 specialized agents to build this business logic from scratch.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className={`p-8 bg-white rounded-[3rem] border-2 shadow-sm transition-all ${config.name ? 'border-green-100 bg-green-50/10' : 'border-slate-100'}`}>
                    <div className="text-4xl mb-6">🔍</div>
                    <h3 className="text-xl font-black mb-2">Digital Investigator</h3>
                    <p className="text-sm text-slate-500 mb-6 leading-relaxed">Scrapes any URL to extract business identity, niche, and services.</p>
                    <div className="space-y-4">
                      <input value={urlToScan} onChange={e => setUrlToScan(e.target.value)} placeholder="https://handyman-pro.com" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-indigo-600 font-bold text-sm shadow-inner" />
                      <button onClick={deployInvestigator} disabled={!!loadingAgent} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-lg hover:brightness-110 active:scale-95 transition-all">
                        {loadingAgent === 'investigator' ? 'Deploying...' : 'Scan Site'}
                      </button>
                    </div>
                  </div>

                  <div className={`p-8 bg-white rounded-[3rem] border-2 shadow-sm transition-all ${!config.name ? 'opacity-50 pointer-events-none grayscale' : 'border-slate-100'} ${config.suggestedQuestions.length ? 'border-green-100 bg-green-50/10' : ''}`}>
                    <div className="text-4xl mb-6">📊</div>
                    <h3 className="text-xl font-black mb-2">Market Analyst</h3>
                    <p className="text-sm text-slate-500 mb-6 leading-relaxed">Researches regional trends and suggests high-converting lead questions.</p>
                    <button onClick={deployAnalyst} disabled={!!loadingAgent} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-lg hover:brightness-110 active:scale-95 transition-all">
                      {loadingAgent === 'analyst' ? 'Analyzing...' : 'Research Market'}
                    </button>
                  </div>

                  <div className={`p-8 bg-white rounded-[3rem] border-2 shadow-sm transition-all ${!config.industry ? 'opacity-50 pointer-events-none grayscale' : 'border-slate-100'} ${config.pricingRules ? 'border-green-100 bg-green-50/10' : ''}`}>
                    <div className="text-4xl mb-6">💰</div>
                    <h3 className="text-xl font-black mb-2">Pricing Strategist</h3>
                    <p className="text-sm text-slate-500 mb-6 leading-relaxed">Builds a logical pricing engine with custom rules and labor rates.</p>
                    <button onClick={deployStrategist} disabled={!!loadingAgent} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-lg hover:brightness-110 active:scale-95 transition-all">
                      {loadingAgent === 'strategist' ? 'Calculating...' : 'Build Logic'}
                    </button>
                  </div>

                  <div className={`p-8 bg-white rounded-[3rem] border-2 shadow-sm transition-all ${!config.pricingRules ? 'opacity-50 pointer-events-none grayscale' : 'border-slate-100'} ${config.curatedRecommendations.length ? 'border-green-100 bg-green-50/10' : ''}`}>
                    <div className="text-4xl mb-6">✍️</div>
                    <h3 className="text-xl font-black mb-2">Copywriter</h3>
                    <p className="text-sm text-slate-500 mb-6 leading-relaxed">Crafts branding, icons, and automated high-value upsell packages.</p>
                    <button onClick={deployCopywriter} disabled={!!loadingAgent} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-lg hover:brightness-110 active:scale-95 transition-all">
                      {loadingAgent === 'copywriter' ? 'Writing...' : 'Curate Content'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'services' && (
              <motion.div key="services" className="space-y-12">
                <div className="flex justify-between items-end">
                  <div>
                    <h1 className="text-4xl font-black tracking-tight">Pricing Engine</h1>
                    <p className="text-slate-500 mt-2 font-medium">Fine-tune how the AI calculates costs for this specific business.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Global Logic & Labor Rates</label>
                    <div className="p-8 bg-white border-2 rounded-[2.5rem] shadow-sm space-y-4">
                       <textarea value={config.pricingRules} onChange={e => setConfig({...config, pricingRules: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm h-48 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Describe labor rates (e.g., $85/hr), minimum fees ($95), and regional markups..." />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Knowledge Base & Material Specs</label>
                    <div className="p-8 bg-white border-2 rounded-[2.5rem] shadow-sm space-y-4">
                       <textarea value={config.pricingKnowledgeBase || ''} onChange={e => setConfig({...config, pricingKnowledgeBase: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm h-48 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Specific technical data, brand preferences, or detailed material costs..." />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 p-10 bg-white rounded-[3rem] border-2 shadow-sm">
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="text-xl font-black">Itemized Rate Sheet</h3>
                      <div className="flex gap-2">
                        <button onClick={() => setConfig({...config, manualPriceList: []})} className="px-4 py-2 text-[10px] font-black uppercase text-red-500 hover:bg-red-50 rounded-lg">Clear All</button>
                      </div>
                    </div>
                    
                    <div className="space-y-3 mb-8">
                      {config.manualPriceList.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 font-medium bg-slate-50 rounded-3xl border-2 border-dashed">No items added yet. Use CSV import or add manually.</div>
                      ) : (
                        config.manualPriceList.map((item, idx) => (
                          <div key={item.id} className="flex gap-4 items-center group">
                            <input value={item.label} onChange={e => {
                              const newList = [...config.manualPriceList];
                              newList[idx].label = e.target.value;
                              setConfig({...config, manualPriceList: newList});
                            }} className="flex-1 p-4 bg-slate-50 border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500" />
                            <input value={item.price} onChange={e => {
                              const newList = [...config.manualPriceList];
                              newList[idx].price = e.target.value;
                              setConfig({...config, manualPriceList: newList});
                            }} className="w-32 p-4 bg-white border rounded-2xl text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500" />
                            <button onClick={() => setConfig({...config, manualPriceList: config.manualPriceList.filter((_, i) => i !== idx)})} className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        ))
                      )}
                      <button onClick={() => setConfig({...config, manualPriceList: [...config.manualPriceList, {id: Date.now().toString(), label: 'New Rate', price: '$0'}]})} className="w-full py-4 border-2 border-dashed rounded-[2rem] text-[10px] font-black uppercase tracking-widest text-slate-400 hover:border-indigo-500 hover:text-indigo-500 transition-all">Add Custom Row</button>
                    </div>

                    <div className="pt-8 border-t border-slate-100">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Quick CSV Import (Item, Price per line)</label>
                       <div className="flex gap-3">
                         <textarea value={csvInput} onChange={e => setCsvInput(e.target.value)} className="flex-1 p-4 bg-slate-50 border rounded-2xl text-xs h-20 outline-none focus:ring-2 focus:ring-indigo-500 font-mono" placeholder="Faucet Repair, $125&#10;TV Mounting, $150" />
                         <button onClick={handleCsvImport} className="px-6 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg hover:brightness-110 active:scale-95 transition-all">Bulk Import</button>
                       </div>
                    </div>
                  </div>

                  <div className="p-10 bg-indigo-900 rounded-[3rem] text-white shadow-xl shadow-indigo-100">
                    <h3 className="text-xl font-black mb-6">Engine Tester</h3>
                    <p className="text-indigo-300 text-sm mb-6">Test how the current rules and rate sheet impact a real request.</p>
                    <div className="space-y-4">
                       <input value={testPrompt} onChange={e => setTestPrompt(e.target.value)} placeholder="I need 3 TVs mounted on drywall..." className="w-full p-4 bg-white/10 border border-white/20 rounded-2xl text-sm text-white placeholder-white/40 focus:bg-white/20 transition-all outline-none" />
                       <button onClick={testPricingLogic} disabled={testLoading} className="w-full py-4 bg-orange-600 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:brightness-110 active:scale-95 transition-all">
                         {testLoading ? 'Calculating...' : 'Run Test Scenario'}
                       </button>

                       <AnimatePresence>
                         {testResult && (
                           <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-6 mt-6 border-t border-white/10">
                              <div className="p-6 bg-white/5 rounded-[2rem] border border-white/10">
                                 <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">Estimated Quote</p>
                                 <p className="text-3xl font-black text-orange-400 mb-4">{testResult.estimatedCostRange}</p>
                                 <div className="space-y-3">
                                    <div className="flex justify-between text-xs">
                                       <span className="text-indigo-300">Labor</span>
                                       <span className="font-bold">{testResult.laborEstimate}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                       <span className="text-indigo-300">Timeline</span>
                                       <span className="font-bold">{testResult.timeEstimate}</span>
                                    </div>
                                 </div>
                              </div>
                           </motion.div>
                         )}
                       </AnimatePresence>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'design' && (
              <motion.div key="design" className="space-y-8">
                <h1 className="text-4xl font-black tracking-tight">Branding & Preview</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                   <div className="space-y-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Primary Brand Color</label>
                        <div className="flex gap-4 items-center">
                          <input type="color" value={config.primaryColor} onChange={e => setConfig({...config, primaryColor: e.target.value})} className="w-16 h-16 rounded-2xl border-none cursor-pointer" />
                          <input value={config.primaryColor} onChange={e => setConfig({...config, primaryColor: e.target.value})} className="flex-1 p-4 bg-white border rounded-xl font-mono text-sm" />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Widget Heading</label>
                        <input value={config.headerTitle} onChange={e => setConfig({...config, headerTitle: e.target.value})} className="w-full p-4 bg-white border rounded-xl font-bold" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Avatar Profile URL</label>
                        <input value={config.profilePic} onChange={e => setConfig({...config, profilePic: e.target.value})} className="w-full p-4 bg-white border rounded-xl text-xs" />
                      </div>
                   </div>
                   <div className="bg-slate-900 rounded-[4rem] p-12 flex flex-col items-center justify-center text-white text-center shadow-2xl">
                      <img src={config.profilePic} className="w-24 h-24 rounded-full border-4 border-white mb-6 object-cover shadow-xl" />
                      <h3 className="text-2xl font-black mb-2">{config.headerTitle}</h3>
                      <p className="text-slate-400 text-sm mb-10">{config.headerSubtitle}</p>
                      <div style={{ backgroundColor: config.primaryColor }} className="w-full max-w-[240px] h-14 rounded-2xl flex items-center justify-center font-black text-sm uppercase tracking-widest shadow-xl">Live Preview Button</div>
                   </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'embed' && (
              <motion.div key="embed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
                <h1 className="text-4xl font-black tracking-tight">Publish Deployment</h1>
                <div className="bg-white p-12 rounded-[4rem] border-2 shadow-sm">
                  <h3 className="text-2xl font-black mb-6">Iframe Snippet</h3>
                  <p className="text-slate-600 mb-8 font-medium">Add the following code to the bottom of your client's website to activate their AI Estimator.</p>
                  <pre className="bg-slate-900 text-indigo-300 p-10 rounded-[2.5rem] overflow-x-auto font-mono text-xs leading-relaxed border-4 border-slate-800">
                    {getIframeEmbedCode()}
                  </pre>
                  <button onClick={() => { navigator.clipboard.writeText(getIframeEmbedCode()); alert("Code Copied!"); }} className="mt-10 px-12 py-5 bg-orange-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:brightness-110 active:scale-95 transition-all">Copy to Clipboard</button>
                </div>
              </motion.div>
            )}

            {activeTab === 'leads' && (
              <motion.div key="leads" className="space-y-8">
                <h1 className="text-4xl font-black tracking-tight">Lead Capture</h1>
                <div className="bg-white p-10 rounded-[3rem] border shadow-sm max-w-2xl">
                   <div className="space-y-6">
                     <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Notification Email</label>
                       <input type="email" value={config.leadGenConfig.targetEmail} onChange={e => setConfig({...config, leadGenConfig: {...config.leadGenConfig, targetEmail: e.target.value}})} className="w-full p-4 bg-slate-50 border rounded-xl font-bold" placeholder="leads@client-biz.com" />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        {(Object.keys(config.leadGenConfig.fields) as Array<keyof typeof config.leadGenConfig.fields>).map(f => (
                          <div key={f} className="flex items-center gap-3 p-4 bg-white border rounded-2xl">
                             <input type="checkbox" checked={config.leadGenConfig.fields[f].visible} onChange={e => {
                               const newFields = {...config.leadGenConfig.fields};
                               newFields[f].visible = e.target.checked;
                               setConfig({...config, leadGenConfig: {...config.leadGenConfig, fields: newFields}});
                             }} className="w-5 h-5 rounded-lg text-indigo-600" />
                             <span className="text-sm font-bold text-slate-700 capitalize">{String(f).replace(/([A-Z])/g, ' $1')}</span>
                          </div>
                        ))}
                     </div>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AIWidget config={config} />
    </div>
  );
};

export default App;
