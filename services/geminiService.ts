
import { GoogleGenAI, Type } from "@google/genai";
import { EstimateTask, EstimationResult, BusinessConfig, RecommendedService, ManualPriceItem, ColdEmailResult, ProductPricingResult, DetailedProposalResult, EmailTemplateConfig } from "../types";

/**
 * Robust JSON extraction from AI responses.
 * Finds the first '{' and last '}' to strip away any conversational preamble.
 */
const cleanJson = (text: string) => {
  let cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    cleaned = cleaned.substring(start, end + 1);
  }
  return cleaned;
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
 * HIGH-SPEED MASTER CREW SCAN
 * Using gemini-2.5-flash for maximum speed and compatibility with user key.
 */
export const performMasterScan = async (url: string, customInstruction?: string): Promise<Partial<BusinessConfig>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Audit this business website immediately: ${url}.
    
    USER DIRECTIVE: ${customInstruction || ""}

    Return a JSON config object containing:
    1. name, industry, primaryColor (hex).
    2. services (array of top 6 services).
    3. pricingRules (concise string).
    4. pricingKnowledgeBase (concise string).
    5. manualPriceList (3 example items with id, label, price).
    6. curatedRecommendations (3 upsell items with id, label, description, suggestedPrice, isApproved: true).
    7. suggestedQuestions (Exactly 3 TWO-WORD questions like "Fix leak?").

    Format as pure JSON.`,
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
        required: ['name', 'industry', 'primaryColor', 'services', 'pricingRules', 'pricingKnowledgeBase', 'manualPriceList', 'curatedRecommendations', 'suggestedQuestions']
      }
    }
  });
  return JSON.parse(cleanJson(response.text));
};

export const generateDetailedProposal = async (targetUrl: string, config: BusinessConfig): Promise<DetailedProposalResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Generate an enterprise proposal for ${targetUrl} based on our AI estimation SaaS.
    
    ${getTemplateInstructions(config.emailTemplate)}
    
    Instructions: ${config.proposalInstructions || "High ROI focus."}

    Return JSON with title, executiveSummary, businessAnalysis, solutionArchitecture, roiAnalysis, investmentTableHtml, requirements (array), nextSteps, and htmlFull (full branded template).`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json'
    }
  });
  return JSON.parse(cleanJson(response.text));
};

export const generateColdEmail = async (targetUrl: string, config: BusinessConfig): Promise<ColdEmailResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Conversion email for ${targetUrl}. 
    ${getTemplateInstructions(config.emailTemplate)}
    Instructions: ${config.outreachInstructions || "Focus on speed."}
    Return JSON with 'subject' and 'html' (full branded template).`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json'
    }
  });
  return JSON.parse(cleanJson(response.text));
};

export const getEstimate = async (task: EstimateTask, config: BusinessConfig): Promise<EstimationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Estimate for ${config.name}: ${task.description}. Zip: ${task.zipCode}.
    ${getTemplateInstructions(config.emailTemplate)}
    Return JSON with estimatedCostRange, laborEstimate, materialsEstimate, timeEstimate, tasks (array), emailHtml (full branded template).`,
    config: {
      responseMimeType: 'application/json'
    }
  });
  return JSON.parse(cleanJson(response.text));
};

export const dispatchResendQuote = async (leadInfo: any, estimate: EstimationResult, config: BusinessConfig) => {
  return { success: true };
};

export const generateProductPricing = async (): Promise<ProductPricingResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Return JSON with 3 SaaS pricing plans for an AI widget business. Include 'analysis' (string) and 'plans' (array).`,
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
