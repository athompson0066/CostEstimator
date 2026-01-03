
import { GoogleGenAI, Type } from "@google/genai";
import { EstimateTask, EstimationResult, BusinessConfig, RecommendedService, ManualPriceItem, ColdEmailResult, ProductPricingResult, DetailedProposalResult, EmailTemplateConfig } from "../types";

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
 * Combines Brand Audit, Market Analysis, Pricing Architecture, and Upsell Strategy into one call.
 */
export const performMasterScan = async (url: string, customInstruction?: string): Promise<Partial<BusinessConfig>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `You are the Lead Coordinator for a "SaaS Enterprise Crew". Perform a high-speed comprehensive audit of: ${url}.
    
    USER DIRECTIVE: ${customInstruction || ""}

    YOUR CREW MEMBERS:
    1. Brand Auditor: Extracts name, industry, primary colors, and visual identity.
    2. Market Pricing Analyst: Scans for pricing patterns and sets a competitive labor/service rate structure.
    3. Product Strategist: Identifies core service categories and creates a "Manual Pricing Rules" list.
    4. Sales Architect: Suggests high-margin "Smart Upsells" that align with their business model.
    5. User Experience Specialist: Creates exactly 3 suggested questions that a user might ask the agent. EACH question must be exactly TWO WORDS (e.g., "Price leak?", "Labor rate?", "Emergency repair?").

    Return a comprehensive JSON config object.`,
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
          suggestedQuestions: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING }, 
            minItems: 3, 
            maxItems: 3,
            description: "Exactly 3 two-word questions customized for the client's pricing and services."
          },
          manualPriceList: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                price: { type: Type.STRING }
              },
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
  return JSON.parse(response.text);
};

export const generateDetailedProposal = async (targetUrl: string, config: BusinessConfig): Promise<DetailedProposalResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `You are leading the "Award-Winning Enterprise Proposal Crew".
    Target Prospect Website: ${targetUrl}.
    
    ${getTemplateInstructions(config.emailTemplate)}
    
    ADMIN STRATEGY / CUSTOM INSTRUCTIONS: ${config.proposalInstructions || "Generate a high-end enterprise proposal focusing on ROI and conversion metrics."}

    The Crew must generate:
    - title: Catchy proposal name.
    - executiveSummary: Vision for ${targetUrl}.
    - businessAnalysis: Pain point analysis of their current site.
    - solutionArchitecture: Custom EstimateAI features for them.
    - roiAnalysis: Calculated revenue lift.
    - investmentTableHtml: Clean HTML table for costs.
    - requirements: List of assets needed.
    - nextSteps: Closing call to action.
    - htmlFull: A COMPLETE, stylized HTML document using the template above.

    Return the result as a JSON object matching the DetailedProposalResult interface.`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          executiveSummary: { type: Type.STRING },
          businessAnalysis: { type: Type.STRING },
          solutionArchitecture: { type: Type.STRING },
          roiAnalysis: { type: Type.STRING },
          investmentTableHtml: { type: Type.STRING },
          requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
          nextSteps: { type: Type.STRING },
          htmlFull: { type: Type.STRING }
        },
        required: ['title', 'executiveSummary', 'businessAnalysis', 'solutionArchitecture', 'roiAnalysis', 'investmentTableHtml', 'requirements', 'nextSteps', 'htmlFull']
      }
    }
  });
  return JSON.parse(response.text);
};

export const generateColdEmail = async (targetUrl: string, config: BusinessConfig): Promise<ColdEmailResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `You are the "Conversion Copywriter" for Aiolos Media pitching to ${targetUrl}.
    
    ${getTemplateInstructions(config.emailTemplate)}
    
    ADMIN STRATEGY / CUSTOM INSTRUCTIONS: ${config.outreachInstructions || "Focus on speed to quote."}
    
    Requirements:
    - Email Body: ~300 words.
    - html: The full HTML for the email following the template structure.

    Return JSON with 'subject' and 'html'.`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING },
          html: { type: Type.STRING },
          recipientName: { type: Type.STRING },
          businessName: { type: Type.STRING }
        },
        required: ['subject', 'html', 'recipientName', 'businessName']
      }
    }
  });
  return JSON.parse(response.text);
};

export const getEstimate = async (task: EstimateTask, config: BusinessConfig): Promise<EstimationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `You are the Estimation Agent for ${config.name}. 
  Task: ${task.description}. Zip: ${task.zipCode}. Urgency: ${task.urgency}.
  
  ${getTemplateInstructions(config.emailTemplate)}
  
  Provide a detailed estimate.
  ALSO, generate a COMPLETE 'emailHtml' that follows the Mandatory Branding structure above. 
  The email content should be a professional response to the customer's quote request, including the cost breakdown.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          estimatedCostRange: { type: Type.STRING },
          baseMinCost: { type: Type.NUMBER },
          baseMaxCost: { type: Type.NUMBER },
          laborEstimate: { type: Type.STRING },
          materialsEstimate: { type: Type.STRING },
          timeEstimate: { type: Type.STRING },
          tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          caveats: { type: Type.ARRAY, items: { type: Type.STRING } },
          upsellServices: { type: Type.ARRAY, items: { type: Type.STRING } },
          emailHtml: { type: Type.STRING }
        },
        required: ['estimatedCostRange', 'baseMinCost', 'baseMaxCost', 'laborEstimate', 'materialsEstimate', 'timeEstimate', 'tasks', 'recommendations', 'caveats', 'upsellServices', 'emailHtml']
      }
    }
  });
  return JSON.parse(response.text);
};

export const dispatchResendQuote = async (leadInfo: any, estimate: EstimationResult, config: BusinessConfig) => {
  console.log("Dispatching Branded Email Quote to:", leadInfo.email);
  return { success: true };
};

export const generateProductPricing = async (): Promise<ProductPricingResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Design 3 pricing tiers for an AI estimation widget SaaS business. Include a detailed analysis string and an array of plan objects.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          analysis: { type: Type.STRING },
          plans: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                setupFee: { type: Type.STRING },
                monthlySubscription: { type: Type.STRING },
                features: { type: Type.ARRAY, items: { type: Type.STRING } },
                targetAudience: { type: Type.STRING },
                strategicValue: { type: Type.STRING }
              },
              required: ['name', 'setupFee', 'monthlySubscription', 'features', 'targetAudience', 'strategicValue']
            }
          }
        },
        required: ['analysis', 'plans']
      }
    }
  });
  return JSON.parse(response.text);
};

export const generateSpreadsheetData = async (config: BusinessConfig): Promise<string> => {
  return "Category,Service,Price,Hours\nCore,Handyman,$85,1";
};

// Deprecated separate calls - using performMasterScan instead for speed
export const analyzeWebsite = async (url: string, customInstruction?: string) => performMasterScan(url, customInstruction);
export const generatePricingStrategy = async (url: string, config: BusinessConfig) => ({ pricingKnowledgeBase: '', suggestedManualItems: [] });
export const generateAIRecommendations = async (url: string, config: BusinessConfig) => [];
