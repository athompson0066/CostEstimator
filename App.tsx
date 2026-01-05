
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BusinessConfig, LeadGenConfig, WidgetIconType, ColdEmailResult, ProductPricingResult, AppFeature, DetailedProposalResult, SavedWidget, AppTab, ManualPriceItem, EmailTemplateConfig, MenuItem, LeadField } from './types';
import AIWidget from './components/AIWidget';
import { performMasterScan, generateColdEmail, generateSpreadsheetData, generateProductPricing, generateDetailedProposal } from './services/geminiService';
import { supabase, isSupabaseConfigured, updateSupabaseConfig, clearSupabaseConfig, getSupabaseConfig } from './services/supabaseClient';

const DEFAULT_TEMPLATE: EmailTemplateConfig = {
  headerBgColor: "#000000",
  footerBgColor: "#f1f5f9",
  bannerUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=600&h=250&auto=format&fit=crop",
  logoUrl: "https://www.aiolosmedia.com/public_uploads/689e0c06e8220.png",
  logoSize: "32px",
  promoTitle: "Instant Quotes",
  promoDescription: "Get accurate cost estimations in seconds with our advanced AI-powered project assessment platform today.",
  menuItems: [
    { label: "Solutions", url: "https://aiolosmedia.com/solutions" },
    { label: "Pricing", url: "https://aiolosmedia.com/pricing" },
    { label: "Contact", url: "https://aiolosmedia.com/contact" }
  ]
};

const INITIAL_CONFIG: BusinessConfig = {
  name: 'SwiftFix Handyman',
  industry: 'Handyman & Home Repair',
  primaryColor: '#ea580c',
  headerTitle: 'SwiftFix Project Estimator',
  headerSubtitle: 'Accurate Handyman Quotes in Seconds',
  profilePic: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=128&h=128&auto=format&fit=crop',
  hoverTitle: 'Get Instant Estimate',
  hoverTitleBgColor: '#0f172a',
  widgetIcon: 'wrench',
  services: ['Plumbing', 'Electrical', 'Carpentry', 'General Repair', 'Furniture Assembly', 'Painting'],
  locationContext: 'Local area - residential and commercial',
  pricingRules: 'Labor: $85/hr. Minimum service fee: $95. Materials at cost + 15%. Weekend rates: +25%.',
  pricingKnowledgeBase: 'Standard rates for home maintenance. 1 hour minimum for all jobs.',
  customAgentInstruction: 'You are the Lead Generation and Sales Architect for Aiolos Media.',
  outreachInstructions: 'Address the pain point of delayed manual quotes. Showcase Aiolos Media as the solution.',
  proposalInstructions: 'Generate a high-end enterprise proposal focusing on ROI and conversion metrics.',
  googleSheetUrl: '',
  useSheetData: false,
  manualPriceList: [],
  curatedRecommendations: [],
  suggestedQuestions: ['Fix leak?', 'Mount TV?', 'Patch wall?'],
  leadGenConfig: {
    enabled: true,
    destination: 'email',
    targetEmail: 'contact@swiftfix.com',
    resendApiKey: localStorage.getItem('RESEND_API_KEY') || '',
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
      date: { visible: false, required: false },
      time: { visible: false, required: false },
    }
  },
  defaultLanguage: 'en',
  supportedLanguages: ['en', 'es'],
  emailTemplate: DEFAULT_TEMPLATE
};

