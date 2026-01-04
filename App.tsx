
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

const TemplatePreview = ({ config }: { config: EmailTemplateConfig }) => (
  <div className="border rounded-2xl overflow-hidden shadow-lg bg-white scale-90 origin-top">
    <div style={{ backgroundColor: config.headerBgColor }} className="p-4 flex justify-between items-center text-white">
      <img src={config.logoUrl} style={{ height: config.logoSize || '32px' }} alt="Logo" />
      <div className="flex space-x-3 text-[10px] font-bold uppercase">
        {config.menuItems.map((m, idx) => (
          <a key={idx} href={m.url} target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">
            {m.label}
          </a>
        ))}
      </div>
    </div>
    <div className="relative">
      <img src={config.bannerUrl} className="w-full h-32 object-cover" alt="Banner" />
      <div className="absolute inset-0 bg-black/40 flex flex-col justify-center items-center text-white text-center p-4">
        <h4 className="text-xl font-black uppercase tracking-widest">{config.promoTitle}</h4>
        <p className="text-[8px] max-w-[200px] mt-1">{config.promoDescription}</p>
      </div>
    </div>
    <div className="p-8 space-y-3">
      <div className="h-4 bg-slate-100 rounded w-3/4" />
      <div className="h-3 bg-slate-50 rounded w-full" />
      <div className="h-3 bg-slate-50 rounded w-5/6" />
      <div className="h-3 bg-slate-50 rounded w-4/6" />
      <div className="h-10 bg-indigo-600 rounded-xl mt-6 w-1/2 mx-auto" />
    </div>
    <div style={{ backgroundColor: config.footerBgColor }} className="p-6 text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest">
      © 2025 Aiolos Media | aiolosmedia.com
    </div>
  </div>
);

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

  const copyForGmail = async (html: string) => {
    try {
      const blob = new Blob([html], { type: 'text/html' });
      const data = [new ClipboardItem({ 'text/html': blob })];
      await navigator.clipboard.write(data);
      alert("Branded email copied! You can now paste (Ctrl+V) directly into Gmail.");
    } catch (err) {
      alert("Failed to copy for Gmail. Try copying the raw HTML instead.");
    }
  };

  const handleWebsiteScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlToScan) return;
    setIsScanningUrl(true);
    try {
      const masterData = await performMasterScan(urlToScan, config.customAgentInstruction);
      setConfig(prev => ({ ...prev, ...masterData }));
      alert("Crew Audit Complete! Brand, Services, Pricing, Smart Upsells & User Questions have been automatically generated.");
      setActiveTab('services'); 
    } catch (error) {
      console.error(error);
      alert("Audit failed. Please try again.");
    } finally { 
      setIsScanningUrl(false); 
      setUrlToScan(''); 
    }
  };

  const handleColdOutreach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outreachUrl) return;
    setIsOutreaching(true);
    try {
      const res = await generateColdEmail(outreachUrl, config);
      setOutreachResult(res);
    } finally { setIsOutreaching(false); }
  };

  const handleProposalGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalUrl) return;
    setIsProposing(true);
    try {
      const res = await generateDetailedProposal(proposalUrl, config);
      setProposalResult(res);
    } finally { setIsProposing(false); }
  };

  const handleSaasPricingGeneration = async () => {
    setIsGeneratingPricing(true);
    try {
      const res = await generateProductPricing();
      setSaasPricingResult(res);
    } finally { setIsGeneratingPricing(false); }
  };

  const updateLeadConfig = (field: keyof LeadGenConfig, value: any) => {
    setConfig(prev => ({ ...prev, leadGenConfig: { ...prev.leadGenConfig, [field]: value } }));
  };

  const updateTwilioConfig = (field: keyof LeadGenConfig['twilioConfig'], value: string) => {
    setConfig(prev => ({ 
      ...prev, 
      leadGenConfig: { 
        ...prev.leadGenConfig, 
        twilioConfig: { ...prev.leadGenConfig.twilioConfig, [field]: value } 
      } 
    }));
  };

  const updateLeadField = (field: keyof LeadGenConfig['fields'], prop: keyof LeadField, value: boolean) => {
    setConfig(prev => ({
      ...prev,
      leadGenConfig: {
        ...prev.leadGenConfig,
        fields: {
          ...prev.leadGenConfig.fields,
          [field]: { ...prev.leadGenConfig.fields[field], [prop]: value }
        }
      }
    }));
  };

  const updateTemplate = (field: keyof EmailTemplateConfig, value: any) => {
    setConfig(prev => ({
      ...prev,
      emailTemplate: { ...prev.emailTemplate!, [field]: value }
    }));
  };

  const updateMenuItem = (index: number, field: keyof MenuItem, value: string) => {
    setConfig(prev => {
      const newItems = [...(prev.emailTemplate?.menuItems || [])];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, emailTemplate: { ...prev.emailTemplate!, menuItems: newItems } };
    });
  };

  const addMenuItem = () => {
    setConfig(prev => ({
      ...prev,
      emailTemplate: { 
        ...prev.emailTemplate!, 
        menuItems: [...(prev.emailTemplate?.menuItems || []), { label: "New Link", url: "#" }] 
      }
    }));
  };

  const removeMenuItem = (index: number) => {
    setConfig(prev => ({
      ...prev,
      emailTemplate: { 
        ...prev.emailTemplate!, 
        menuItems: (prev.emailTemplate?.menuItems || []).filter((_, i) => i !== index)
      }
    }));
  };

  const updateSuggestedQuestion = (index: number, value: string) => {
    const updated = [...(config.suggestedQuestions || ['', '', ''])];
    updated[index] = value;
    setConfig({ ...config, suggestedQuestions: updated });
  };

  const renderTemplateEditor = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Logo URL</label>
            <input type="text" value={config.emailTemplate?.logoUrl} onChange={e => updateTemplate('logoUrl', e.target.value)} className="w-full p-3 border rounded-xl text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Logo Size (e.g. 40px)</label>
            <input type="text" value={config.emailTemplate?.logoSize} onChange={e => updateTemplate('logoSize', e.target.value)} className="w-full p-3 border rounded-xl text-xs" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Header Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={config.emailTemplate?.headerBgColor} onChange={e => updateTemplate('headerBgColor', e.target.value)} className="w-10 h-10 rounded border" />
              <input type="text" value={config.emailTemplate?.headerBgColor} onChange={e => updateTemplate('headerBgColor', e.target.value)} className="flex-1 p-2 border rounded-lg text-xs font-mono" />
            </div>
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Footer Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={config.emailTemplate?.footerBgColor} onChange={e => updateTemplate('footerBgColor', e.target.value)} className="w-10 h-10 rounded border" />
              <input type="text" value={config.emailTemplate?.footerBgColor} onChange={e => updateTemplate('footerBgColor', e.target.value)} className="flex-1 p-2 border rounded-lg text-xs font-mono" />
            </div>
          </div>
        </div>
        
        <div className="space-y-2 pt-2 border-t">
          <label className="text-[10px] font-bold text-slate-400 uppercase block">Navigation Menu</label>
          <div className="space-y-2">
            {config.emailTemplate?.menuItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center group">
                <input type="text" placeholder="Label" value={item.label} onChange={e => updateMenuItem(idx, 'label', e.target.value)} className="flex-1 p-2 border rounded-xl text-[10px] font-bold" />
                <input type="text" placeholder="URL" value={item.url} onChange={e => updateMenuItem(idx, 'url', e.target.value)} className="flex-[1.5] p-2 border rounded-xl text-[10px] font-mono" />
                <button onClick={() => removeMenuItem(idx)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
            ))}
            <button onClick={addMenuItem} className="w-full py-2 border-2 border-dashed border-slate-100 rounded-xl text-[10px] font-black text-slate-400 hover:border-indigo-600 hover:text-indigo-600 transition-all">+ ADD NAVIGATION LINK</button>
          </div>
        </div>

        <div className="space-y-1 pt-2 border-t">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Banner URL</label>
          <input type="text" value={config.emailTemplate?.bannerUrl} onChange={e => updateTemplate('bannerUrl', e.target.value)} className="w-full p-3 border rounded-xl text-xs" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Promo Title</label>
          <input type="text" value={config.emailTemplate?.promoTitle} onChange={e => updateTemplate('promoTitle', e.target.value)} className="w-full p-3 border rounded-xl text-xs" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Promo Description</label>
          <textarea value={config.emailTemplate?.promoDescription} onChange={e => updateTemplate('promoDescription', e.target.value)} className="w-full p-3 border rounded-xl text-xs h-20" />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Live Preview</label>
        <TemplatePreview config={config.emailTemplate || DEFAULT_TEMPLATE} />
      </div>
    </div>
  );

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
          <button onClick={() => setActiveTab('pricing-strategist')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'pricing-strategist' ? 'bg-indigo-600' : 'text-slate-400 hover:bg-white/5'}`}>SaaS Strategist</button>
          <div className="pt-4 pb-2 px-4 text-[10px] font-black text-slate-500 uppercase">Build</div>
          <button onClick={() => setActiveTab('crew')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'crew' ? 'bg-indigo-600' : 'text-slate-400 hover:bg-white/5'}`}>Agent Research</button>
          <button onClick={() => setActiveTab('services')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'services' ? 'bg-indigo-600' : 'text-slate-400 hover:bg-white/5'}`}>Services & Rates</button>
          <button onClick={() => setActiveTab('upsells')} className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeTab === 'upsells' ? 'bg-indigo-600' : 'text-slate-400 hover:bg-white/5'}`}>Smart Upsells</button>
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
            {activeTab === 'dashboard' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <header>
                  <h1 className="text-4xl font-black">Client Dashboard</h1>
                  <p className="text-slate-500 mt-1">Manage all AI estimator profiles in one place.</p>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {savedWidgets.length > 0 ? savedWidgets.map(w => (
                    <div key={w.id} onClick={() => { setConfig(w.config); setActiveWidgetId(w.id); }} className={`p-8 bg-white rounded-[2.5rem] border-2 transition-all cursor-pointer group hover:shadow-xl ${activeWidgetId === w.id ? 'border-indigo-600' : 'border-slate-100 shadow-sm'}`}>
                      <div className="flex justify-between items-start mb-4">
                        <img src={w.config.profilePic} className="w-16 h-16 rounded-2xl border shadow-sm object-cover" />
                        <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full uppercase">Active</span>
                      </div>
                      <h4 className="font-black text-2xl group-hover:text-indigo-600 transition-colors">{w.name}</h4>
                      <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-bold">{w.config.industry}</p>
                    </div>
                  )) : (
                    <div className="col-span-2 py-20 text-center bg-white rounded-[3rem] border border-dashed border-slate-300">
                      <p className="text-slate-400 font-bold">No client profiles found. Use "Agent Research" to start.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'outreach' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12">
                <header>
                  <h1 className="text-4xl font-black">Outreach Crew</h1>
                  <p className="text-slate-500 mt-2">Branded React HTML emails with AI estimation demos.</p>
                </header>
                <section className="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
                  <h3 className="font-black text-lg">Targeting & Action</h3>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <input type="url" placeholder="https://prospect.com" value={outreachUrl} onChange={e => setOutreachUrl(e.target.value)} className="flex-1 p-4 bg-slate-50 border rounded-2xl" />
                      <button onClick={handleColdOutreach} disabled={isOutreaching} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-lg">
                        {isOutreaching ? "Drafting..." : "Launch Outreach"}
                      </button>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Crew Instruction (Cold Email Strategy)</label>
                      <textarea value={config.outreachInstructions || ''} onChange={e => setConfig({...config, outreachInstructions: e.target.value})} placeholder="E.g. Focus on the high energy of their brand. Mention their recent award." className="w-full p-4 bg-slate-50 border rounded-2xl text-sm h-24 resize-none outline-none focus:ring-2 focus:ring-indigo-600" />
                    </div>
                  </div>
                  <div className="pt-6 border-t">
                    <h3 className="font-black text-lg mb-6">Template Customization</h3>
                    {renderTemplateEditor()}
                  </div>
                </section>
                {outreachResult && (
                  <div className="bg-white rounded-3xl border shadow-xl overflow-hidden animate-in fade-in">
                    <div className="p-6 bg-slate-50 border-b flex flex-col md:flex-row justify-between items-start md:items-center font-black gap-4">
                      <span>Subject: {outreachResult.subject}</span>
                      <div className="flex gap-2">
                        <button onClick={() => copyForGmail(outreachResult.html)} className="bg-orange-600 text-white px-4 py-2 rounded-xl text-[10px] hover:brightness-110 shadow-lg">COPY FOR GMAIL</button>
                        <button onClick={() => { navigator.clipboard.writeText(outreachResult.html); alert("Email HTML Copied."); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] hover:brightness-110 shadow-lg">COPY RAW HTML</button>
                      </div>
                    </div>
                    <div className="p-0 overflow-auto max-h-[600px] border-t" dangerouslySetInnerHTML={{ __html: outreachResult.html }} />
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'proposals' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12">
                <header>
                  <h1 className="text-4xl font-black">Proposal Crew</h1>
                  <p className="text-slate-500 mt-2">Generate enterprise proposals in React HTML format.</p>
                </header>
                <section className="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
                  <h3 className="font-black text-lg">Proposal Generation</h3>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <input type="url" placeholder="https://prospect.com" value={proposalUrl} onChange={e => setProposalUrl(e.target.value)} className="flex-1 p-4 bg-slate-50 border rounded-2xl" />
                      <button onClick={handleProposalGeneration} disabled={isProposing} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-lg">
                        {isProposing ? "Crafting..." : "Deploy Crew"}
                      </button>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Crew Instruction (Proposal Focus)</label>
                      <textarea value={config.proposalInstructions || ''} onChange={e => setConfig({...config, proposalInstructions: e.target.value})} placeholder="E.g. Emphasize conversion rate optimization." className="w-full p-4 bg-slate-50 border rounded-2xl text-sm h-24 resize-none outline-none focus:ring-2 focus:ring-indigo-600" />
                    </div>
                  </div>
                  <div className="pt-6 border-t">
                    <h3 className="font-black text-lg mb-6">Template Customization</h3>
                    {renderTemplateEditor()}
                  </div>
                </section>
                {proposalResult && (
                  <div className="bg-white border rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in">
                    <div className="bg-slate-900 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <span className="text-indigo-400 font-black text-xs uppercase tracking-widest">Proposal Preview</span>
                      <div className="flex gap-2">
                        <button onClick={() => copyForGmail(proposalResult.htmlFull || '')} className="bg-orange-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:brightness-110 shadow-lg">COPY FOR GMAIL</button>
                        <button onClick={() => { navigator.clipboard.writeText(proposalResult.htmlFull || ''); alert("Proposal HTML Copied."); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:brightness-110 shadow-lg">COPY RAW HTML</button>
                      </div>
                    </div>
                    <div className="p-0 bg-white max-h-[800px] overflow-auto" dangerouslySetInnerHTML={{ __html: proposalResult.htmlFull || '' }} />
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'pricing-strategist' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <header className="flex justify-between items-end">
                  <div>
                    <h1 className="text-4xl font-black">SaaS Strategist</h1>
                    <p className="text-slate-500 mt-2">Market analysis and tiered pricing designs for your client.</p>
                  </div>
                  <button onClick={handleSaasPricingGeneration} disabled={isGeneratingPricing} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl hover:brightness-110 transition-all">
                    {isGeneratingPricing ? "Analyzing..." : "Generate SaaS Plans"}
                  </button>
                </header>
                {saasPricingResult ? (
                  <div className="space-y-12">
                    <section className="bg-indigo-50 p-8 rounded-3xl border border-indigo-100">
                      <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">Strategic Analysis</h3>
                      <p className="text-sm text-indigo-900 leading-relaxed font-medium">{saasPricingResult.analysis}</p>
                    </section>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      {saasPricingResult.plans.map((p, i) => (
                        <div key={i} className={`p-8 rounded-[2.5rem] border shadow-sm flex flex-col h-full bg-white relative overflow-hidden ${i === 1 ? 'ring-4 ring-indigo-600' : ''}`}>
                          {i === 1 && <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[8px] font-black px-4 py-1 rounded-bl-xl uppercase">Most Popular</div>}
                          <h4 className="font-black text-2xl mb-1">{p.name}</h4>
                          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-4">{p.targetAudience}</p>
                          <div className="my-6">
                            <p className="text-4xl font-black text-indigo-600">{p.monthlySubscription}</p>
                            <p className="text-slate-400 text-[10px] font-black uppercase mt-1">+ {p.setupFee} Setup</p>
                          </div>
                          <ul className="text-xs space-y-3 mb-8 flex-1">
                            {p.features.map((f, j) => <li key={j} className="flex gap-2 font-medium"><span className="text-indigo-600">✔</span> {f}</li>)}
                          </ul>
                          <div className="pt-6 border-t border-slate-50">
                             <p className="text-[9px] font-bold text-slate-500 leading-tight italic">{p.strategicValue}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-24 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                    <div className="bg-indigo-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    </div>
                    <h3 className="text-xl font-black mb-2">No Strategy Generated</h3>
                    <p className="text-slate-400 max-w-xs mx-auto text-sm">Use the AI Strategist to create high-conversion SaaS pricing tiers for this client profile.</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'leads' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12">
                <header>
                  <h1 className="text-4xl font-black">Dispatch Center</h1>
                  <p className="text-slate-500 mt-2">Route automated leads to your client's favorite tools and manage branded responses.</p>
                </header>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <section className="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
                    <div className="flex items-center gap-3">
                       <div className="bg-orange-100 p-2 rounded-xl text-orange-600">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                       </div>
                       <h3 className="font-black text-xl">Email (Resend)</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Resend API Key</label>
                        <input type="password" placeholder="re_..." value={config.leadGenConfig.resendApiKey} onChange={e => updateLeadConfig('resendApiKey', e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Recipient Email</label>
                        <input type="email" placeholder="contact@client.com" value={config.leadGenConfig.targetEmail} onChange={e => updateLeadConfig('targetEmail', e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm" />
                      </div>
                    </div>
                  </section>

                  <section className="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
                    <div className="flex items-center gap-3">
                       <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                       </div>
                       <h3 className="font-black text-xl">Automation</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Make/Zapier Webhook</label>
                        <input type="url" placeholder="https://hook.make.com/..." value={config.leadGenConfig.webhookUrl} onChange={e => updateLeadConfig('webhookUrl', e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Slack Webhook</label>
                        <input type="url" placeholder="https://hooks.slack.com/services/..." value={config.leadGenConfig.slackWebhookUrl} onChange={e => updateLeadConfig('slackWebhookUrl', e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm" />
                      </div>
                    </div>
                  </section>
                </div>

                {/* EMAIL TEMPLATE CUSTOMIZATION FOR CLIENT RESPONSES */}
                <section className="bg-white p-10 rounded-[3rem] border shadow-sm space-y-6">
                  <header className="flex justify-between items-center border-b pb-4 mb-6">
                    <div>
                      <h3 className="font-black text-2xl">Lead Response Branding</h3>
                      <p className="text-slate-400 text-xs">Customize the branded React HTML template sent as auto-responses to quotes.</p>
                    </div>
                  </header>
                  {renderTemplateEditor()}
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <section className="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
                    <div className="flex items-center gap-3">
                       <div className="bg-red-100 p-2 rounded-xl text-red-600">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                       </div>
                       <h3 className="font-black text-xl">Twilio (SMS)</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1 col-span-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Account SID</label>
                         <input type="text" value={config.leadGenConfig.twilioConfig.accountSid} onChange={e => updateTwilioConfig('accountSid', e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl text-xs" />
                       </div>
                       <div className="space-y-1 col-span-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Auth Token</label>
                         <input type="password" value={config.leadGenConfig.twilioConfig.authToken} onChange={e => updateTwilioConfig('authToken', e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl text-xs" />
                       </div>
                       <div className="space-y-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">From Num</label>
                         <input type="text" value={config.leadGenConfig.twilioConfig.fromNumber} onChange={e => updateTwilioConfig('fromNumber', e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl text-xs" />
                       </div>
                       <div className="space-y-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">To Num</label>
                         <input type="text" value={config.leadGenConfig.twilioConfig.toNumber} onChange={e => updateTwilioConfig('toNumber', e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl text-xs" />
                       </div>
                    </div>
                  </section>

                  <section className="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
                    <h3 className="font-black text-xl">Lead Form Fields</h3>
                    <div className="space-y-2">
                       {Object.keys(config.leadGenConfig.fields).map((f) => (
                         <div key={f} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                           <span className="text-xs font-black uppercase text-slate-600 tracking-wide">{f.replace(/([A-Z])/g, ' $1')}</span>
                           <div className="flex gap-4">
                              <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                                <input type="checkbox" checked={config.leadGenConfig.fields[f as keyof LeadGenConfig['fields']].visible} onChange={e => updateLeadField(f as any, 'visible', e.target.checked)} /> Show
                              </label>
                              <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                                <input type="checkbox" checked={config.leadGenConfig.fields[f as keyof LeadGenConfig['fields']].required} onChange={e => updateLeadField(f as any, 'required', e.target.checked)} /> Req
                              </label>
                           </div>
                         </div>
                       ))}
                    </div>
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'services' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <header>
                  <h1 className="text-4xl font-black">Services & Rates</h1>
                  <p className="text-slate-500 mt-1">Configure service offerings and pricing logic.</p>
                </header>
                <section className="bg-white p-10 rounded-[3rem] border shadow-sm space-y-8">
                  <div>
                    <h3 className="text-lg font-black mb-4">Core Services</h3>
                    <div className="flex flex-wrap gap-2">
                      {config.services.map((s, idx) => (
                        <div key={idx} className="bg-slate-50 border px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                          {s}
                          <button onClick={() => setConfig({...config, services: config.services.filter((_, i) => i !== idx)})} className="text-red-400 hover:text-red-600">×</button>
                        </div>
                      ))}
                      <button onClick={() => {
                        const val = prompt("Add new service:");
                        if (val) setConfig({...config, services: [...config.services, val]});
                      }} className="px-4 py-2 border-2 border-dashed rounded-xl text-sm font-bold text-slate-400 hover:border-indigo-600 hover:text-indigo-600 transition-all">+ Add Service</button>
                    </div>
                  </div>
                  <div className="pt-8 border-t">
                    <h3 className="text-lg font-black mb-4">Manual Rates</h3>
                    <div className="space-y-4">
                      {(config.manualPriceList || []).map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl">
                          <input className="flex-1 bg-transparent font-bold" value={item.label} onChange={e => {
                            const newList = [...config.manualPriceList];
                            newList[idx].label = e.target.value;
                            setConfig({...config, manualPriceList: newList});
                          }} />
                          <input className="w-24 bg-transparent font-black text-indigo-600" value={item.price} onChange={e => {
                            const newList = [...config.manualPriceList];
                            newList[idx].price = e.target.value;
                            setConfig({...config, manualPriceList: newList});
                          }} />
                          <button onClick={() => setConfig({...config, manualPriceList: config.manualPriceList.filter((_, i) => i !== idx)})} className="text-red-400">×</button>
                        </div>
                      ))}
                      <button onClick={() => setConfig({...config, manualPriceList: [...(config.manualPriceList || []), { id: Date.now().toString(), label: 'New Rule', price: '$0' }]})} className="w-full py-4 border-2 border-dashed rounded-2xl text-slate-400 font-black">+ New Pricing Rule</button>
                    </div>
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab === 'upsells' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <header>
                  <h1 className="text-4xl font-black">Smart Upsells</h1>
                  <p className="text-slate-500 mt-1">High-margin add-ons to increase customer LTV.</p>
                </header>
                <div className="grid grid-cols-1 gap-4">
                  {(config.curatedRecommendations || []).map((r, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-3xl border shadow-sm flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="font-black text-lg">{r.label}</h4>
                          <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase ${r.isApproved ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>{r.isApproved ? 'Approved' : 'Pending'}</span>
                        </div>
                        <p className="text-xs text-slate-500">{r.description}</p>
                      </div>
                      <div className="text-right ml-8">
                        <input className="font-black text-indigo-600 text-xl text-right bg-transparent w-32 border-b border-transparent focus:border-indigo-600 outline-none" value={r.suggestedPrice} onChange={e => {
                          const newList = [...config.curatedRecommendations];
                          newList[idx].suggestedPrice = e.target.value;
                          setConfig({...config, curatedRecommendations: newList});
                        }} />
                        <div className="flex gap-2 mt-2 justify-end">
                          <button onClick={() => {
                            const newList = [...config.curatedRecommendations];
                            newList[idx].isApproved = !newList[idx].isApproved;
                            setConfig({...config, curatedRecommendations: newList});
                          }} className="text-[10px] font-black text-slate-400 uppercase">Toggle</button>
                          <button onClick={() => setConfig({...config, curatedRecommendations: config.curatedRecommendations.filter((_, i) => i !== idx)})} className="text-[10px] font-black text-red-400 uppercase">Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setConfig({...config, curatedRecommendations: [...(config.curatedRecommendations || []), { id: Date.now().toString(), label: 'New Upgrade', suggestedPrice: '$99', description: 'Brief upsell description.', isApproved: true }]})} className="w-full py-5 border-2 border-dashed rounded-[2.5rem] text-slate-400 font-black">+ Add New Upsell</button>
                </div>
              </motion.div>
            )}

            {activeTab === 'design' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <header>
                  <h1 className="text-4xl font-black">Widget Branding</h1>
                  <p className="text-slate-500 mt-1">Customize the customer-facing interface.</p>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <section className="bg-white p-10 rounded-[3rem] border shadow-sm space-y-6 overflow-hidden">
                    <h3 className="font-black text-lg">Visual & Logic Settings</h3>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Primary Color</label>
                        <div className="flex items-center gap-3">
                          <input type="color" value={config.primaryColor} onChange={e => setConfig({...config, primaryColor: e.target.value})} className="w-12 h-12 rounded-xl cursor-pointer" />
                          <input value={config.primaryColor} onChange={e => setConfig({...config, primaryColor: e.target.value})} className="flex-1 p-3 border rounded-xl text-xs font-mono" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Profile Pic URL</label>
                        <input value={config.profilePic} onChange={e => setConfig({...config, profilePic: e.target.value})} className="w-full p-3 border rounded-xl text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Header Title</label>
                        <input value={config.headerTitle} onChange={e => setConfig({...config, headerTitle: e.target.value})} className="w-full p-3 border rounded-xl text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Subtitle</label>
                        <input value={config.headerSubtitle} onChange={e => setConfig({...config, headerSubtitle: e.target.value})} className="w-full p-3 border rounded-xl text-xs" />
                      </div>

                      <div className="space-y-3 pt-4 border-t">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Suggested User Questions (Two Words Only)</label>
                        <div className="grid grid-cols-1 gap-2">
                           {[0, 1, 2].map(i => (
                             <input 
                              key={i} 
                              placeholder={`Question ${i+1}`}
                              value={config.suggestedQuestions?.[i] || ''} 
                              onChange={e => updateSuggestedQuestion(i, e.target.value)} 
                              className="w-full p-3 border rounded-xl text-xs font-bold" 
                             />
                           ))}
                        </div>
                        <p className="text-[9px] text-slate-400 italic">These buttons appear on the widget to help users start a quote request instantly.</p>
                      </div>
                    </div>
                  </section>
                  <div className="flex flex-col items-center justify-center">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase mb-4">Preview</h3>
                    <div className="relative border-4 border-slate-100 rounded-[3rem] p-10 bg-slate-200/20">
                      <AIWidget config={config} />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'embed' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <header>
                  <h1 className="text-4xl font-black">Launch Code</h1>
                  <p className="text-slate-500 mt-1">Copy the snippet below and paste it into a "Custom HTML" block in WordPress.</p>
                </header>
                <div className="p-8 bg-slate-900 rounded-3xl relative">
                  <pre className="text-indigo-400 text-xs overflow-auto font-mono leading-relaxed">
{`<!-- EstimateAI Widget Bootstrap -->
<div id="estimate-ai-root"></div>
<script>
  window.ESTIMATE_AI_CONFIG = ${JSON.stringify(config, null, 2)};
  window.ESTIMATE_AI_WIDGET_ONLY = true;
</script>
<script src="${window.location.origin}/index.js" type="module"></script>`}
                  </pre>
                  <button onClick={() => {
                    const code = `<!-- EstimateAI Widget Bootstrap -->\n<div id="estimate-ai-root"></div>\n<script>\n  window.ESTIMATE_AI_CONFIG = ${JSON.stringify(config, null, 2)};\n  window.ESTIMATE_AI_WIDGET_ONLY = true;\n</script>\n<script src="${window.location.origin}/index.js" type="module"></script>`;
                    navigator.clipboard.writeText(code);
                    alert("WordPress Embed code copied!");
                  }} className="absolute top-4 right-4 bg-white/10 text-white hover:bg-white/20 px-4 py-2 rounded-xl text-[10px] font-black">COPY</button>
                </div>
                <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl">
                  <h4 className="font-bold text-amber-800 text-sm mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    WordPress Visibility Tip
                  </h4>
                  <p className="text-amber-700 text-xs leading-relaxed">
                    If the widget is still not visible, ensure your WordPress theme doesn't have <strong>overflow: hidden</strong> on the main wrapper. We use a high Z-index to ensure the chat button floats above other elements. For best results, paste the code into the <strong>Footer</strong> area of your theme settings.
                  </p>
                </div>
              </motion.div>
            )}

            {activeTab === 'crew' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 text-center py-20">
                <h1 className="text-4xl font-black">Agent Research</h1>
                <p className="text-slate-500 mb-8">Onboard a client instantly by scanning their website. Our "Crew AI" handles everything.</p>
                <form onSubmit={handleWebsiteScan} className="max-w-md mx-auto space-y-4">
                  <div className="relative">
                    <input type="url" value={urlToScan} onChange={e => setUrlToScan(e.target.value)} placeholder="https://prospect-site.com" className="w-full p-5 bg-white border-2 rounded-[2rem] text-center font-bold outline-none focus:border-indigo-600 shadow-sm" />
                    {isScanningUrl && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                  <button type="submit" disabled={isScanningUrl} className="w-full bg-indigo-600 text-white py-5 rounded-[2rem] font-black shadow-2xl hover:brightness-110 active:scale-95 transition-all">
                    {isScanningUrl ? "Crew Working..." : "Launch High-Speed Audit"}
                  </button>
                </form>
                <div className="flex justify-center gap-6 mt-12">
                   <div className="text-center">
                      <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600 mb-2 mx-auto w-fit"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg></div>
                      <p className="text-[10px] font-black text-slate-400 uppercase">Brand Audit</p>
                   </div>
                   <div className="text-center">
                      <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600 mb-2 mx-auto w-fit"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                      <p className="text-[10px] font-black text-slate-400 uppercase">Pricing Strategy</p>
                   </div>
                   <div className="text-center">
                      <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600 mb-2 mx-auto w-fit"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                      <p className="text-[10px] font-black text-slate-400 uppercase">Smart Upsells</p>
                   </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 max-lg mx-auto py-20">
                <header className="text-center">
                  <h1 className="text-4xl font-black">Cloud Sync</h1>
                  <p className="text-slate-500 mt-2">Configure Supabase and global API credentials.</p>
                </header>
                <section className="bg-white p-10 rounded-[3rem] border shadow-sm space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Supabase Project URL</label>
                    <input value={tempSupabaseUrl} onChange={e => setTempSupabaseUrl(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm" placeholder="https://your-project.supabase.co" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Supabase Anon Key</label>
                    <input type="password" value={tempSupabaseKey} onChange={e => setTempSupabaseKey(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm" placeholder="your-anon-key" />
                  </div>
                  <div className="space-y-1 border-t pt-4 mt-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Resend API Key (Global)</label>
                    <input type="password" value={tempResendKey} onChange={e => setTempResendKey(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm" placeholder="re_your_key" />
                  </div>
                  <button onClick={() => { 
                    updateSupabaseConfig(tempSupabaseUrl, tempSupabaseKey); 
                    localStorage.setItem('RESEND_API_KEY', tempResendKey);
                    setConfig(prev => ({ 
                      ...prev, 
                      leadGenConfig: { ...prev.leadGenConfig, resendApiKey: tempResendKey } 
                    }));
                    setCloudEnabled(true); 
                    alert("Configuration Applied & Saved."); 
                  }} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black mt-4 shadow-xl shadow-indigo-100 hover:brightness-110 active:scale-95 transition-all">Apply Configuration</button>
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
