
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BusinessConfig, SavedWidget, 
  AppTabType, ManualPriceItem, RecommendedService, WidgetIconType 
} from './types';
import AIWidget from './components/AIWidget';
import { 
  investigatorAgent, marketAnalystAgent, pricingStrategistAgent, copywriterAgent 
} from './services/geminiService';
import { 
  supabase, isSupabaseConfigured, updateSupabaseConfig, 
  getSupabaseConfig 
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
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [loadingAgent, setLoadingAgent] = useState<string | null>(null);

  const lastSyncedUrl = useRef<string>('');

  useEffect(() => {
    // Determine cloud state safely
    try {
      setCloudEnabled(isSupabaseConfigured());
    } catch (e) {
      console.warn("Supabase configuration check failed", e);
    }
  }, []);

  useEffect(() => {
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
    if (!config.name) {
      alert("Please run at least the Digital Investigator or enter a name first.");
      return;
    }

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
        const result = activeWidgetId && !activeWidgetId.startsWith('local-') 
          ? await supabase.from('widgets').update(data).eq('id', activeWidgetId).select() 
          : await supabase.from('widgets').insert([data]).select();
        
        if (!result.error && result.data) {
          const dbWidget = result.data[0];
          setActiveWidgetId(dbWidget.id);
          fetchWidgets();
        }
      } catch (e: any) { console.error("Cloud save failed", e); }
    }
    alert("Client Profile Saved Successfully.");
    setActiveTab('dashboard');
  };

  const deleteWidget = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this client profile?")) return;
    const updated = savedWidgets.filter(w => w.id !== id);
    setSavedWidgets(updated);
    localStorage.setItem('estimate_ai_profiles', JSON.stringify(updated));
    if (activeWidgetId === id) { setActiveWidgetId(null); setConfig(INITIAL_CONFIG); }
    if (cloudEnabled && !id.startsWith('local-')) supabase.from('widgets').delete().eq('id', id).then();
  };

  // Safe API Key access
  const getApiKey = () => (typeof process !== 'undefined' ? process.env.API_KEY : '') || '';

  const deployInvestigator = async () => {
    if (!urlToScan) return alert("Enter a URL first.");
    setLoadingAgent('investigator');
    try {
      const ai = new GoogleGenAI({ apiKey: getApiKey() });
      const { data, sources } = await investigatorAgent(ai, urlToScan, config.customAgentInstruction);
      setConfig(prev => ({ ...prev, ...data, intelligenceSources: sources }));
    } catch (err: any) { alert("Investigator failed: " + err.message); }
    finally { setLoadingAgent(null); }
  };

  const deployAnalyst = async () => {
    if (!config.industry) return alert("Run Investigator first.");
    setLoadingAgent('analyst');
    try {
      const ai = new GoogleGenAI({ apiKey: getApiKey() });
      const data = await marketAnalystAgent(ai, config);
      setConfig(prev => ({ ...prev, ...data }));
    } catch (err: any) { alert("Analyst failed: " + err.message); }
    finally { setLoadingAgent(null); }
  };

  const deployStrategist = async () => {
    if (!config.services.length) return alert("Run Investigator first.");
    setLoadingAgent('strategist');
    try {
      const ai = new GoogleGenAI({ apiKey: getApiKey() });
      const data = await pricingStrategistAgent(ai, config);
      setConfig(prev => ({ ...prev, ...data }));
    } catch (err: any) { alert("Strategist failed: " + err.message); }
    finally { setLoadingAgent(null); }
  };

  const deployCopywriter = async () => {
    if (!config.name) return alert("Run Investigator first.");
    setLoadingAgent('copywriter');
    try {
      const ai = new GoogleGenAI({ apiKey: getApiKey() });
      const data = await copywriterAgent(ai, config);
      setConfig(prev => ({ ...prev, ...data }));
    } catch (err: any) { alert("Copywriter failed: " + err.message); }
    finally { setLoadingAgent(null); }
  };

  const parseCSV = (str: string) => {
    const arr = [];
    let quote = false;
    let row: string[] = [''];
    let col = 0;
    for (let c = 0; c < str.length; c++) {
      const char = str[c];
      const next = str[c+1];
      if (char === '"' && quote && next === '"') { row[col] += char; c++; }
      else if (char === '"') { quote = !quote; }
      else if (char === ',' && !quote) { row[++col] = ''; }
      else if (char === '\n' && !quote) { arr.push(row); row = ['']; col = 0; }
      else if (char === '\r' && !quote) { /* skip */ }
      else { row[col] += char; }
    }
    if (row.length > 1 || row[0] !== '') arr.push(row);
    return arr;
  };

  const syncGoogleSheet = useCallback(async (url: string) => {
    if (!url || !url.includes('docs.google.com/spreadsheets')) return;
    setIsSyncingSheet(true);
    try {
      let csvUrl = '';
      if (url.includes('/d/e/')) {
        csvUrl = url.replace(/\/pubhtml($|\?|#)/, '/pub$1');
        if (!csvUrl.includes('output=csv')) csvUrl += (csvUrl.includes('?') ? '&' : '?') + 'output=csv';
      } else {
        const sheetId = url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
        if (!sheetId) throw new Error("Could not parse Spreadsheet ID.");
        csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
      }

      const response = await fetch(csvUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Google Sheets access denied.`);
      
      const text = await response.text();
      const allRows = parseCSV(text);
      const rows = allRows.filter(r => r.some(cell => cell && cell.trim() !== ''));
      if (rows.length < 1) throw new Error("Spreadsheet appears to be empty.");

      const newManualPrices: ManualPriceItem[] = [];
      const newUpsells: RecommendedService[] = [];
      const firstRow = rows[0].map(c => (c || '').toLowerCase().trim());
      const hasHeader = firstRow.includes('type') || firstRow.includes('label');
      const startIndex = hasHeader ? 1 : 0;

      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        const typeStr = (row[0] || 'Core').trim();
        const label = (row[1] || '').trim();
        const price = (row[2] || '').trim();
        const description = (row[3] || '').trim();
        if (!label) continue;
        const isAddon = typeStr.toLowerCase().includes('add-on') || typeStr.toLowerCase().includes('upsell');
        if (isAddon) {
          newUpsells.push({ id: `addon-${i}-${Date.now()}`, label, description, suggestedPrice: price, isApproved: true });
        } else {
          newManualPrices.push({ id: `core-${i}-${Date.now()}`, label, price });
        }
      }

      setConfig(prev => ({
        ...prev,
        manualPriceList: newManualPrices.length > 0 ? newManualPrices : prev.manualPriceList,
        curatedRecommendations: newUpsells.length > 0 ? newUpsells : prev.curatedRecommendations,
        useSheetData: true
      }));
      lastSyncedUrl.current = url;
    } catch (error: any) {
      alert("Sync Error: " + error.message);
    } finally { setIsSyncingSheet(false); }
  }, []);

  useEffect(() => {
    if (config.googleSheetUrl && config.googleSheetUrl !== lastSyncedUrl.current) {
      const t = setTimeout(() => syncGoogleSheet(config.googleSheetUrl!), 800);
      return () => clearTimeout(t);
    }
  }, [config.googleSheetUrl, syncGoogleSheet]);

  const generateSheetsUrl = () => {
    const data = [
      ["Type", "Label", "Price", "Description"],
      ...config.manualPriceList.map(item => ["Core", item.label, item.price, ""]),
      ...config.curatedRecommendations.map(item => ["Add-on", item.label, item.suggestedPrice, item.description])
    ];
    const csvContent = "data:text/csv;charset=utf-8," + data.map(e => e.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `${(config.name || 'Business').replace(/\s+/g, '_')}_Pricing.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const crewProgress = [
    !!config.name,
    !!config.suggestedQuestions.length,
    !!config.pricingRules,
    !!config.curatedRecommendations.length
  ].filter(Boolean).length;

  const getIframeEmbedCode = () => {
    try {
      const encodedConfig = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
      const url = `${window.location.origin}/?widget=true&config=${encodedConfig}`;
      return `<iframe \n  src="${url}" \n  style="position: fixed; bottom: 0; right: 0; width: 450px; height: 100vh; border: none; z-index: 2147483647; background: transparent;" \n  allow="microphone; camera"\n></iframe>`;
    } catch (e) {
      return "Error generating embed code. Check configuration.";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900">
      <aside className="w-full md:w-80 bg-slate-900 text-white p-6 flex flex-col shrink-0 z-20">
        <div className="flex items-center space-x-3 mb-10">
          <div className="bg-orange-600 p-2 rounded-xl shadow-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <span className="text-xl font-black tracking-tight uppercase">Estimate AI</span>
        </div>
        
        <nav className="flex-1 space-y-1">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}>Client Dashboard</button>
          <div className="pt-6 pb-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Builder</div>
          <button onClick={() => setActiveTab('crew')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'crew' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}>AI Crew Agents</button>
          <button onClick={() => setActiveTab('services')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'services' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}>Pricing Engine</button>
          <button onClick={() => setActiveTab('design')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'design' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}>Branding & Design</button>
          <button onClick={() => setActiveTab('leads')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'leads' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}>Lead Routing</button>
          <button onClick={() => setActiveTab('embed')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'embed' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}>Publish Widget</button>
        </nav>

        <div className="pt-6 border-t border-white/10">
          <button onClick={saveWidget} className="w-full py-4 bg-orange-600 rounded-xl font-black text-xs hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-orange-500/20">Finalize & Save Profile</button>
        </div>
      </aside>

      <main className="flex-1 p-8 md:p-12 overflow-y-auto">
        <div className="max-w-5xl mx-auto pb-32">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div className="flex justify-between items-end mb-10">
                  <div>
                    <h1 className="text-4xl font-black">Managed Accounts</h1>
                    <p className="text-slate-500 mt-1">Select a business profile to edit their widget configuration.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {savedWidgets.length > 0 ? savedWidgets.map(w => (
                    <div key={w.id} onClick={() => { setConfig(w.config); setActiveWidgetId(w.id); }} className={`p-8 bg-white rounded-[2.5rem] border-2 cursor-pointer transition-all hover:shadow-2xl relative group ${activeWidgetId === w.id ? 'border-indigo-600 shadow-indigo-100 ring-4 ring-indigo-50' : 'border-slate-100 shadow-sm'}`}>
                      <button onClick={(e) => deleteWidget(w.id, e)} className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      <img src={w.config.profilePic} className="w-16 h-16 rounded-2xl mb-4 object-cover border-2 shadow-sm bg-slate-100" />
                      <h4 className="font-black text-2xl truncate">{w.config.name || 'Untitled'}</h4>
                      <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{w.config.industry || 'Pending Configuration'}</p>
                    </div>
                  )) : (
                    <div className="col-span-full py-20 text-center border-2 border-dashed rounded-[3rem] border-slate-200 text-slate-400 font-bold">
                      No profiles found. Use the AI Crew to build your first client.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'crew' && (
              <motion.div key="crew" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-12">
                <div className="flex justify-between items-center">
                  <h1 className="text-4xl font-black">AI Crew Dashboard</h1>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4].map(step => (
                      <div key={step} className={`w-3 h-3 rounded-full ${crewProgress >= step ? 'bg-indigo-600' : 'bg-slate-200'}`} />
                    ))}
                    <span className="text-[10px] font-black uppercase text-slate-400 ml-2">Progress: {Math.round((crewProgress / 4) * 100)}%</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Investigator */}
                  <div className={`p-8 bg-white rounded-[2.5rem] border shadow-sm transition-all ${config.name ? 'border-green-200 bg-green-50/10' : ''}`}>
                    <div className="text-4xl mb-4">🔍</div>
                    <h3 className="text-xl font-black mb-1">Digital Investigator</h3>
                    <p className="text-sm text-slate-500 mb-6 leading-relaxed">Extracts business identity, services, and core details from any website URL.</p>
                    <div className="space-y-4">
                      <input value={urlToScan} onChange={e => setUrlToScan(e.target.value)} placeholder="https://website-to-scan.com" className="w-full p-4 bg-slate-50 border rounded-2xl text-xs font-bold outline-none focus:border-indigo-600 transition-all shadow-inner" />
                      <button onClick={deployInvestigator} disabled={!!loadingAgent} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all">
                        {loadingAgent === 'investigator' ? 'Scanning...' : config.name ? 'Update Scan' : 'Deploy Investigator'}
                      </button>
                    </div>
                  </div>

                  {/* Analyst */}
                  <div className={`p-8 bg-white rounded-[2.5rem] border shadow-sm transition-all ${!config.name ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                    <div className="text-4xl mb-4">📊</div>
                    <h3 className="text-xl font-black mb-1">Market Analyst</h3>
                    <p className="text-sm text-slate-500 mb-6 leading-relaxed">Researches regional trends and generates high-converting user questions.</p>
                    <button onClick={deployAnalyst} disabled={!!loadingAgent} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all">
                      {loadingAgent === 'analyst' ? 'Analyzing...' : 'Deploy Market Analyst'}
                    </button>
                  </div>

                  {/* Strategist */}
                  <div className={`p-8 bg-white rounded-[2.5rem] border shadow-sm transition-all ${!config.industry ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                    <div className="text-4xl mb-4">💰</div>
                    <h3 className="text-xl font-black mb-1">Pricing Strategist</h3>
                    <p className="text-sm text-slate-500 mb-6 leading-relaxed">Builds a logical pricing engine with custom rules and service rates.</p>
                    <button onClick={deployStrategist} disabled={!!loadingAgent} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all">
                      {loadingAgent === 'strategist' ? 'Calculating...' : 'Deploy Strategist'}
                    </button>
                  </div>

                  {/* Copywriter */}
                  <div className={`p-8 bg-white rounded-[2.5rem] border shadow-sm transition-all ${!config.pricingRules ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                    <div className="text-4xl mb-4">✍️</div>
                    <h3 className="text-xl font-black mb-1">Brand Copywriter</h3>
                    <p className="text-sm text-slate-500 mb-6 leading-relaxed">Crafts conversion hooks, selects branding, and creates upsell packages.</p>
                    <button onClick={deployCopywriter} disabled={!!loadingAgent} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all">
                      {loadingAgent === 'copywriter' ? 'Writing...' : 'Deploy Copywriter'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'services' && (
              <motion.div key="services" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                  <div>
                    <h1 className="text-4xl font-black">Pricing Engine</h1>
                    <p className="text-slate-500 mt-1">Configure the logic and itemized lists used for AI calculations.</p>
                  </div>
                  <button onClick={generateSheetsUrl} className="bg-green-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-2 hover:brightness-110 transition-all">
                    Export CSV
                  </button>
                </div>

                {/* Google Sheets Sync */}
                <section className="bg-white p-8 rounded-[2.5rem] border shadow-sm space-y-6">
                  <h3 className="text-xl font-black">Google Sheets Sync</h3>
                  <input 
                    type="url" 
                    value={config.googleSheetUrl || ''} 
                    onChange={e => setConfig({...config, googleSheetUrl: e.target.value})} 
                    className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-indigo-600 transition-all shadow-inner" 
                    placeholder="Paste your public Google Sheet URL here..."
                  />
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Pricing Logic</label>
                    <textarea value={config.pricingRules} onChange={e => setConfig({...config, pricingRules: e.target.value})} className="w-full p-6 bg-white border rounded-[2rem] text-sm h-64 outline-none focus:border-indigo-600 shadow-inner" />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Knowledge Base</label>
                    <textarea value={config.pricingKnowledgeBase || ''} onChange={e => setConfig({...config, pricingKnowledgeBase: e.target.value})} className="w-full p-6 bg-white border rounded-[2rem] text-sm h-64 outline-none focus:border-indigo-600 shadow-inner" />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <section className="bg-white p-10 rounded-[3rem] border shadow-sm space-y-6">
                    <h3 className="text-xl font-black">Core Items</h3>
                    <div className="space-y-3">
                      {config.manualPriceList.map((item, idx) => (
                        <div key={item.id} className="flex gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <input value={item.label} className="flex-1 bg-transparent font-bold text-sm outline-none" onChange={(e) => {
                            const newList = [...config.manualPriceList];
                            newList[idx].label = e.target.value;
                            setConfig({...config, manualPriceList: newList});
                          }} />
                          <input value={item.price} className="w-24 bg-white px-3 py-1.5 rounded-xl border text-xs font-black text-indigo-600 text-center" onChange={(e) => {
                            const newList = [...config.manualPriceList];
                            newList[idx].price = e.target.value;
                            setConfig({...config, manualPriceList: newList});
                          }} />
                        </div>
                      ))}
                      <button onClick={() => setConfig({...config, manualPriceList: [...config.manualPriceList, {id: Date.now().toString(), label: 'New Item', price: '$0'}]})} className="w-full py-4 border-2 border-dashed rounded-[1.5rem] text-[10px] font-black uppercase text-slate-400">Add Item</button>
                    </div>
                  </section>
                  
                  <section className="bg-white p-10 rounded-[3rem] border shadow-sm space-y-6">
                    <h3 className="text-xl font-black text-indigo-600">Smart Add-ons</h3>
                    <div className="space-y-3">
                      {config.curatedRecommendations.map((item, idx) => (
                        <div key={item.id} className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100">
                          <input value={item.label} className="w-full bg-transparent font-black text-sm mb-1 outline-none" onChange={(e) => {
                             const newList = [...config.curatedRecommendations];
                             newList[idx].label = e.target.value;
                             setConfig({...config, curatedRecommendations: newList});
                          }} />
                          <textarea value={item.description} className="w-full bg-transparent text-[10px] text-slate-500 outline-none resize-none h-12" onChange={(e) => {
                             const newList = [...config.curatedRecommendations];
                             newList[idx].description = e.target.value;
                             setConfig({...config, curatedRecommendations: newList});
                          }} />
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'embed' && (
              <motion.div key="embed" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                <h1 className="text-4xl font-black">Publish Widget</h1>
                <div className="bg-white p-10 rounded-[3rem] border shadow-sm">
                  <p className="text-slate-600 mb-6 font-medium">Add the <b>Iframe Embed Code</b> to your website.</p>
                  <pre className="bg-slate-900 text-indigo-300 p-8 rounded-[2rem] overflow-x-auto font-mono text-xs leading-relaxed custom-scrollbar">
                    {getIframeEmbedCode()}
                  </pre>
                  <button onClick={() => { navigator.clipboard.writeText(getIframeEmbedCode()); alert("Iframe Code Copied!"); }} className="mt-8 px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all">Copy Code Snippet</button>
                </div>
              </motion.div>
            )}

            {/* Other tabs follow standard pattern */}
            {activeTab === 'design' && (
              <motion.div key="design" className="space-y-8">
                <h1 className="text-4xl font-black">Branding & Design</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Primary Color</label>
                     <input type="color" value={config.primaryColor} onChange={e => setConfig({...config, primaryColor: e.target.value})} className="w-full h-16 border-none cursor-pointer p-0" />
                  </div>
                  <div className="space-y-4">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Header Title</label>
                     <input value={config.headerTitle} onChange={e => setConfig({...config, headerTitle: e.target.value})} className="w-full p-4 bg-white border rounded-xl font-bold shadow-sm" />
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