const App: React.FC = () => {
  const [config, setConfig] = useState<BusinessConfig>(INITIAL_CONFIG);
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  
  const [isScanningUrl, setIsScanningUrl] = useState(false);
  const [isOutreaching, setIsOutreaching] = useState(false);
  const [isProposing, setIsProposing] = useState(false);
  const [isGeneratingPricing, setIsGeneratingPricing] = useState(false);

  const [urlToScan, setUrlToScan] = useState('');
  const [outreachUrl, setOutreachUrl] = useState('');
  const [proposalUrl, setProposalUrl] = useState('');
  
  const [outreachResult, setOutreachResult] = useState<ColdEmailResult | null>(null);
  const [proposalResult, setProposalResult] = useState<DetailedProposalResult | null>(null);
  const [saasPricingResult, setSaasPricingResult] = useState<ProductPricingResult | null>(null);

  const [tempSupabaseUrl, setTempSupabaseUrl] = useState(getSupabaseConfig().url || '');
  const [tempSupabaseKey, setTempSupabaseKey] = useState(getSupabaseConfig().key || '');
  const [tempResendKey, setTempResendKey] = useState(localStorage.getItem('RESEND_API_KEY') || '');
  
  const [savedWidgets, setSavedWidgets] = useState<SavedWidget[]>([]);
  const [isLoadingWidgets, setIsLoadingWidgets] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
  const [cloudEnabled, setCloudEnabled] = useState(isSupabaseConfigured());

  useEffect(() => { if (cloudEnabled) fetchWidgets(); }, [cloudEnabled]);

  const fetchWidgets = async () => {
    setIsLoadingWidgets(true);
    try {
      const { data, error } = await supabase.from('widgets').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      setSavedWidgets(data || []);
    } catch (e: any) { console.error(e.message); } finally { setIsLoadingWidgets(false); }
  };

  const saveWidget = async () => {
    if (!cloudEnabled) return alert("Configure cloud first.");
    setIsSaving(true);
    const data = { name: config.name, config, updated_at: new Date().toISOString(), user_id: '00000000-0000-0000-0000-000000000000' };
    try {
      const result = activeWidgetId ? await supabase.from('widgets').update(data).eq('id', activeWidgetId).select() : await supabase.from('widgets').insert([data]).select();
      if (result.error) throw result.error;
      if (result.data) setActiveWidgetId(result.data[0].id);
      fetchWidgets();
      alert("Client Profile Saved.");
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  const handleWebsiteScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlToScan) return;
    setIsScanningUrl(true);
    try {
      const masterData = await performMasterScan(urlToScan, config.customAgentInstruction);
      setConfig(prev => ({ ...prev, ...masterData }));
      alert("Research complete! Profile updated with discovered data.");
      setActiveTab('services'); 
    } catch (error) {
      console.error(error);
      alert("Research took too long (Vercel 10s timeout). Please try a simpler URL or check your Gemini API key.");
    } finally { 
      setIsScanningUrl(false); 
      setUrlToScan(''); 
    }
  };

  const handleCopyEmbedCode = () => {
    // Vercel compiles TSX to JS. We point to index.js for production compatibility.
    const entryPath = `${window.location.origin}/index.js`;
    const code = `<!-- EstimateAI Widget Bootstrap -->
<div id="estimate-ai-root"></div>
<script>
  window.ESTIMATE_AI_CONFIG = ${JSON.stringify(config, null, 2)};
  window.ESTIMATE_AI_WIDGET_ONLY = true;
</script>
<script src="${entryPath}" type="module"></script>`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        alert("Embed code copied! Use a Custom HTML block in WordPress.");
      }).catch(() => {
        alert("Failed to copy. Please manually copy the code from the Launch Code tab.");
      });
    } else {
      alert("Clipboard access denied. Please manually copy from the box.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900">
      <aside className="w-full md:w-80 bg-slate-900 text-white p-6 flex flex-col shrink-0">
        <div className="flex items-center space-x-3 mb-10">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <span className="text-xl font-black">ESTIMATE AI</span>
        </div>
        
        <nav className="flex-1 space-y-1 overflow-y-auto pr-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600' : 'text-slate-400 hover:bg-white/5'}`}>Dashboard</button>
          <div className="pt-4 pb-2 px-4 text-[10px] font-black text-slate-500 uppercase">Growth Engine</div>
          <button onClick={() => setActiveTab('outreach')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'outreach' ? 'bg-indigo-600' : 'text-slate-400 hover:bg-white/5'}`}>Outreach Crew</button>
          <button onClick={() => setActiveTab('proposals')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'proposals' ? 'bg-indigo-600' : 'text-slate-400 hover:bg-white/5'}`}>Proposal Crew</button>
          <div className="pt-4 pb-2 px-4 text-[10px] font-black text-slate-500 uppercase">Build</div>
          <button onClick={() => setActiveTab('crew')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'crew' ? 'bg-indigo-600' : 'text-slate-400 hover:bg-white/5'}`}>Agent Research</button>
          <button onClick={() => setActiveTab('services')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'services' ? 'bg-indigo-600' : 'text-slate-400 hover:bg-white/5'}`}>Services & Rates</button>
          <button onClick={() => setActiveTab('leads')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'leads' ? 'bg-indigo-600' : 'text-slate-400 hover:bg-white/5'}`}>Dispatch Center</button>
          <button onClick={() => setActiveTab('design')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'design' ? 'bg-indigo-600' : 'text-slate-400 hover:bg-white/5'}`}>Branding</button>
          <button onClick={() => setActiveTab('embed')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'embed' ? 'bg-indigo-600' : 'text-slate-400 hover:bg-white/5'}`}>Launch Code</button>
        </nav>

        <div className="pt-6 mt-4 border-t border-white/10">
          <button onClick={saveWidget} disabled={isSaving || !cloudEnabled} className="w-full py-4 bg-indigo-600 rounded-xl font-black text-xs disabled:opacity-50">Save Client Profile</button>
          <button onClick={() => setActiveTab('settings')} className="w-full mt-2 py-2 text-[10px] text-slate-500 font-bold uppercase hover:text-white">Cloud Config</button>
        </div>
      </aside>

      <main className="flex-1 p-8 md:p-12 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-12 pb-20">
          <AnimatePresence mode="wait">
            {activeTab === 'crew' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 text-center py-20">
                <h1 className="text-4xl font-black">Agent Research</h1>
                <p className="text-slate-500 mb-8">Using Gemini 2.5 Flash Lite (Low Latency) for fast audits.</p>
                <form onSubmit={handleWebsiteScan} className="max-w-md mx-auto space-y-4">
                  <input type="url" value={urlToScan} onChange={e => setUrlToScan(e.target.value)} placeholder="https://client-site.com" className="w-full p-5 bg-white border-2 rounded-[2rem] text-center font-bold outline-none focus:border-indigo-600 shadow-sm" />
                  <button type="submit" disabled={isScanningUrl} className="w-full bg-indigo-600 text-white py-5 rounded-[2rem] font-black shadow-2xl hover:brightness-110 active:scale-95 transition-all">
                    {isScanningUrl ? "Researching..." : "Launch Quick Audit"}
                  </button>
                </form>
              </motion.div>
            )}

            {activeTab === 'embed' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <header>
                  <h1 className="text-4xl font-black">Launch Code</h1>
                  <p className="text-slate-500 mt-1">Paste this into a Custom HTML block on your WordPress site.</p>
                </header>
                <div className="p-8 bg-slate-900 rounded-3xl relative">
                  <pre className="text-indigo-400 text-[10px] overflow-auto font-mono leading-relaxed">
{`<!-- EstimateAI Widget Bootstrap -->
<div id="estimate-ai-root"></div>
<script>
  window.ESTIMATE_AI_CONFIG = ${JSON.stringify(config, null, 2)};
  window.ESTIMATE_AI_WIDGET_ONLY = true;
