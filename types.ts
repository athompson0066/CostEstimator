
export interface MenuItem {
  label: string;
  url: string;
}

export interface EmailTemplateConfig {
  headerBgColor: string;
  footerBgColor: string;
  bannerUrl: string;
  logoUrl: string;
  logoSize: string;
  promoTitle: string;
  promoDescription: string;
  menuItems: MenuItem[];
}

export interface EstimationResult {
  estimatedCostRange: string;
  baseMinCost: number;
  baseMaxCost: number;
  laborEstimate: string;
  materialsEstimate: string;
  timeEstimate: string;
  tasks: string[];
  recommendations: string[];
  caveats: string[];
  upsellServices: string[];
  emailHtml: string; 
}

export interface ColdEmailResult {
  subject: string;
  html: string;
  recipientName: string;
  businessName: string;
}

export interface ManualPriceItem {
  id: string;
  label: string;
  price: string;
}

export interface RecommendedService {
  id: string;
  label: string;
  description: string;
  suggestedPrice: string;
  isApproved: boolean;
}

export interface LeadField {
  visible: boolean;
  required: boolean;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  toNumber: string;
}

export interface LeadGenConfig {
  enabled: boolean;
  destination: 'email' | 'sheet' | 'slack' | 'webhook';
  targetEmail: string;
  resendApiKey: string;
  webhookUrl: string;
  slackWebhookUrl: string;
  twilioConfig: TwilioConfig;
  successMessage?: string;
  customFieldLabel?: string;
  fields: {
    name: LeadField;
    email: LeadField;
    phone: LeadField;
    city: LeadField;
    company: LeadField;
    notes: LeadField;
    customField: LeadField;
    serviceType: LeadField;
    date: LeadField;
    time: LeadField;
  };
}

export type WidgetIconType = 'calculator' | 'wrench' | 'home' | 'sparkles' | 'chat' | 'currency';

export interface BusinessConfig {
  name: string;
  industry: string;
  primaryColor: string;
  headerTitle: string;
  headerSubtitle: string;
  profilePic: string;
  hoverTitle: string;
  hoverTitleBgColor: string;
  widgetIcon: WidgetIconType;
  services: string[];
  locationContext: string;
  pricingRules: string;
  pricingKnowledgeBase: string; 
  customAgentInstruction: string; 
  outreachInstructions?: string;
  proposalInstructions?: string;
  googleSheetUrl?: string;
  useSheetData: boolean;
  manualPriceList: ManualPriceItem[];
  curatedRecommendations: RecommendedService[];
  suggestedQuestions: string[]; // New field for the 3 two-word questions
  upsellInstructions?: string;
  leadGenConfig: LeadGenConfig;
  defaultLanguage: string;
  supportedLanguages: string[];
  resendApiKey?: string;
  pricingSpreadsheetCsv?: string;
  emailTemplate?: EmailTemplateConfig;
}

export interface SavedWidget {
  id: string;
  user_id: string;
  name: string;
  config: BusinessConfig;
  created_at: string;
  updated_at: string;
}

export interface ProductPricingPlan {
  name: string;
  setupFee: string;
  monthlySubscription: string;
  features: string[];
  targetAudience: string;
  strategicValue: string;
}

export interface ProductPricingResult {
  analysis: string;
  plans: ProductPricingPlan[];
}

export interface DetailedProposalResult {
  title: string;
  executiveSummary: string;
  businessAnalysis: string;
  solutionArchitecture: string;
  roiAnalysis: string;
  investmentTableHtml: string;
  requirements: string[];
  nextSteps: string;
  htmlFull?: string;
}

export interface AppFeature {
  id: string;
  label: string;
  description: string;
  icon: string;
}

export interface EstimateTask {
  description: string;
  urgency: 'same-day' | 'next-day' | 'within-3-days' | 'flexible';
  zipCode: string;
  image?: string; 
  language?: string; 
}

export enum WidgetState {
  CLOSED = 'CLOSED',
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  RESULT = 'RESULT',
  LEAD_FORM = 'LEAD_FORM',
  SUCCESS = 'SUCCESS'
}

export type AppTab = 'dashboard' | 'crew' | 'services' | 'upsells' | 'outreach' | 'proposals' | 'leads' | 'pricing-strategist' | 'design' | 'embed' | 'settings';
