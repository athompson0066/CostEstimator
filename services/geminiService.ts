
import { GoogleGenAI, Type } from "@google/genai";
import { EstimateTask, EstimationResult, BusinessConfig, RecommendedService, ManualPriceItem, ColdEmailResult, ProductPricingResult, DetailedProposalResult, EmailTemplateConfig } from "../types";

/**
 * Robust JSON extraction from AI responses.
 * Finds the first '{' and last '}' to strip away any conversational preamble.
 */
const cleanJson = (text: string) => {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      return text.substring(start, end + 1);
    }
    return text.trim();
  } catch (e) {
    return text;
  }
};

const getTemplateInstructions = (config?: EmailTemplateConfig) => {
  const c = config || {
    headerBgColor: "#000000",
    footerBgColor: "#f1f5f9",
    bannerUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=600&h=250&auto=format&fit=crop",
    logoUrl: "https://www.aiolosmedia.com/public_uploads/689e0c06e8220.png",
    logoSize: "32px",
    promoTitle: "Instant Quotes",
    promoDescription: "Get accurate cost estimations in seconds with our advanced AI-powered project assessment platform today.",
    menuItems: [{ label: "Solutions", url: "#" }, { label: "Pricing", url: "#" }, { label: "Contact", url: "#" }]
  };

  const menuHtml = c.menuItems.map(m => `<a href="${m.url}" style="color: #ffffff; text-decoration: none; font-weight: bold; margin-left: 15px;">${m.label}</a>`).join("");

  return `
MANDATORY HTML STRUCTURE (Branding):
1. HEADER: Background ${c.headerBgColor}. Left Logo: ${c.logoUrl}. Logo Height: ${c.logoSize || '32px'}. Right: Navigation containing the following links: ${menuHtml}.
2. BANNER: Full-width Image: ${c.bannerUrl}.
3. PROMOTIONAL STRIP: Title: "${c.promoTitle}". Description (exactly 15 words): "${c.promoDescription}".
4. BODY: #ffffff background.
5. FOOTER: Background ${c.footerBgColor}. Text: "© 2025 Aiolos Media | aiolosmedia.com".
`;
};

/**
 * ULTRA-HIGH-SPEED MASTER CREW SCAN
 * Using gemini-2.5-flash-lite-latest to avoid Vercel 10s timeouts.
 */
export const performMasterScan = async (url: string, customInstruction?: string): Promise<Partial<BusinessConfig>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite-latest',
    contents: `QUICK AUDIT: ${url}. 
    USER NOTE: ${customInstruction || ""}
    
    TASK: Extract brand identity, 4-6 services, and typical pricing for this business. 
    REQUIRED: Return a JSON object with: name, industry, primaryColor, services (array), pricingRules, manualPriceList (3 items), curatedRecommendations (3 items), suggestedQuestions (3 two-word questions).`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          industry: { type: Type.STRING },
          primaryColor: { type: Type.STRING },
          services: { type: Type.ARRAY, items: { type: Type.STRING } },
          pricingRules: { type: Type.STRING },
          pricingKnowledgeBase: { type: Type.STRING },
          headerTitle: { type: Type.STRING },
          headerSubtitle: { type: Type.STRING },
          locationContext: { type: Type.STRING },
          hoverTitle: { type: Type.STRING },
          suggestedQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          manualPriceList: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { id: { type: Type.STRING }, label: { type: Type.STRING }, price: { type: Type.STRING } },
              required: ['id', 'label', 'price']
            }
          },
          curatedRecommendations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                description: { type: Type.STRING },
                suggestedPrice: { type: Type.STRING },
                isApproved: { type: Type.BOOLEAN }
              },
              required: ['id', 'label', 'description', 'suggestedPrice', 'isApproved']
            }
          }
        },
        required: ['name', 'industry', 'primaryColor', 'services', 'pricingRules', 'manualPriceList', 'curatedRecommendations', 'suggestedQuestions']
      }
    }
  });
  return JSON.parse(cleanJson(response.text));
};

export const generateDetailedProposal = async (targetUrl: string, config: BusinessConfig): Promise<DetailedProposalResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite-latest',
    contents: `Proposal for ${targetUrl}. ${getTemplateInstructions(config.emailTemplate)} 
    Return JSON with all proposal fields including htmlFull.`,
    config: { tools: [{ googleSearch: {} }], responseMimeType: 'application/json' }
  });
  return JSON.parse(cleanJson(response.text));
};

export const generateColdEmail = async (targetUrl: string, config: BusinessConfig): Promise<ColdEmailResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite-latest',
    contents: `Cold email for ${targetUrl}. ${getTemplateInstructions(config.emailTemplate)}
    Return JSON with 'subject' and 'html'.`,
    config: { tools: [{ googleSearch: {} }], responseMimeType: 'application/json' }
  });
  return JSON.parse(cleanJson(response.text));
};

export const getEstimate = async (task: EstimateTask, config: BusinessConfig): Promise<EstimationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite-latest',
    contents: `Estimate for ${config.name}: ${task.description}. 
    ${getTemplateInstructions(config.emailTemplate)}
    Return JSON with cost range and emailHtml.`,
    config: { responseMimeType: 'application/json' }
  });
  return JSON.parse(cleanJson(response.text));
};

export const dispatchResendQuote = async (leadInfo: any, estimate: EstimationResult, config: BusinessConfig) => {
  return { success: true };
};

export const generateProductPricing = async (): Promise<ProductPricingResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite-latest',
    contents: `3 SaaS plans JSON.`,
    config: { responseMimeType: 'application/json' }
  });
  return JSON.parse(cleanJson(response.text));
};

export const generateSpreadsheetData = async (config: BusinessConfig): Promise<string> => {
  return "Category,Service,Price\nCore,Handyman,$85";
};

export const analyzeWebsite = async (url: string, customInstruction?: string) => performMasterScan(url, customInstruction);
export const generatePricingStrategy = async (url: string, config: BusinessConfig) => ({ pricingKnowledgeBase: '', suggestedManualItems: [] });
export const generateAIRecommendations = async (url: string, config: BusinessConfig) => [];