</script>
<script src="${window.location.origin}/index.js" type="module"></script>`}
                  </pre>
                  <button onClick={handleCopyEmbedCode} className="absolute top-4 right-4 bg-white/10 text-white hover:bg-white/20 px-4 py-2 rounded-xl text-[10px] font-black uppercase">Copy Code</button>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 max-w-lg mx-auto py-20">
                <header className="text-center">
                  <h1 className="text-4xl font-black">Cloud Sync</h1>
                  <p className="text-slate-500 mt-2">Sync credentials for production deployments.</p>
                </header>
                <section className="bg-white p-10 rounded-[3rem] border shadow-sm space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Supabase URL</label>
                    <input value={tempSupabaseUrl} onChange={e => setTempSupabaseUrl(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm" placeholder="https://..." />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Supabase Key</label>
                    <input type="password" value={tempSupabaseKey} onChange={e => setTempSupabaseKey(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm" placeholder="..." />
                  </div>
                  <div className="space-y-1 border-t pt-4 mt-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Resend API Key</label>
                    <input type="password" value={tempResendKey} onChange={e => setTempResendKey(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm" placeholder="re_..." />
                  </div>
                  <button onClick={() => { 
                    updateSupabaseConfig(tempSupabaseUrl, tempSupabaseKey); 
                    localStorage.setItem('RESEND_API_KEY', tempResendKey);
                    setConfig(prev => ({ 
                      ...prev, 
                      leadGenConfig: { ...prev.leadGenConfig, resendApiKey: tempResendKey } 
                    }));
                    setCloudEnabled(true); 
                    alert("Credentials Updated."); 
                  }} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black mt-4 shadow-xl hover:brightness-110 active:scale-95 transition-all">Apply & Save</button>
                </section>
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
